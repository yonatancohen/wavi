import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { runIngestionFromExport, setIngestionProgress } from '../jobs/ingestion-pipeline.js';

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

    // Reset progress before responding so a freshly-opened SSE stream
    // doesn't immediately observe a stale 'done' from a previous run.
    await setIngestionProgress(groupId, { stage: 'parsing' });

    // Start ingestion as background job — respond immediately
    reply.send({ ok: true, message: 'Ingestion started' });

    // Fire and forget (non-blocking)
    runIngestionFromExport(groupId, raw).catch((err) => {
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

    const sendProgress = (progress: unknown) => {
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
