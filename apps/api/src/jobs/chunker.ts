import { redis } from '../lib/redis.js';
import { db } from '../db/client.js';
import { embed } from '../lib/embeddings.js';
import { generateEpisodeSummary, generateGroupContext, generateChunkSummary } from '../ai/summarizer.js';
import { profileUser } from '../ai/profiler.js';

const CHUNK_SIZE = 50;
const CHUNK_OVERLAP = 25;

interface BufferMessage {
  sender_wa_id: string;
  sender_name: string;
  body: string;
  timestamp: string;
}

// ── Append to per-group buffer ────────────────────────────────

export async function appendToChunkBuffer(groupId: string, msg: { sender_wa_id: string; sender_name: string; body: string; timestamp: Date }) {
  const key = `chunk_buffer:${groupId}`;

  const entry: BufferMessage = {
    sender_wa_id: msg.sender_wa_id,
    sender_name: msg.sender_name,
    body: msg.body,
    timestamp: msg.timestamp.toISOString(),
  };

  const bufferLen = await redis.rpush(key, JSON.stringify(entry));

  if (bufferLen >= CHUNK_SIZE) {
    await flushChunkBuffer(groupId);
  }
}

// ── Flush buffer → embed → store in pgvector ─────────────────

export async function flushChunkBuffer(groupId: string) {
  const lockKey = `chunk_lock:${groupId}`;
  const locked = await redis.set(lockKey, '1', { ex: 30, nx: true });
  if (!locked) return;

  try {
    const key = `chunk_buffer:${groupId}`;
    const raw = await redis.lrange(key, 0, CHUNK_SIZE - 1);

    if (raw.length < 10) return;

    const messages: BufferMessage[] = raw.map((r) => (typeof r === 'string' ? JSON.parse(r) : r));

    await redis.ltrim(key, CHUNK_SIZE - CHUNK_OVERLAP, -1);

    const content = messages.map((m) => `${m.sender_name}: ${m.body}`).join('\n');

    const members = [...new Set(messages.map((m) => m.sender_name))];
    const msgFrom = messages[0].timestamp;
    const msgTo = messages[messages.length - 1].timestamp;

    const { data: group } = await db.from('groups').select('name, language_mode').eq('id', groupId).single();
    const languageMode = (group?.language_mode ?? 'auto') as import('@wavi/shared').LanguageMode;

    const summary = await generateChunkSummary(content, languageMode, { groupId });
    const embedding = await embed(content, { groupId });

    await db.from('message_chunks').insert({
      group_id: groupId,
      content,
      summary,
      embedding: JSON.stringify(embedding),
      msg_from: msgFrom,
      msg_to: msgTo,
      members,
    });

    await maybeGenerateEpisodeSummary(groupId, messages.length);
    queueLiveReProfiling(groupId, messages);

    // Incremental relationship update — detached, non-blocking
    setImmediate(() => {
      import('../ai/relationships.js')
        .then(({ updateRelationshipsIncremental }) =>
          updateRelationshipsIncremental(
            groupId,
            messages.map((m) => ({ ...m })),
          ),
        )
        .catch((err) => console.error('[Chunker] Incremental relationship update failed:', err));
    });
  } finally {
    await redis.del(lockKey);
  }
}

// ── Episode summary every 100 messages ───────────────────────

async function maybeGenerateEpisodeSummary(groupId: string, messageCount: number) {
  const counterKey = `episode_counter:${groupId}`;
  const count = await redis.incrby(counterKey, messageCount);
  const prevCount = count - messageCount;

  if (Math.floor(count / 100) <= Math.floor(prevCount / 100)) return;

  const { data: recentMessages } = await db
    .from('messages')
    .select('sender_name, body, timestamp')
    .eq('group_id', groupId)
    .eq('is_agent_reply', false)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (!recentMessages || recentMessages.length < 20) return;

  const { data: groupMeta } = await db.from('groups').select('language_mode').eq('id', groupId).single();
  const languageMode = (groupMeta?.language_mode ?? 'auto') as import('@wavi/shared').LanguageMode;

  const content = recentMessages
    .reverse()
    .map((m) => `${m.sender_name}: ${m.body}`)
    .join('\n');

  const summary = await generateEpisodeSummary(content, languageMode, { groupId });
  const embedding = await embed(summary, { groupId });

  const msgFrom = recentMessages[0].timestamp;
  const msgTo = recentMessages[recentMessages.length - 1].timestamp;

  await db.from('episode_summaries').insert({
    group_id: groupId,
    summary,
    embedding: JSON.stringify(embedding),
    msg_from: msgFrom,
    msg_to: msgTo,
  });

  await maybeGenerateGroupContext(groupId);

  // Detached: slide character sliders based on recent misses + refresh voice examples
  setImmediate(() => {
    import('../ai/character-drift.js')
      .then(({ maybeDriftCharacter, maybeCaptureExamples }) => Promise.all([maybeDriftCharacter(groupId), maybeCaptureExamples(groupId)]))
      .catch((err) => console.error('[Chunker] Character drift/examples failed:', err));
  });

  // Every 500 messages: trigger full character re-synthesis if not locked
  if (Math.floor(count / 500) > Math.floor(prevCount / 500)) {
    setImmediate(() => {
      import('../ai/character-synthesis.js')
        .then(async ({ synthesizeCharacterForGroup }) => {
          const { data: g } = await db.from('groups').select('character_locked').eq('id', groupId).single();
          if (g?.character_locked) return;
          await synthesizeCharacterForGroup(groupId);
          console.log(`[Chunker] Full character re-synthesis at ${count} messages for group ${groupId}`);
        })
        .catch((err) => console.error('[Chunker] Character re-synthesis failed:', err));
    });
  }
}

async function maybeGenerateGroupContext(groupId: string) {
  const { data: group } = await db.from('groups').select('name, language_mode').eq('id', groupId).single();
  const languageMode = (group?.language_mode ?? 'auto') as import('@wavi/shared').LanguageMode;

  const { data: episodes } = await db.from('episode_summaries').select('summary').eq('group_id', groupId).order('created_at', { ascending: false }).limit(5);

  const { data: prevCtx } = await db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).maybeSingle();

  const recentContent = (episodes ?? [])
    .map((e) => e.summary)
    .reverse()
    .join('\n\n');
  const contextSummary = await generateGroupContext({
    groupName: group?.name ?? 'the group',
    recentContent,
    previousContext: prevCtx?.summary_text ?? '',
    languageMode,
    usageContext: { groupId },
  });

  await db.from('group_contexts').insert({
    group_id: groupId,
    summary_text: contextSummary,
    character_version: 1,
  });
}

// ── Live re-profiling (detached async task) ───────────────────

function queueLiveReProfiling(groupId: string, messages: BufferMessage[]) {
  const senderCounts = new Map<string, { waId: string; name: string; count: number }>();
  for (const msg of messages) {
    const existing = senderCounts.get(msg.sender_wa_id);
    if (existing) {
      existing.count++;
    } else {
      senderCounts.set(msg.sender_wa_id, {
        waId: msg.sender_wa_id,
        name: msg.sender_name,
        count: 1,
      });
    }
  }

  setImmediate(() => {
    for (const { waId, name, count } of senderCounts.values()) {
      maybeReProfileUser(groupId, waId, name, count).catch((err) => {
        console.error('[Chunker] Re-profile failed:', err);
      });
    }
  });
}

async function maybeReProfileUser(groupId: string, waUserId: string, displayName: string, msgCount: number) {
  const counterKey = `profile_counter:${groupId}:${waUserId}`;
  const count = await redis.incrby(counterKey, msgCount);

  if (count < 50) return;

  await redis.decrby(counterKey, 50);

  const { data: recentMessages } = await db
    .from('messages')
    .select('body')
    .eq('group_id', groupId)
    .eq('sender_wa_id', waUserId)
    .eq('is_agent_reply', false)
    .order('timestamp', { ascending: false })
    .limit(100);

  if (!recentMessages || recentMessages.length < 5) return;

  const { data: group } = await db.from('groups').select('language_mode').eq('id', groupId).single();
  const languageMode = (group?.language_mode ?? 'he') as import('@wavi/shared').LanguageMode;

  await profileUser(groupId, waUserId, displayName, recentMessages.reverse(), languageMode);
}
