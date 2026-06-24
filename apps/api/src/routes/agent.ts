import type { FastifyPluginAsync } from 'fastify';
import { subscribeToQR, getWaConnectionState, getWaHealthState, getWaIdentitySnapshot, restartWhatsAppClient } from '../whatsapp/client.js';
import { beginSseStream, endSseStream, writeSseRaw } from '../lib/sse.js';

export const agentRoute: FastifyPluginAsync = async (fastify) => {
  // ── GET /api/agent/qr — SSE stream for QR code ───────────────
  fastify.get('/qr', async (req, reply) => {
    beginSseStream(req, reply);

    const send = (data: string) => {
      writeSseRaw(reply, data);
    };

    const close = () => {
      endSseStream(reply);
    };

    const unsubscribe = subscribeToQR({ send, close });

    req.raw.on('close', () => {
      unsubscribe();
    });
  });

  // ── GET /api/agent/status ────────────────────────────────────
  fastify.get('/status', async (_req, _reply) => {
    const { connected, connecting, phone_number } = getWaConnectionState();
    const health = getWaHealthState();

    const { wid: infoWid, phone: infoPhone } = getWaIdentitySnapshot();
    const trueConnected = connected || Boolean(infoWid);

    return {
      connected: trueConnected,
      connecting: !trueConnected && connecting,
      state: trueConnected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'DISCONNECTED',
      phone_number: phone_number ?? (infoPhone ? `+${infoPhone}` : null),
      health,
    };
  });

  // ── POST /api/agent/restart — force re-initialize WA browser ─
  fastify.post('/restart', async (_req, reply) => {
    restartWhatsAppClient().catch((err) => {
      console.error('[WA] Manual restart failed', err);
    });
    return reply.code(202).send({ ok: true, message: 'Restart initiated' });
  });
};
