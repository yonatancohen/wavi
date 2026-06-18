import type { FastifyPluginAsync } from 'fastify'
import { subscribeToQR } from '../whatsapp/client.js'

export const agentRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /api/agent/qr — SSE stream for QR code ───────────────
  fastify.get('/qr', async (req, reply) => {
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
  fastify.get('/status', async (req, reply) => {
    const { waClient } = await import('../whatsapp/client.js')
    const state = await waClient.getState().catch(() => null)

    return {
      connected:    state === 'CONNECTED',
      state:        state ?? 'DISCONNECTED',
      phone_number: waClient.info?.wid?.user ?? null,
    }
  })
}
