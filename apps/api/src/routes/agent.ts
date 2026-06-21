import type { FastifyPluginAsync } from 'fastify'
import { subscribeToQR, getWaConnectionState, getWaHealthState, restartWhatsAppClient, waClient } from '../whatsapp/client.js'
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
    const { connected, connecting, phone_number } = getWaConnectionState()
    const health = getWaHealthState()

    // waClient.info is populated in memory when session is live — use it
    // to confirm connected state even if our internal flag is slightly behind.
    const infoWid = waClient.info?.wid?._serialized ?? null
    const infoPhone = waClient.info?.me?.user ?? null
    const trueConnected = connected || Boolean(infoWid)

    return {
      connected: trueConnected,
      connecting: !trueConnected && connecting,
      state: trueConnected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'DISCONNECTED',
      phone_number: phone_number ?? (infoPhone ? `+${infoPhone}` : null),
      health,
    }
  })
  // ── POST /api/agent/restart — force re-initialize WA browser ─
  fastify.post('/restart', async (_req, reply) => {
    restartWhatsAppClient().catch((err) => {
      console.error('[WA] Manual restart failed', err)
    })
    return reply.code(202).send({ ok: true, message: 'Restart initiated' })
  })
}
