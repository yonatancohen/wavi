// Bun loads .env automatically — no dotenv needed
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { groupsRoute } from './routes/groups.js';
import { agentRoute } from './routes/agent.js';
import { ingestRoute } from './routes/ingest.js';
import { repliesRoute } from './routes/replies.js';
import { flowsRoute } from './routes/flows.js';
import { healthRoute } from './routes/health.js';
import { twilioRoute } from './routes/twilio.js';
import { startReplyWorker } from './ai/worker.js';
import { startWhatsAppClient, stopWhatsAppClient, recoverFromUnhandledWaError } from './whatsapp/client.js';
import { allowedDashboardOrigins, isOriginAllowed } from './lib/cors.js';
import { isAuthRequired, requireAuth } from './lib/auth.js';

// wwebjs runs some internal logic (e.g. re-injecting on a LOGOUT navigation)
// from un-awaited handlers. When those throw — most notably the puppeteer
// "page binding already exists" race — the rejection is unhandled and would
// otherwise terminate the process, taking the API and reply worker with it.
// Recover by restarting the WhatsApp client for known-transient WA errors;
// anything else is genuinely fatal and is left to crash as before.
process.on('unhandledRejection', (reason) => {
  if (recoverFromUnhandledWaError(reason)) return;
  console.error('[Fatal] Unhandled promise rejection', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  if (recoverFromUnhandledWaError(err)) return;
  console.error('[Fatal] Uncaught exception', err);
  process.exit(1);
});

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  },
});

// Accept POST/PUT with Content-Type: application/json and no body (e.g. /api/agent/restart).
server.removeContentTypeParser('application/json');
server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  const text = typeof body === 'string' ? body : body.toString('utf8');
  if (text.length === 0) {
    done(null, undefined);
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch (err) {
    (err as Error & { statusCode?: number }).statusCode = 400;
    done(err as Error, undefined);
  }
});

// ── Plugins ──────────────────────────────────────────────────
await server.register(cors, {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, origin ?? allowedDashboardOrigins()[0]);
      return;
    }
    cb(null, false);
  },
  credentials: true,
});
await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

if (isAuthRequired()) {
  server.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health')) return;

    const user = await requireAuth(request);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
  server.log.info('API auth enabled (AUTH_REQUIRED=true)');
}

// ── Routes ───────────────────────────────────────────────────
await server.register(healthRoute, { prefix: '/health' });
await server.register(agentRoute, { prefix: '/api/agent' });
await server.register(groupsRoute, { prefix: '/api/groups' });
await server.register(ingestRoute, { prefix: '/api/ingest' });
await server.register(repliesRoute, { prefix: '/api/replies' });
await server.register(flowsRoute, { prefix: '/api/flows' });
await server.register(twilioRoute, { prefix: '/twilio' });

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);

try {
  await server.listen({ port: PORT, host: '0.0.0.0' });
  server.log.info(`API running on port ${PORT}`);

  // Start reply worker in background
  startReplyWorker();
  server.log.info('Reply worker started');

  // Start WhatsApp client
  startWhatsAppClient();
  server.log.info('WhatsApp client initializing');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown(signal: string) {
  server.log.info(`${signal} received — shutting down...`);
  try {
    await stopWhatsAppClient();
  } catch (err) {
    server.log.warn({ err }, 'WhatsApp client shutdown error');
  }
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
