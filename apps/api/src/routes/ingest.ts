import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { runIngestionFromExport, runSupplementalExportAlignment, setIngestionProgress } from '../jobs/ingestion-pipeline.js';

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
  // Optional multipart field "supplemental" — second export from another member's phone.
  fastify.post<{ Params: { groupId: string } }>('/:groupId', async (req, reply) => {
    const { groupId } = req.params;

    if (!(await verifyGroupOwnership(groupId))) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    const parts = req.files();
    let primaryRaw: string | null = null;
    let supplementalRaw: string | undefined;

    for await (const part of parts) {
      const buffer = await part.toBuffer();
      const text = buffer.toString('utf-8');
      if (part.fieldname === 'supplemental') {
        supplementalRaw = text;
      } else {
        primaryRaw = text;
      }
    }

    if (!primaryRaw) return reply.code(400).send({ error: 'No file uploaded' });

    await setIngestionProgress(groupId, { stage: 'parsing' });

    reply.send({
      ok: true,
      message: supplementalRaw ? 'Ingestion started with supplemental export alignment' : 'Ingestion started',
    });

    runIngestionFromExport(groupId, primaryRaw, supplementalRaw).catch((err) => {
      console.error('[Ingest] Failed:', err);
    });
  });

  // ── POST /api/ingest/:groupId/supplemental — align a second export with existing data ──
  fastify.post<{ Params: { groupId: string } }>('/:groupId/supplemental', async (req, reply) => {
    const { groupId } = req.params;

    if (!(await verifyGroupOwnership(groupId))) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    const raw = buffer.toString('utf-8');

    await setIngestionProgress(groupId, { stage: 'parsing' });

    reply.send({ ok: true, message: 'Supplemental alignment started' });

    runSupplementalExportAlignment(groupId, raw).catch((err) => {
      console.error('[Supplemental] Failed:', err);
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

    // Heartbeat counter — send a keepalive SSE comment every ~15 s when no
    // data is flowing so Railway's proxy doesn't close the idle connection.
    let pollsSinceData = 0;

    const interval = setInterval(async () => {
      const raw = await redis.get(`ingestion_progress:${groupId}`);
      if (raw) {
        pollsSinceData = 0;
        const progress = typeof raw === 'string' ? JSON.parse(raw) : raw;
        sendProgress(progress);
        if (progress.stage === 'done' || progress.stage === 'error') {
          clearInterval(interval);
          reply.raw.end();
        }
      } else {
        pollsSinceData++;
        if (pollsSinceData % 30 === 0) reply.raw.write(': heartbeat\n\n');
      }
    }, 500);

    req.raw.on('close', () => clearInterval(interval));
  });
};
