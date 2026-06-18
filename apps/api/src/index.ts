// Bun loads .env automatically — no dotenv needed
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { groupsRoute } from './routes/groups.js'
import { agentRoute } from './routes/agent.js'
import { ingestRoute } from './routes/ingest.js'
import { repliesRoute } from './routes/replies.js'
import { healthRoute } from './routes/health.js'
import { twilioRoute } from './routes/twilio.js'
import { startReplyWorker } from './ai/worker.js'

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

// ── Plugins ──────────────────────────────────────────────────
await server.register(cors, {
  origin: process.env.DASHBOARD_URL ?? 'http://localhost:5173',
  credentials: true,
})
await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

// ── Routes ───────────────────────────────────────────────────
await server.register(healthRoute,  { prefix: '/health' })
await server.register(agentRoute,   { prefix: '/api/agent' })
await server.register(groupsRoute,  { prefix: '/api/groups' })
await server.register(ingestRoute,  { prefix: '/api/ingest' })
await server.register(repliesRoute, { prefix: '/api/replies' })
await server.register(twilioRoute,  { prefix: '/twilio' })

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000)

try {
  await server.listen({ port: PORT, host: '0.0.0.0' })
  server.log.info(`API running on port ${PORT}`)

  // Start reply worker in background
  startReplyWorker()
  server.log.info('Reply worker started')
} catch (err) {
  server.log.error(err)
  process.exit(1)
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGINT', async () => {
  server.log.info('Shutting down...')
  await server.close()
  process.exit(0)
})
