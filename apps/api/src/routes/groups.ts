import type { FastifyPluginAsync } from 'fastify';
import type {
  CreateGroupRequest,
  CreateDraftGroupRequest,
  DiscoveredWaGroup,
  Group,
  GroupWithStats,
  CostStats,
  TestReplyRequest,
  TestReplyResponse,
  TestImagePreviewRequest,
  TestImagePreviewResponse,
  UpdateMemberRequest,
  UpdateRelationshipRequest,
  MergeMembersRequest,
  UserProfileData,
  LinkGroupRequest,
} from '@wavi/shared';
import { isDraftGroup } from '@wavi/shared';
import { db } from '../db/client.js';
import { listGroupChats } from '../whatsapp/client.js';
import { runRebuildFromStoredMessages, setIngestionProgress, clearIngestionProgress } from '../jobs/ingestion-pipeline.js';
import { getCostStats, recordTestChatUsage } from '../lib/cost.js';
import { generateReplyText } from '../ai/generate.js';
import { generateImage } from '../ai/generate-image.js';
import { getProfileAliases } from '../lib/alias-store.js';
import { mergeAliases, normalizeNameForMatch } from '../lib/identity.js';
import { assertWaGroupDiscoverable, createDraftWaGroupId } from '../lib/group-draft.js';
import { friendlyDbError } from '../lib/db-errors.js';

function getAgentId(): string {
  const id = process.env.AGENT_ID;
  if (!id) throw new Error('AGENT_ID not configured');
  return id;
}

const GROUP_STATS_SELECT = `
  *,
  message_count_today:messages(count),
  reply_count_today:replies(count),
  profile_count:user_profiles(count)
`;

async function getParticipantCountMap(): Promise<Map<string, number | null>> {
  try {
    const waGroups = await listGroupChats();
    return new Map(waGroups.map((g) => [g.wa_group_id, g.participant_count]));
  } catch {
    return new Map();
  }
}

function cachedMemberCount(row: Record<string, unknown>): number | null {
  const v = row.member_count;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function resolveMemberCount(waGroupId: string, isDraft: boolean, row: Record<string, unknown>, participantCounts?: Map<string, number | null>): number | null {
  if (isDraft) return null;
  const live = participantCounts?.get(waGroupId);
  if (live != null) return live;
  return cachedMemberCount(row);
}

function persistMemberCounts(groups: GroupWithStats[]) {
  const updates = groups.filter((g) => !g.is_draft && g.member_count != null);
  if (updates.length === 0) return;
  void Promise.all(updates.map((g) => db.from('groups').update({ member_count: g.member_count }).eq('id', g.id).eq('agent_id', getAgentId()))).catch(() => {});
}

async function fetchGroupRowWithStats(id: string): Promise<GroupWithStats> {
  const { data, error } = await db.from('groups').select(GROUP_STATS_SELECT).eq('id', id).eq('agent_id', getAgentId()).single();
  if (error) throw error;
  return mapGroupRow(data);
}

async function fetchGroupWithStats(id: string): Promise<GroupWithStats> {
  const [{ data, error }, participantCounts] = await Promise.all([db.from('groups').select(GROUP_STATS_SELECT).eq('id', id).eq('agent_id', getAgentId()).single(), getParticipantCountMap()]);
  if (error) throw error;
  const group = mapGroupRow(data, participantCounts);
  persistMemberCounts([group]);
  return group;
}

function mapGroupRowFromUpdate(updated: Record<string, unknown>): GroupWithStats {
  return mapGroupRow({
    ...updated,
    message_count_today: [{ count: 0 }],
    reply_count_today: [{ count: 0 }],
    profile_count: [{ count: 0 }],
  });
}

function mapGroupRow(row: Record<string, unknown>, participantCounts?: Map<string, number | null>): GroupWithStats {
  const msgCount = row.message_count_today as { count: number }[] | undefined;
  const replyCount = row.reply_count_today as { count: number }[] | undefined;
  const profileCount = row.profile_count as { count: number }[] | undefined;
  const { message_count_today: _m, reply_count_today: _r, profile_count: _p, ...rest } = row;
  const waGroupId = String(rest.wa_group_id ?? '');
  const isDraft = isDraftGroup(waGroupId);
  const memberCount = resolveMemberCount(waGroupId, isDraft, rest, participantCounts);

  return {
    ...(rest as unknown as Group),
    web_search_enabled: Boolean(rest.web_search_enabled ?? false),
    image_generation_enabled: Boolean(rest.image_generation_enabled ?? false),
    is_draft: isDraft,
    member_count: memberCount,
    profile_count: profileCount?.[0]?.count ?? 0,
    message_count_today: msgCount?.[0]?.count ?? 0,
    reply_count_today: replyCount?.[0]?.count ?? 0,
    last_activity: null,
  };
}

const DEFAULT_TEST_SENDER_NAME = 'Tester';
const DEFAULT_TEST_SENDER_WA_ID = 'test-admin';

function mapTestHistoryToExtraTurns(history: TestReplyRequest['history']) {
  return (history ?? []).map((turn) => ({
    role: turn.role,
    content: turn.role === 'user' && turn.sender_name ? `${turn.sender_name}: ${turn.content}` : turn.content,
  }));
}

// ── Groups route ─────────────────────────────────────────────
export const groupsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    const [{ data }, participantCounts] = await Promise.all([
      db.from('groups').select(GROUP_STATS_SELECT).eq('agent_id', getAgentId()).order('created_at', { ascending: false }).throwOnError(),
      getParticipantCountMap(),
    ]);
    const mapped = (data ?? []).map((row) => mapGroupRow(row, participantCounts));
    persistMemberCounts(mapped);
    return mapped;
  });

  // Must be registered before /:id
  fastify.get('/cost', async () => {
    const stats: CostStats = await getCostStats(getAgentId());
    return stats;
  });

  fastify.get('/discover', async (_req, reply) => {
    try {
      const waGroups = await listGroupChats();
      const { data: registered } = await db.from('groups').select('id, wa_group_id, status').eq('agent_id', getAgentId()).throwOnError();

      const regMap = new Map((registered ?? []).filter((r) => !isDraftGroup(r.wa_group_id)).map((r) => [r.wa_group_id, r]));

      const result: DiscoveredWaGroup[] = waGroups.map((g) => {
        const existing = regMap.get(g.wa_group_id);
        return {
          wa_group_id: g.wa_group_id,
          name: g.name,
          participant_count: g.participant_count,
          last_activity: g.last_activity,
          registered: !!existing,
          group_id: existing?.id ?? null,
          status: existing?.status ?? null,
        };
      });

      return result.sort((a, b) => {
        if (a.registered !== b.registered) return a.registered ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WhatsApp not connected';
      return reply.code(503).send({ error: message });
    }
  });

  fastify.post<{ Body: CreateGroupRequest }>('/', async (req, reply) => {
    const { wa_group_id, name } = req.body ?? {};

    if (!wa_group_id?.trim()) {
      return reply.code(400).send({ error: 'wa_group_id is required' });
    }

    if (isDraftGroup(wa_group_id.trim())) {
      return reply.code(400).send({ error: 'Invalid wa_group_id' });
    }

    const { data: existing } = await db.from('groups').select('id').eq('wa_group_id', wa_group_id.trim()).maybeSingle();

    if (existing) {
      return reply.code(409).send({ error: 'This group is already registered' });
    }

    const { data, error } = await db
      .from('groups')
      .insert({
        agent_id: getAgentId(),
        wa_group_id: wa_group_id.trim(),
        name: name?.trim() || 'Unnamed group',
        status: 'pending_setup',
        // Hebrew is the actively-tuned default; operators can switch in settings.
        language_mode: 'he',
      })
      .select()
      .single();

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    return fetchGroupWithStats(data.id);
  });

  fastify.post<{ Body: CreateDraftGroupRequest }>('/draft', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const { data, error } = await db
      .from('groups')
      .insert({
        agent_id: getAgentId(),
        wa_group_id: createDraftWaGroupId(),
        name,
        status: 'pending_setup',
        language_mode: 'he',
      })
      .select()
      .single();

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    return fetchGroupWithStats(data.id);
  });

  fastify.post<{ Params: { id: string }; Body: LinkGroupRequest }>('/:id/link', async (req, reply) => {
    const { id } = req.params;
    const waGroupId = req.body?.wa_group_id?.trim();
    if (!waGroupId) {
      return reply.code(400).send({ error: 'wa_group_id is required' });
    }
    if (isDraftGroup(waGroupId)) {
      return reply.code(400).send({ error: 'Invalid wa_group_id' });
    }

    const { data: group } = await db.from('groups').select('id, wa_group_id, status').eq('id', id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });
    if (!isDraftGroup(group.wa_group_id)) {
      return reply.code(409).send({ error: 'Group is already linked to WhatsApp' });
    }

    const { data: taken } = await db.from('groups').select('id').eq('wa_group_id', waGroupId).neq('id', id).maybeSingle();
    if (taken) {
      return reply.code(409).send({ error: 'This WhatsApp group is already registered' });
    }

    try {
      await assertWaGroupDiscoverable(waGroupId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WhatsApp not connected';
      return reply.code(400).send({ error: message });
    }

    const updates: Record<string, string> = { wa_group_id: waGroupId };
    if (req.body?.name?.trim()) {
      updates.name = req.body.name.trim();
    }

    const { error } = await db.from('groups').update(updates).eq('id', id).eq('agent_id', getAgentId()).select().single();
    if (error) return reply.code(500).send({ error: error.message });

    return fetchGroupWithStats(id);
  });

  fastify.post<{ Params: { id: string } }>('/:id/unlink', async (req, reply) => {
    const { id } = req.params;

    const { data: group } = await db.from('groups').select('id, wa_group_id, status').eq('id', id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });
    if (isDraftGroup(group.wa_group_id)) {
      return reply.code(409).send({ error: 'Group is not linked to WhatsApp' });
    }
    if (group.status !== 'pending_setup') {
      return reply.code(400).send({ error: 'Only groups in setup can be unlinked. Pause or finish setup first.' });
    }

    const { error } = await db.from('groups').update({ wa_group_id: createDraftWaGroupId() }).eq('id', id).eq('agent_id', getAgentId()).select().single();

    if (error) return reply.code(500).send({ error: error.message });

    return fetchGroupWithStats(id);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (req) => {
    const [{ data }, participantCounts] = await Promise.all([
      db.from('groups').select(GROUP_STATS_SELECT).eq('id', req.params.id).eq('agent_id', getAgentId()).single().throwOnError(),
      getParticipantCountMap(),
    ]);
    return mapGroupRow(data, participantCounts);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params;

    const { data: group } = await db.from('groups').select('id').eq('id', id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    // replies.group_id has no ON DELETE CASCADE — clear before deleting the group row.
    const { error: repliesError } = await db.from('replies').delete().eq('group_id', id);
    if (repliesError) return reply.code(500).send({ error: repliesError.message });

    const { error } = await db.from('groups').delete().eq('id', id).eq('agent_id', getAgentId());
    if (error) return reply.code(500).send({ error: error.message });

    await clearIngestionProgress(id).catch(() => {});

    return { ok: true };
  });

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', async (req, reply) => {
    const allowed = ['character_config', 'status', 'character_locked', 'language_mode', 'web_search_enabled', 'image_generation_enabled', 'name'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

    if (Object.keys(update).length === 0) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }

    if (update.status === 'active') {
      const { data: current } = await db.from('groups').select('wa_group_id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
      if (!current) return reply.code(404).send({ error: 'Group not found' });
      if (isDraftGroup(current.wa_group_id)) {
        return reply.code(400).send({ error: 'Connect this group to WhatsApp before going live.' });
      }
    }

    const { data: updated, error } = await db.from('groups').update(update).eq('id', req.params.id).eq('agent_id', getAgentId()).select().single();

    if (error) {
      req.log.warn({ err: error, groupId: req.params.id, update }, '[Groups] PATCH update failed');
      return reply.code(500).send({ error: friendlyDbError(error) });
    }

    try {
      return await fetchGroupRowWithStats(req.params.id);
    } catch (fetchErr) {
      req.log.warn({ err: fetchErr, groupId: req.params.id }, '[Groups] PATCH stats refetch failed');
      if (updated) {
        return mapGroupRowFromUpdate(updated as Record<string, unknown>);
      }
      const message = fetchErr instanceof Error ? fetchErr.message : 'Failed to load updated group';
      return reply.code(500).send({ error: friendlyDbError({ message }) });
    }
  });

  // ── POST /:id/rebuild — regenerate intelligence from stored messages ──
  // Reuses the ingestion SSE progress stream (GET /api/ingest/:id/progress)
  // since rebuild writes to the same Redis progress key.
  fastify.post<{ Params: { id: string }; Body: { full_reset?: boolean } }>('/:id/rebuild', async (req, reply) => {
    const { id } = req.params;

    const { data: group } = await db.from('groups').select('id').eq('id', id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { count } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('group_id', id).eq('is_agent_reply', false);

    if (!count || count === 0) {
      return reply.code(400).send({ error: 'No stored messages to rebuild from. Upload chat history first.' });
    }

    // Reset progress before responding so a freshly-opened SSE stream
    // doesn't immediately observe a stale 'done' from a previous run.
    await setIngestionProgress(id, { stage: 'parsing', total_messages: count });

    reply.send({ ok: true, message: 'Rebuild started', total_messages: count });

    runRebuildFromStoredMessages(id, { mode: req.body?.full_reset ? 'full_reset' : 'merge' }).catch((err) => {
      console.error('[Rebuild] Failed:', err);
    });
  });

  // Test reply preview (no WhatsApp delivery, no DB writes)
  fastify.post<{ Params: { id: string }; Body: TestReplyRequest }>('/:id/test-reply', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const message = req.body?.message?.trim();
    if (!message) return reply.code(400).send({ error: 'message is required' });

    const senderName = req.body.sender_name?.trim() || DEFAULT_TEST_SENDER_NAME;
    const senderWaId = req.body.sender_wa_id?.trim() || DEFAULT_TEST_SENDER_WA_ID;
    const extraTurns = mapTestHistoryToExtraTurns(req.body.history);

    const startTime = Date.now();
    const { replyText, imagePrompt, imageCaption, inputTokens, outputTokens } = await generateReplyText({
      groupId: req.params.id,
      senderWaId,
      senderName,
      body: message,
      extraTurns,
    });

    const result: TestReplyResponse = {
      reply: replyText,
      latency_ms: Date.now() - startTime,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      ...(imagePrompt ? { image_prompt: imagePrompt, image_caption: imageCaption } : {}),
    };

    await recordTestChatUsage(inputTokens, outputTokens);

    return result;
  });

  // On-demand DALL-E preview for test chat (no DB writes, no WhatsApp delivery)
  fastify.post<{ Params: { id: string }; Body: TestImagePreviewRequest }>('/:id/preview-image', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id, image_generation_enabled').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });
    if (!group.image_generation_enabled) {
      return reply.code(403).send({ error: 'Image generation is not enabled for this group' });
    }

    const prompt = req.body?.prompt?.trim();
    if (!prompt) return reply.code(400).send({ error: 'prompt is required' });

    const image = await generateImage(prompt);
    const result: TestImagePreviewResponse = {
      image_base64: image.buffer.toString('base64'),
      mimetype: image.mimetype,
    };
    return result;
  });

  // Messages (cursor pagination — latest first, load older via ?before=)
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; before?: string };
  }>('/:id/messages', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);

    let q = db
      .from('messages')
      .select('id, group_id, sender_wa_id, sender_name, body, is_agent_reply, flagged_miss, timestamp, created_at')
      .eq('group_id', req.params.id)
      .order('timestamp', { ascending: false })
      .limit(limit + 1);

    if (req.query.before) {
      q = q.lt('timestamp', req.query.before);
    }

    const { data } = await q.throwOnError();
    const rows = data ?? [];
    const has_more = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();

    return { messages, has_more };
  });

  // Members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data } = await db.from('user_profiles').select('*').eq('group_id', req.params.id).order('msg_count', { ascending: false }).throwOnError();
    return data;
  });

  fastify.patch<{ Params: { id: string; profileId: string }; Body: UpdateMemberRequest }>('/:id/members/:profileId', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data: profile } = await db.from('user_profiles').select('*').eq('id', req.params.profileId).eq('group_id', req.params.id).maybeSingle();
    if (!profile) return reply.code(404).send({ error: 'Member not found' });

    const body = req.body ?? {};
    const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };
    const profileData = { ...(profile.profile_data as UserProfileData) };

    if (body.display_name?.trim()) {
      const newName = body.display_name.trim();
      if (newName !== profile.display_name) {
        // Keep the previous label as an alias so Wavi still recognizes old references
        profileData.aliases = mergeAliases(getProfileAliases(profileData), profile.display_name ?? '').filter((a) => normalizeNameForMatch(a) !== normalizeNameForMatch(newName));
        profileData.curation = { ...profileData.curation, display_name_locked: true };
        updates.profile_data = profileData;
      }
      updates.display_name = newName;
    }

    const aliasInputs = [...(body.add_aliases ?? []), ...(body.add_alias?.trim() ? [body.add_alias.trim()] : [])];
    if (aliasInputs.length) {
      const expanded = aliasInputs.flatMap((raw) =>
        raw
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
      profileData.aliases = mergeAliases(getProfileAliases(profileData), ...expanded);
      updates.profile_data = profileData;
    }

    if (body.remove_alias?.trim()) {
      const norm = normalizeNameForMatch(body.remove_alias);
      profileData.aliases = getProfileAliases(profileData).filter((a) => normalizeNameForMatch(a) !== norm);
      updates.profile_data = profileData;
    }

    if (body.behavioral_summary !== undefined) {
      updates.behavioral_summary = body.behavioral_summary.trim();
      profileData.curation = { ...profileData.curation, summary_locked: true };
      updates.profile_data = profileData;
    }

    const { data, error } = await db.from('user_profiles').update(updates).eq('id', req.params.profileId).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.delete<{ Params: { id: string; profileId: string } }>('/:id/members/:profileId', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data: profile } = await db.from('user_profiles').select('id, wa_user_id').eq('id', req.params.profileId).eq('group_id', req.params.id).maybeSingle();
    if (!profile) return reply.code(404).send({ error: 'Member not found' });

    const waUserId = profile.wa_user_id;
    const { error: relError } = await db.from('relationship_map').delete().eq('group_id', req.params.id).or(`user_a_wa_id.eq.${waUserId},user_b_wa_id.eq.${waUserId}`);
    if (relError) return reply.code(500).send({ error: relError.message });

    const { error } = await db.from('user_profiles').delete().eq('id', profile.id).eq('group_id', req.params.id);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  fastify.post<{ Params: { id: string }; Body: MergeMembersRequest }>('/:id/members/merge', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { keep_profile_id, merge_profile_id } = req.body ?? {};
    if (!keep_profile_id || !merge_profile_id || keep_profile_id === merge_profile_id) {
      return reply.code(400).send({ error: 'keep_profile_id and merge_profile_id are required and must differ' });
    }

    const { data: keep } = await db.from('user_profiles').select('*').eq('id', keep_profile_id).eq('group_id', req.params.id).maybeSingle();
    const { data: merge } = await db.from('user_profiles').select('*').eq('id', merge_profile_id).eq('group_id', req.params.id).maybeSingle();

    if (!keep || !merge) return reply.code(404).send({ error: 'One or both profiles not found' });

    const keepData = keep.profile_data as UserProfileData;
    const mergeData = merge.profile_data as UserProfileData;
    const mergedAliases = mergeAliases(getProfileAliases(keepData), merge.display_name, merge.wa_user_id, ...getProfileAliases(mergeData));

    await db
      .from('user_profiles')
      .update({
        msg_count: (keep.msg_count ?? 0) + (merge.msg_count ?? 0),
        profile_data: { ...keepData, aliases: mergedAliases },
        last_updated: new Date().toISOString(),
      })
      .eq('id', keep.id);

    // Rewire relationship rows from merged id → kept id
    const oldId = merge.wa_user_id;
    const newId = keep.wa_user_id;
    const { data: relRows } = await db.from('relationship_map').select('*').eq('group_id', req.params.id).or(`user_a_wa_id.eq.${oldId},user_b_wa_id.eq.${oldId}`);

    for (const row of relRows ?? []) {
      let userA = row.user_a_wa_id === oldId ? newId : row.user_a_wa_id;
      let userB = row.user_b_wa_id === oldId ? newId : row.user_b_wa_id;
      if (userA === userB) {
        await db.from('relationship_map').delete().eq('id', row.id);
        continue;
      }
      let nameA = row.user_a_wa_id === oldId ? keep.display_name : row.user_a_name;
      let nameB = row.user_b_wa_id === oldId ? keep.display_name : row.user_b_name;
      if (userA > userB) {
        [userA, userB] = [userB, userA];
        [nameA, nameB] = [nameB, nameA];
      }
      await db.from('relationship_map').delete().eq('id', row.id);
      await db.from('relationship_map').upsert(
        {
          group_id: req.params.id,
          user_a_wa_id: userA,
          user_b_wa_id: userB,
          user_a_name: nameA,
          user_b_name: nameB,
          interaction_score: row.interaction_score,
          conflict_score: row.conflict_score,
          solidarity_score: row.solidarity_score,
          signals: row.signals,
          narrative: row.narrative,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'group_id,user_a_wa_id,user_b_wa_id' },
      );
    }

    await db.from('user_profiles').delete().eq('id', merge.id);

    const { data: updated } = await db.from('user_profiles').select('*').eq('id', keep.id).single();
    return updated;
  });

  // Relationships
  fastify.get<{ Params: { id: string } }>('/:id/relationships', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data } = await db.from('relationship_map').select('*').eq('group_id', req.params.id).order('interaction_score', { ascending: false }).throwOnError();
    return data;
  });

  fastify.patch<{ Params: { id: string; relationshipId: string }; Body: UpdateRelationshipRequest }>('/:id/relationships/:relationshipId', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data: relationship } = await db.from('relationship_map').select('*').eq('id', req.params.relationshipId).eq('group_id', req.params.id).maybeSingle();
    if (!relationship) return reply.code(404).send({ error: 'Relationship not found' });

    if (req.body?.narrative === undefined) return reply.code(400).send({ error: 'narrative is required' });

    const { data, error } = await db
      .from('relationship_map')
      .update({
        narrative: req.body.narrative.trim(),
        signals: {
          ...((relationship.signals as Record<string, unknown>) ?? {}),
          curation: { narrative_locked: true },
        },
        last_updated: new Date().toISOString(),
      })
      .eq('id', req.params.relationshipId)
      .select()
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.delete<{ Params: { id: string; relationshipId: string } }>('/:id/relationships/:relationshipId', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data: relationship } = await db.from('relationship_map').select('id').eq('id', req.params.relationshipId).eq('group_id', req.params.id).maybeSingle();
    if (!relationship) return reply.code(404).send({ error: 'Relationship not found' });

    const { error } = await db.from('relationship_map').delete().eq('id', req.params.relationshipId).eq('group_id', req.params.id);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // Group context
  fastify.get<{ Params: { id: string } }>('/:id/context', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data } = await db.from('group_contexts').select('*').eq('group_id', req.params.id).order('generated_at', { ascending: false }).limit(1).maybeSingle().throwOnError();
    return data;
  });

  // Memories
  fastify.get<{ Params: { id: string } }>('/:id/memories', async (req) => {
    const { data } = await db.from('group_memories').select('*').eq('group_id', req.params.id).order('created_at', { ascending: false }).throwOnError();
    return data;
  });

  fastify.delete<{ Params: { id: string; memoryId: string } }>('/:id/memories/:memoryId', async (req) => {
    await db.from('group_memories').delete().eq('id', req.params.memoryId).eq('group_id', req.params.id).throwOnError();
    return { ok: true };
  });
};

// ── Replies route ─────────────────────────────────────────────
export const repliesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req) => {
    const query = req.query as Record<string, string>;
    let q = db
      .from('replies')
      .select(
        `
        *,
        messages!replies_message_id_fkey(sender_name, body),
        groups!replies_group_id_fkey(name)
      `,
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (query.group_id) q = q.eq('group_id', query.group_id);
    if (query.flagged) q = q.eq('flagged_miss', true);

    const { data } = await q.throwOnError();
    return data;
  });

  fastify.patch<{ Params: { id: string }; Body: { flagged_miss: boolean } }>('/:id/flag', async (req) => {
    const { data } = await db.from('replies').update({ flagged_miss: req.body.flagged_miss }).eq('id', req.params.id).select().single().throwOnError();
    return data;
  });
};

// ── Health route ─────────────────────────────────────────────
export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => ({ ok: true, ts: new Date().toISOString() }));
};
