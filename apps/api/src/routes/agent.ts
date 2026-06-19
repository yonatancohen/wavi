import type { FastifyPluginAsync } from 'fastify'
import { subscribeToQR, getWaConnectionState } from '../whatsapp/client.js'
import { pickDashboardOrigin } from '../lib/cors.js'

export const agentRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /api/agent/qr — SSE stream for QR code ───────────────
  fastify.get('/qr', async (req, reply) => {
    // Raw SSE bypasses @fastify/cors — set headers manually for EventSource
    const origin = pickDashboardOrigin(req.headers.origin)
    reply.hijack()
    reply.raw.setHeader('Access-Control-Allow-Origin', origin)
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no') // disable nginx buffering
    reply.raw.flushHeaders()

    const send = (data: string) => {
      reply.raw.write(`data: ${data}\n\n`)
    }

    const close = () => {
      reply.raw.end()
    }

    const unsubscribe = subscribeToQR({ send, close })

    req.raw.on('close', () => {
      unsubscribe()
    })
  })

  // ── GET /api/agent/status ────────────────────────────────────
  fastify.get('/status', async (_req, _reply) => {
    // Use the locally-tracked state to avoid calling getState() which can
    // hang while the WA client is still initialising after authentication.
    const { connected, phone_number } = getWaConnectionState()
    return {
      connected,
      state:        connected ? 'CONNECTED' : 'DISCONNECTED',
      phone_number,
    }
  })
}
