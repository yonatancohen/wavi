import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { parseWAExport, chunkMessages, formatChunkForEmbedding } from '../lib/parser.js';
import { embedBatch, embed } from '../lib/embeddings.js';
import { generateEpisodeSummary, generateGroupContext, synthesizeCharacter } from '../ai/summarizer.js';
import { buildUserProfilesFromHistory } from '../ai/profiler.js';
import { buildRelationshipMap } from '../ai/relationships.js';
import type { IngestionProgress } from '@wavi/shared';

function getAgentId(): string {
  const id = process.env.AGENT_ID;
  if (!id) throw new Error('AGENT_ID not configured');
  return id;
}

async function verifyGroupOwnership(groupId: string): Promise<boolean> {
  const { data } = await db.from('groups').select('id').eq('id', groupId).eq('agent_id', getAgentId()).maybeSingle();
  return !!data;
}

export const ingestRoute: FastifyPluginAsync = async (fastify) => {
  // ── POST /api/ingest/:groupId — upload .txt export ───────────
  fastify.post<{ Params: { groupId: string } }>('/:groupId', async (req, reply) => {
    const { groupId } = req.params;

    if (!(await verifyGroupOwnership(groupId))) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    const raw = buffer.toString('utf-8');

    // Start ingestion as background job — respond immediately
    reply.send({ ok: true, message: 'Ingestion started' });

    // Fire and forget (non-blocking)
    runIngestion(groupId, raw).catch((err) => {
      console.error('[Ingest] Failed:', err);
    });
  });

  // ── GET /api/ingest/:groupId/progress — SSE progress stream ──
  fastify.get<{ Params: { groupId: string } }>('/:groupId/progress', async (req, reply) => {
    const { groupId } = req.params;

    if (!(await verifyGroupOwnership(groupId))) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendProgress = (progress: IngestionProgress) => {
      reply.raw.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    // Poll Redis for progress updates
    const interval = setInterval(async () => {
      const raw = await redis.get(`ingestion_progress:${groupId}`);
      if (raw) {
        const progress = typeof raw === 'string' ? JSON.parse(raw) : raw;
        sendProgress(progress);
        if (progress.stage === 'done' || progress.stage === 'error') {
          clearInterval(interval);
          reply.raw.end();
        }
      }
    }, 500);

    req.raw.on('close', () => clearInterval(interval));
  });
};

// ── Background ingestion pipeline ────────────────────────────

async function runIngestion(groupId: string, raw: string) {
  const progressKey = `ingestion_progress:${groupId}`;

  const setProgress = async (progress: Partial<IngestionProgress>) => {
    await redis.setex(
      progressKey,
      3600,
      JSON.stringify({
        group_id: groupId,
        total_messages: 0,
        processed_messages: 0,
        chunks_embedded: 0,
        stage: 'parsing',
        ...progress,
      }),
    );
  };

  try {
    // ── Idempotency: purge derived data before re-run ───────
    await Promise.all([
      db.from('message_chunks').delete().eq('group_id', groupId),
      db.from('episode_summaries').delete().eq('group_id', groupId),
      db.from('user_profiles').delete().eq('group_id', groupId),
      db.from('relationship_map').delete().eq('group_id', groupId),
      db.from('group_contexts').delete().eq('group_id', groupId),
    ]);

    // ── Stage 1: Parse ──────────────────────────────────────
    await setProgress({ stage: 'parsing' });
    const messages = parseWAExport(raw);
    const realMessages = messages.filter((m) => !m.is_system_message);

    await setProgress({ stage: 'embedding', total_messages: realMessages.length });

    // ── Stage 2: Chunk + Embed ──────────────────────────────
    const chunks = chunkMessages(realMessages, 50, 25);
    const BATCH_SIZE = 10; // embed 10 chunks at a time
    let chunksEmbedded = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const contents = batch.map(formatChunkForEmbedding);

      const pairs = batch.map((chunk, idx) => ({ chunk, content: contents[idx] ?? '' })).filter(({ content }) => content.length > 20);

      if (pairs.length === 0) continue;

      const embeddings = await embedBatch(pairs.map((p) => p.content));

      const rows = pairs.map(({ chunk, content }, idx) => ({
        group_id: groupId,
        content,
        summary: null,
        embedding: JSON.stringify(embeddings[idx]),
        msg_from: chunk[0]?.timestamp.toISOString(),
        msg_to: chunk[chunk.length - 1]?.timestamp.toISOString(),
        members: [...new Set(chunk.map((m) => m.sender_name))],
      }));

      await db.from('message_chunks').insert(rows);
      chunksEmbedded += rows.length;

      await setProgress({
        stage: 'embedding',
        total_messages: realMessages.length,
        processed_messages: Math.min((i + BATCH_SIZE) * 50, realMessages.length),
        chunks_embedded: chunksEmbedded,
      });
    }

    // ── Stage 3: User profiling ─────────────────────────────
    await setProgress({
      stage: 'profiling',
      processed_messages: realMessages.length,
      chunks_embedded: chunksEmbedded,
    });
    await buildUserProfilesFromHistory(groupId, realMessages);

    // ── Stage 4: Episode summaries ──────────────────────────
    const episodeSummaries: string[] = [];
    for (let i = 0; i < realMessages.length; i += 100) {
      const slice = realMessages.slice(i, i + 100);
      const content = slice.map((m) => `${m.sender_name}: ${m.body}`).join('\n');
      const summary = await generateEpisodeSummary(content);
      episodeSummaries.push(summary);

      const embedding = await embed(summary);
      await db.from('episode_summaries').insert({
        group_id: groupId,
        summary,
        embedding: JSON.stringify(embedding),
        msg_from: slice[0]?.timestamp.toISOString(),
        msg_to: slice[slice.length - 1]?.timestamp.toISOString(),
      });
    }

    // ── Stage 6: Relationship mapping ───────────────────────
    await setProgress({ stage: 'relationships' });
    await buildRelationshipMap(groupId, realMessages);

    // ── Stage 7: Group context ──────────────────────────────
    await setProgress({ stage: 'context' });
    const { data: group } = await db.from('groups').select('name').eq('id', groupId).single();

    const recentContent = episodeSummaries.slice(-5).join('\n\n');
    const { data: prevCtx } = await db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).maybeSingle();

    const contextSummary = await generateGroupContext({
      groupName: group?.name ?? 'the group',
      recentContent,
      previousContext: prevCtx?.summary_text ?? '',
    });

    await db.from('group_contexts').insert({
      group_id: groupId,
      summary_text: contextSummary,
      character_version: 1,
    });

    // ── Stage 5: Character synthesis ────────────────────────
    await setProgress({ stage: 'synthesizing' });

    const { data: profiles } = await db.from('user_profiles').select('display_name, behavioral_summary').eq('group_id', groupId);

    const { data: groupMeta } = await db.from('groups').select('name, language_mode').eq('id', groupId).single();

    const character = await synthesizeCharacter({
      groupName: groupMeta?.name ?? 'the group',
      episodeSummaries: episodeSummaries.slice(-10),
      userProfiles: (profiles ?? []).map((p) => `${p.display_name}: ${p.behavioral_summary}`),
      languageMode: groupMeta?.language_mode ?? 'auto',
    });

    await db
      .from('groups')
      .update({
        character_config: { ...character, preset: 'custom', version: 1 },
      })
      .eq('id', groupId);

    await setProgress({ stage: 'done' });
  } catch (err: any) {
    console.error('[Ingest] Error:', err);
    await setProgress({ stage: 'error', error: err.message ?? 'Unknown error' });
  }
}
