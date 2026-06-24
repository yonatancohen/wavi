import { db } from '../db/client.js';
import { redis } from '../lib/redis.js';
import { appendToChunkBuffer } from '../jobs/chunker.js';
import { isGroupReplyEnabled, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '@wavi/shared';

export async function handleTwilioMessage(from: string, body: string) {
  // from = 'whatsapp:+972501234567'
  const senderPhone = from.replace('whatsapp:', '');

  // ── 1. Find or auto-create a conversation record ──────────
  let { data: group } = await db.from('groups').select('id, name, status, character_config, language_mode').eq('wa_group_id', from).single();

  if (!group) {
    const { data: created } = await db
      .from('groups')
      .insert({
        wa_group_id: from,
        name: `DM: ${senderPhone}`,
        status: 'active',
        character_config: {},
        language_mode: 'auto',
      })
      .select('id, name, status, character_config, language_mode')
      .single()
      .throwOnError();
    group = created;
  }

  if (!group || group.status === 'paused') return;

  const replyEnabled = isGroupReplyEnabled(group.status);

  // ── 2. Store message ──────────────────────────────────────
  const { data: stored } = await db
    .from('messages')
    .insert({
      group_id: group.id,
      sender_wa_id: from,
      sender_name: senderPhone,
      body,
      is_agent_reply: false,
      timestamp: new Date().toISOString(),
    })
    .select('id')
    .single();

  // ── 3. Feed chunk buffer (for RAG embedding) ──────────────
  await appendToChunkBuffer(group.id, {
    sender_wa_id: from,
    sender_name: senderPhone,
    body,
    timestamp: new Date(),
  });

  // ── 4. Rate limit check ───────────────────────────────────
  const rateLimitKey = `ratelimit:${group.id}:${from}`;
  const currentCount = await redis.incr(rateLimitKey);

  if (currentCount === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
  }

  if (replyEnabled && currentCount > RATE_LIMIT_MAX) {
    if (currentCount === RATE_LIMIT_MAX + 1) {
      const { sendReply } = await import('./client.js');
      await sendReply(from, getRateLimitResponse(group.character_config));
    }
    return;
  }

  if (!replyEnabled) return;

  // ── 5. Queue reply job ────────────────────────────────────
  const { queueReplyJob } = await import('../lib/reply-queue.js');
  await queueReplyJob({
    group_id: group.id,
    group_name: group.name,
    wa_group_id: from,
    message_id: stored?.id,
    sender_wa_id: from,
    sender_name: senderPhone,
    body,
    wa_msg_id: '',
  });
}

function getRateLimitResponse(characterConfig: any): string {
  const humor = characterConfig?.sliders?.humor ?? 50;
  if (humor > 70) return `Easy there — I need a breather. You've hit your limit for the hour. I'll be back. 😤`;
  if (humor > 40) return `That's 20 for this hour. Give me a break and try again later.`;
  return `You've reached the request limit (20/hour). I'll respond again when the window resets.`;
}
