import type { FastifyPluginAsync } from 'fastify';
import type { CreateGroupRequest, DiscoveredWaGroup, Group, GroupWithStats, CostStats, TestReplyRequest, TestReplyResponse } from '@wavi/shared';
import { db } from '../db/client.js';
import { listGroupChats } from '../whatsapp/client.js';
import { runRebuildFromStoredMessages, setIngestionProgress } from '../jobs/ingestion-pipeline.js';
import { getCostStats, recordTestChatUsage } from '../lib/cost.js';
import { generateReplyText } from '../ai/generate.js';

function getAgentId(): string {
  const id = process.env.AGENT_ID;
  if (!id) throw new Error('AGENT_ID not configured');
  return id;
}

function mapGroupRow(row: Record<string, unknown>): GroupWithStats {
  const msgCount = row.message_count_today as { count: number }[] | undefined;
  const replyCount = row.reply_count_today as { count: number }[] | undefined;
  const { message_count_today: _m, reply_count_today: _r, ...rest } = row;
  return {
    ...(rest as unknown as Group),
    member_count: 0,
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
    const { data } = await db
      .from('groups')
      .select(
        `
        *,
        message_count_today:messages(count),
        reply_count_today:replies(count)
      `,
      )
      .eq('agent_id', getAgentId())
      .order('created_at', { ascending: false })
      .throwOnError();
    return (data ?? []).map(mapGroupRow);
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

      const regMap = new Map((registered ?? []).map((r) => [r.wa_group_id, r]));

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

    return mapGroupRow(data);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (req) => {
    const { data } = await db.from('groups').select('*').eq('id', req.params.id).eq('agent_id', getAgentId()).single().throwOnError();
    return mapGroupRow(data);
  });

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', async (req) => {
    const allowed = ['character_config', 'status', 'character_locked', 'language_mode', 'name'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const { data } = await db.from('groups').update(update).eq('id', req.params.id).eq('agent_id', getAgentId()).select().single().throwOnError();
    return mapGroupRow(data);
  });

  // ── POST /:id/rebuild — regenerate intelligence from stored messages ──
  // Reuses the ingestion SSE progress stream (GET /api/ingest/:id/progress)
  // since rebuild writes to the same Redis progress key.
  fastify.post<{ Params: { id: string } }>('/:id/rebuild', async (req, reply) => {
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

    runRebuildFromStoredMessages(id).catch((err) => {
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
    const { replyText, inputTokens, outputTokens } = await generateReplyText({
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
    };

    await recordTestChatUsage(inputTokens, outputTokens);

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

  // Relationships
  fastify.get<{ Params: { id: string } }>('/:id/relationships', async (req, reply) => {
    const { data: group } = await db.from('groups').select('id').eq('id', req.params.id).eq('agent_id', getAgentId()).maybeSingle();

    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { data } = await db.from('relationship_map').select('*').eq('group_id', req.params.id).order('interaction_score', { ascending: false }).throwOnError();
    return data;
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
