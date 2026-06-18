import type { Message as WAMessage } from 'whatsapp-web.js'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { appendToChunkBuffer } from '../jobs/chunker.js'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '@wavi/shared'

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'Wavi'

export async function handleIncomingMessage(msg: WAMessage) {
  const chat = await msg.getChat()

  // Only handle group messages
  if (!chat.isGroup) return

  const waGroupId = chat.id._serialized
  console.log(`[WA] Group message received — wa_group_id: ${waGroupId} | name: ${chat.name}`)

  const senderWaId = msg.author ?? msg.from
  const senderName = (await msg.getContact()).pushname ?? senderWaId
  const body = msg.body

  // ── 1. Find group in DB ───────────────────────────────────
  const { data: group } = await db
    .from('groups')
    .select('id, status, character_config, language_mode')
    .eq('wa_group_id', waGroupId)
    .single()

  if (!group || group.status === 'paused') return

  // ── 2. Store message ──────────────────────────────────────
  const { data: stored } = await db
    .from('messages')
    .insert({
      group_id:      group.id,
      sender_wa_id:  senderWaId,
      sender_name:   senderName,
      body,
      is_agent_reply: false,
      timestamp:     new Date(msg.timestamp * 1000).toISOString(),
    })
    .select('id')
    .single()

  // ── 3. Feed chunk buffer (for RAG embedding) ──────────────
  await appendToChunkBuffer(group.id, {
    sender_name: senderName,
    body,
    timestamp: new Date(msg.timestamp * 1000),
  })

  // ── 4. Check if agent is tagged ───────────────────────────
  const isTagged = body.toLowerCase().includes(`@${AGENT_NAME.toLowerCase()}`)
  if (!isTagged) return

  // ── 5. Rate limit check ───────────────────────────────────
  const rateLimitKey = `ratelimit:${group.id}:${senderWaId}`
  const currentCount = await redis.incr(rateLimitKey)

  if (currentCount === 1) {
    // First call in window — set TTL
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW)
  }

  if (currentCount > RATE_LIMIT_MAX) {
    if (currentCount === RATE_LIMIT_MAX + 1) {
      // Send exactly one in-character rate limit message
      await db.from('messages').insert({
        group_id:      group.id,
        sender_wa_id:  'agent',
        sender_name:   AGENT_NAME,
        body:          getRateLimitResponse(group.character_config),
        is_agent_reply: true,
        timestamp:     new Date().toISOString(),
      })

      const { sendReply } = await import('./client.js')
      await sendReply(waGroupId, getRateLimitResponse(group.character_config), msg.id._serialized)
    }
    return
  }

  // ── 6. Queue reply job ────────────────────────────────────
  const job = {
    group_id:      group.id,
    wa_group_id:   waGroupId,
    message_id:    stored?.id,
    sender_wa_id:  senderWaId,
    sender_name:   senderName,
    body,
    wa_msg_id:     msg.id._serialized,
    queued_at:     Date.now(),
  }

  await redis.lpush('reply_jobs', JSON.stringify(job))
}

// ── Rate limit response stays in character ────────────────────
function getRateLimitResponse(characterConfig: any): string {
  const humor = characterConfig?.sliders?.humor ?? 50
  if (humor > 70) {
    return `Easy there — I need a breather. You've hit your limit for the hour. I'll be back. 😤`
  } else if (humor > 40) {
    return `That's 20 for this hour. Give me a break and try again later.`
  } else {
    return `You've reached the request limit (20/hour). I'll respond again when the window resets.`
  }
}
