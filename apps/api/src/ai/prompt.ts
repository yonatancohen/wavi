import { db } from '../db/client.js';
import { embed } from '../lib/embeddings.js';
import { normalizeWebSearchQuery, searchWeb, shouldUseWebSearch } from '../lib/web-search.js';
import type { PromptContext, LanguageMode, MentionedPerson, QuotedMessageContext, UserProfileData, RelationshipPair } from '@wavi/shared';
export { buildSystemPrompt, buildConversationTurns } from './prompt-build.js';
import { messageReferencesName, namesLikelyMatch } from '../lib/identity.js';
import { getProfileAliases } from '../lib/alias-store.js';
import { classifyRagQuery, normalizeRagQuery, type RagQueryClass } from './rag-query.js';
import { usableGroupContext } from './context-quality.js';
import { expandCanonAliases, formatMemberRoster } from './name-canon.js';
import { extractInvokedNames } from './reply-grounding.js';

// Lowered from 0.35 — conversational Hebrew chunks about real events (trips,
// restaurants, etc.) often score 0.28–0.33 against a memory-recall query even
// after de-diluting the query. A false positive (slightly off-topic chunk) is
// less harmful than silently dropping a genuine memory.
const RAG_SIMILARITY_THRESHOLD = 0.28;

export { normalizeRagQuery } from './rag-query.js';

// ── Main context assembler ────────────────────────────────────

export async function buildPromptContext(params: { groupId: string; senderWaId: string; currentMessage: string; quotedMessage?: QuotedMessageContext | null }): Promise<PromptContext> {
  const { groupId, senderWaId, currentMessage, quotedMessage } = params;

  const structured = await fetchStructuredContext(groupId, senderWaId);

  // Resolve @digits mention tokens in the body to display names so Claude
  // sees "@שלומי" instead of "@193209254826011".
  const mentionNumericIds = [...currentMessage.matchAll(/@(\d{5,})/g)].map((m) => m[1]);
  // Try common JID suffix variants so we hit profiles stored from live messages.
  const mentionJidVariants = mentionNumericIds.flatMap((id) => [id, `${id}@c.us`, `${id}@lid`, `${id}@s.whatsapp.net`]);

  const resolvedNames = await resolveDisplayNames(groupId, [
    ...structured.recent_messages.map((m) => m.sender_wa_id),
    senderWaId,
    ...(quotedMessage ? [quotedMessage.sender_wa_id] : []),
    ...mentionJidVariants,
  ]);

  // Build a digits-only → displayName map covering all JID formats.
  const numericToName: Record<string, string> = {};
  for (const [fullId, name] of Object.entries(resolvedNames)) {
    numericToName[fullId.split('@')[0]] = name;
  }

  // Rewrite @digits to @DisplayName before the message reaches Claude.
  const normalizedMessage = currentMessage.replace(/@(\d{5,})/g, (_, id) => {
    const name = numericToName[id as string];
    return name ? `@${name}` : `@${id}`;
  });

  const queryClass = classifyRagQuery(normalizedMessage);
  const liveSocialAsk = queryClass === 'live_social';
  const ragQuery = normalizeRagQuery(normalizedMessage, structured.recent_messages);
  const rag = await fetchRAGContext(
    groupId,
    ragQuery,
    structured.recent_messages.map((m) => m.body),
    queryClass,
  );

  let web_search = null;
  if (structured.web_search_enabled && shouldUseWebSearch(normalizedMessage)) {
    web_search = await searchWeb(normalizeWebSearchQuery(normalizedMessage));
  }

  const { mentioned, invoked, mentionedIds } = await fetchReferencedPeople(groupId, normalizedMessage, senderWaId);
  const relevant_relationships = await mergeNamedPairRelationships(groupId, senderWaId, mentionedIds, structured.relevant_relationships);

  return {
    ...structured,
    ...rag,
    group_events: liveSocialAsk ? [] : structured.group_events,
    relevant_relationships,
    mentioned_people: mentioned,
    invoked_people: invoked,
    live_social_ask: liveSocialAsk,
    resolved_display_names: resolvedNames,
    quoted_message: quotedMessage ?? null,
    current_message: normalizedMessage,
    web_search,
  };
}

// ── Layer 1 + 3: Structured Postgres fetch ────────────────────

async function fetchStructuredContext(groupId: string, senderWaId: string) {
  const [groupResult, profileResult, relationshipsResult, memoriesResult, contextResult, messagesResult, eventsResult, groupEventsResult, rosterResult] = await Promise.all([
    db.from('groups').select('name, character_config, language_mode, web_search_enabled, image_generation_enabled').eq('id', groupId).single(),

    db.from('user_profiles').select('*').eq('group_id', groupId).eq('wa_user_id', senderWaId).single(),

    db.from('relationship_map').select('*').eq('group_id', groupId).or(`user_a_wa_id.eq.${senderWaId},user_b_wa_id.eq.${senderWaId}`).order('interaction_score', { ascending: false }).limit(3),

    db.from('group_memories').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),

    db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).single(),

    db
      .from('messages')
      .select('id, group_id, sender_wa_id, sender_name, body, is_agent_reply, flagged_miss, timestamp, created_at')
      .eq('group_id', groupId)
      .order('timestamp', { ascending: false })
      .limit(50),

    db
      .from('group_automations')
      .select('type, config, next_fire_at')
      .eq('group_id', groupId)
      .eq('enabled', true)
      .eq('type', 'scheduled_post')
      .not('next_fire_at', 'is', null)
      .order('next_fire_at', { ascending: true })
      .limit(3),

    db.from('group_events').select('*').eq('group_id', groupId).order('occurred_on', { ascending: false, nullsFirst: false }).limit(8),

    db.from('user_profiles').select('display_name, profile_data').eq('group_id', groupId),
  ]);

  const member_roster = formatMemberRoster(
    ((rosterResult.data ?? []) as Array<{ display_name: string | null; profile_data: UserProfileData | null }>)
      .map((row) =>
        expandCanonAliases({
          display_name: row.display_name?.trim() ?? '',
          aliases: getProfileAliases(row.profile_data),
        }),
      )
      .filter((person) => person.display_name),
  )
    .split('\n')
    .filter(Boolean);

  return {
    character_config: groupResult.data?.character_config ?? null,
    group_name: groupResult.data?.name ?? 'the group',
    language_mode: (groupResult.data?.language_mode ?? 'auto') as LanguageMode,
    web_search_enabled: groupResult.data?.web_search_enabled ?? false,
    image_generation_enabled: groupResult.data?.image_generation_enabled ?? false,
    sender_profile: profileResult.data ?? null,
    relevant_relationships: relationshipsResult.data ?? [],
    group_memories: memoriesResult.data ?? [],
    group_events: groupEventsResult.error ? [] : (groupEventsResult.data ?? []),
    member_roster,
    group_context_summary: usableGroupContext(contextResult.data?.summary_text),
    recent_messages: (messagesResult.data ?? []).reverse(),
    upcoming_events: ((eventsResult.data ?? []) as Array<{ type: string; config: { template?: string; frequency?: string }; next_fire_at: string }>).map((a) => ({
      label: a.config?.template ?? 'scheduled post',
      next_fire_at: a.next_fire_at,
      frequency: a.config?.frequency ?? 'weekly',
    })),
  };
}

// ── Layer 2: pgvector RAG fetch ───────────────────────────────

/** Format the msg_from / msg_to range as a concise date label for Claude. */
function formatChunkDateRange(msgFrom?: string | null, msgTo?: string | null): string {
  if (!msgFrom) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const from = fmt(msgFrom);
  if (!msgTo) return `[${from}]`;
  const to = fmt(msgTo);
  return from === to ? `[${from}]` : `[${from} – ${to}]`;
}

async function fetchRAGContext(groupId: string, query: string, recentMessageBodies: string[] = [], queryClass: RagQueryClass = 'default') {
  const queryEmbedding = await embed(query, { groupId });

  const [chunksResult, episodesResult] = await Promise.all([
    db.rpc('search_message_chunks', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 15,
    }),

    db.rpc('search_episode_summaries', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 8,
    }),
  ]);

  // True if the first 80 chars of a RAG result overlap with any recent message already in the prompt.
  const isRecentDup = (text: string) => {
    const head = text.slice(0, 80);
    return recentMessageBodies.some((body) => body.includes(head) || head.includes(body.slice(0, 80)));
  };

  type ChunkRow = { similarity: number; summary?: string; content?: string; msg_from?: string | null; msg_to?: string | null };
  type EpisodeRow = { similarity: number; summary: string; msg_from?: string | null; msg_to?: string | null };

  const rag_chunks = ((chunksResult.data ?? []) as ChunkRow[])
    .filter((r) => (r.similarity ?? 0) >= RAG_SIMILARITY_THRESHOLD)
    .filter((r) => !isRecentDup(r.summary ?? r.content ?? ''))
    .slice(0, queryClass === 'recall' ? 7 : 3)
    .map((r) => {
      const text = r.summary ?? r.content;
      if (!text) return undefined;
      const dateLabel = formatChunkDateRange(r.msg_from, r.msg_to);
      return dateLabel ? `${dateLabel}\n${text}` : text;
    })
    .filter((s): s is string => s !== undefined);

  const rag_episode_summaries = ((episodesResult.data ?? []) as EpisodeRow[])
    .filter((r) => (r.similarity ?? 0) >= RAG_SIMILARITY_THRESHOLD)
    .filter((r) => !isRecentDup(r.summary))
    .slice(0, queryClass === 'recall' ? 4 : 2)
    .map((r) => {
      const dateLabel = formatChunkDateRange(r.msg_from, r.msg_to);
      return dateLabel ? `${dateLabel}\n${r.summary}` : r.summary;
    });

  return { rag_chunks, rag_episode_summaries };
}

/** Map wa_user_id → display_name for conversation turns. */
export async function resolveDisplayNames(groupId: string, waIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(waIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data } = await db.from('user_profiles').select('wa_user_id, display_name').eq('group_id', groupId).in('wa_user_id', unique);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.wa_user_id] = row.display_name;
  }
  return map;
}

type ProfileRow = {
  wa_user_id: string;
  display_name: string | null;
  behavioral_summary?: string | null;
  profile_data: UserProfileData | null;
};

function expandedAliases(profile: ProfileRow): string[] {
  return expandCanonAliases({
    display_name: profile.display_name ?? '',
    aliases: getProfileAliases(profile.profile_data),
  }).aliases;
}

function profileMatchesInvokedName(profile: ProfileRow, invoked: string): boolean {
  const aliases = expandedAliases(profile);
  const candidates = [profile.display_name ?? '', ...aliases];
  return candidates.some((candidate) => namesLikelyMatch(candidate, invoked));
}

async function hydratePerson(groupId: string, profile: ProfileRow, invokedAs?: string): Promise<MentionedPerson> {
  const aliases = expandedAliases(profile);
  const pd = profile.profile_data;

  const [relsResult, recentResult] = await Promise.all([
    db
      .from('relationship_map')
      .select('narrative')
      .eq('group_id', groupId)
      .or(`user_a_wa_id.eq.${profile.wa_user_id},user_b_wa_id.eq.${profile.wa_user_id}`)
      .order('interaction_score', { ascending: false })
      .limit(2),
    db.from('messages').select('body').eq('group_id', groupId).eq('sender_wa_id', profile.wa_user_id).eq('is_agent_reply', false).order('timestamp', { ascending: false }).limit(5),
  ]);

  return {
    display_name: profile.display_name ?? invokedAs ?? '',
    aliases,
    behavioral_summary: profile.behavioral_summary ?? '',
    sensitivity_flags: pd?.sensitivity_flags ?? [],
    relationships: (relsResult.data ?? []).map((r) => r.narrative),
    activity_level: pd?.activity_level,
    dominant_topics: pd?.dominant_topics,
    recent_messages: (recentResult.data ?? []).map((m) => m.body as string).reverse(),
    invoked_as: invokedAs,
  };
}

async function fetchReferencedPeople(groupId: string, message: string, senderWaId: string): Promise<{ mentioned: MentionedPerson[]; invoked: MentionedPerson[]; mentionedIds: string[] }> {
  const { data: profiles } = await db.from('user_profiles').select('*').eq('group_id', groupId);
  const rows = (profiles ?? []) as ProfileRow[];
  const invokedNames = extractInvokedNames(message);

  const invokedResolved: MentionedPerson[] = [];
  const invokedIds = new Set<string>();

  for (const raw of invokedNames.slice(0, 3)) {
    const match = rows.find((p) => p.wa_user_id !== senderWaId && profileMatchesInvokedName(p, raw));
    if (match) {
      invokedIds.add(match.wa_user_id);
      invokedResolved.push(await hydratePerson(groupId, match, raw));
    } else {
      invokedResolved.push({
        display_name: raw,
        aliases: [],
        behavioral_summary: '',
        sensitivity_flags: [],
        relationships: [],
        invoked_as: raw,
      });
    }
  }

  const casual = rows.filter((p) => {
    if (p.wa_user_id === senderWaId || invokedIds.has(p.wa_user_id)) return false;
    return messageReferencesName(message, p.display_name ?? '', expandedAliases(p));
  });

  const mentioned = await Promise.all(casual.slice(0, 3).map((profile) => hydratePerson(groupId, profile)));
  const mentionedIds = [...invokedIds, ...casual.slice(0, 3).map((profile) => profile.wa_user_id)];

  return { mentioned, invoked: invokedResolved, mentionedIds };
}

/** Detect member names referenced in the message and load their context. */
export async function fetchMentionedPeople(groupId: string, message: string, senderWaId: string): Promise<MentionedPerson[]> {
  const { mentioned, invoked } = await fetchReferencedPeople(groupId, message, senderWaId);
  return [...invoked, ...mentioned];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** If the message names people, include that pair even when neither is the sender. Cap 5. */
async function mergeNamedPairRelationships(groupId: string, senderWaId: string, mentionedIds: string[], existing: RelationshipPair[]): Promise<RelationshipPair[]> {
  if (mentionedIds.length === 0) return existing.slice(0, 5);

  const ids = [...new Set([senderWaId, ...mentionedIds])];
  const wanted = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      wanted.add(pairKey(ids[i], ids[j]));
    }
  }

  const have = new Set(existing.map((r) => pairKey(r.user_a_wa_id, r.user_b_wa_id)));
  const missing = [...wanted].filter((key) => !have.has(key));
  if (missing.length === 0) return existing.slice(0, 5);

  const orFilter = missing
    .map((key) => {
      const [a, b] = key.split('|');
      return `and(user_a_wa_id.eq.${a},user_b_wa_id.eq.${b})`;
    })
    .join(',');

  const { data: extra } = await db.from('relationship_map').select('*').eq('group_id', groupId).or(orFilter);
  const merged = [...existing];
  for (const row of extra ?? []) {
    const key = pairKey(row.user_a_wa_id, row.user_b_wa_id);
    if (have.has(key) || !row.narrative) continue;
    have.add(key);
    merged.push(row as RelationshipPair);
  }
  return merged.slice(0, 5);
}
