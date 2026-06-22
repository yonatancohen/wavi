import type { FastifyPluginAsync } from 'fastify';
import { handleTwilioMessage } from '../twilio/handlers.js';

export const twilioRoute: FastifyPluginAsync = async (fastify) => {
  // Parse Twilio's application/x-www-form-urlencoded bodies
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(body as string)) {
      params[k] = v;
    }
    done(null, params);
  });

  // ── POST /twilio/webhook — Twilio posts here on every inbound message ──
  fastify.post('/webhook', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const from = body.From; // e.g. whatsapp:+972501234567
    const text = body.Body; // message text

    if (!from || !text) {
      return reply.code(400).send('Missing From or Body');
    }

    // Fire-and-forget: respond to Twilio immediately so it doesn't retry
    handleTwilioMessage(from, text).catch((err) => {
      console.error('[Twilio] Handler error:', err);
    });

    // Empty TwiML response — we send our reply via the REST API, not here
    reply.type('text/xml');
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  });
};
