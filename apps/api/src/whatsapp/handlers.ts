import type { InboundMessage } from './provider.js'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { appendToChunkBuffer } from '../jobs/chunker.js'
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '@wavi/shared'
import { isAgentTagged } from './agent-identity.js'

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi'

// ── Identity reconciliation ───────────────────────────────────
// Ingestion writes user_profiles.wa_user_id = display name (e.g. "Dan Cohen")
// but live messages identify senders by WA JID (e.g. "972501234567@c.us").
// This function updates the profile key to the real JID once we observe a live
// message. It runs non-blocking and caches results in Redis so subsequent
// messages from the same sender incur only a single Redis EXISTS check.
async function reconcileUserIdentity(
  groupId: string,
  senderWaId: string,
  displayName: string,
) {
  if (!displayName || displayName === senderWaId) return

  const cacheKey = `reconciled:${groupId}:${senderWaId}`
  if (await redis.exists(cacheKey)) return

  // If a profile already exists keyed by the real WA JID, nothing to do
  const { data: alreadyKeyed } = await db
    .from('user_profiles')
    .select('id')
    .eq('group_id', groupId)
    .eq('wa_user_id', senderWaId)
    .maybeSingle()

  if (alreadyKeyed) {
    await redis.setex(cacheKey, 86400, '1')
    return
  }

  // Find a profile keyed by the display name (written during ingestion)
  const { data: profile } = await db
    .from('user_profiles')
    .select('id, wa_user_id')
    .eq('group_id', groupId)
    .eq('display_name', displayName)
    .maybeSingle()

  if (!profile || isWaJid(profile.wa_user_id)) {
    // No display-name profile yet — ingestion may not have run; retry after 1h
    await redis.setex(cacheKey, 3600, '0')
    return
  }

  const oldId = profile.wa_user_id

  // Update the profile key from display name → real WA JID
  await db
    .from('user_profiles')
    .update({ wa_user_id: senderWaId })
    .eq('id', profile.id)

  // Reconcile relationship_map rows that still carry the display-name placeholder
  await reconcileRelationshipIds(groupId, oldId, senderWaId, displayName)

  console.log(`[Reconcile] Updated wa_user_id "${oldId}" → ${senderWaId} in group ${groupId}`)
  await redis.setex(cacheKey, 86400, '1')
}

function isWaJid(id: string): boolean {
  return id.includes('@')
}

async function reconcileRelationshipIds(
  groupId: string,
  oldId: string,
  newId: string,
  displayName: string,
) {
  const { data: rows } = await db
    .from('relationship_map')
    .select('*')
    .eq('group_id', groupId)
    .or(`user_a_wa_id.eq.${oldId},user_b_wa_id.eq.${oldId}`)

  for (const row of rows ?? []) {
    let userA = row.user_a_wa_id === oldId ? newId : row.user_a_wa_id
    let userB = row.user_b_wa_id === oldId ? newId : row.user_b_wa_id
    let nameA = row.user_a_wa_id === oldId ? displayName : (row.user_a_name ?? row.user_a_wa_id)
    let nameB = row.user_b_wa_id === oldId ? displayName : (row.user_b_name ?? row.user_b_wa_id)
    let signals = row.signals as {
      reply_count_a_to_b: number
      reply_count_b_to_a: number
      agreement_count: number
      disagreement_count: number
      defense_count: number
    }

    // Re-enforce canonical pair ordering (lower JID first) after key update
    if (userA > userB) {
      ;[userA, userB] = [userB, userA]
      ;[nameA, nameB] = [nameB, nameA]
      signals = {
        reply_count_a_to_b: signals.reply_count_b_to_a,
        reply_count_b_to_a: signals.reply_count_a_to_b,
        agreement_count:    signals.agreement_count,
        disagreement_count: signals.disagreement_count,
        defense_count:      signals.defense_count,
      }
    }

    await db.from('relationship_map').delete().eq('id', row.id)

    await db.from('relationship_map').upsert({
      group_id:          groupId,
      user_a_wa_id:      userA,
      user_b_wa_id:      userB,
      user_a_name:       nameA,
      user_b_name:       nameB,
      interaction_score: row.interaction_score,
      conflict_score:    row.conflict_score,
      solidarity_score:  row.solidarity_score,
      signals,
      narrative:         row.narrative,
      last_updated:      new Date().toISOString(),
    }, { onConflict: 'group_id,user_a_wa_id,user_b_wa_id' })
  }
}

export async function handleIncomingMessage(msg: InboundMessage) {
  // Only handle group messages
  if (!msg.isGroup) return

  const waGroupId = msg.waGroupId
  console.log(`[WA] Group message received — wa_group_id: ${waGroupId} | name: ${msg.chatName}`)

  const senderWaId = msg.senderWaId
  const body = msg.body

  // ── 1. Find group in DB ───────────────────────────────────
  const { data: group } = await db
    .from('groups')
    .select('id, name, status, character_config, language_mode')
    .eq('wa_group_id', waGroupId)
    .single()

  if (!group || group.status === 'paused') return

  // ── 2. Store message ──────────────────────────────────────
  const senderName = senderWaId

  const { data: stored } = await db
    .from('messages')
    .insert({
      group_id:       group.id,
      sender_wa_id:   senderWaId,
      sender_name:    senderName,
      body,
      is_agent_reply: false,
      timestamp:      new Date(msg.timestampMs).toISOString(),
    })
    .select('id')
    .single()

  // ── 3. Feed chunk buffer (for RAG embedding) ──────────────
  await appendToChunkBuffer(group.id, {
    sender_wa_id: senderWaId,
    sender_name:  senderName,
    body,
    timestamp:    new Date(msg.timestampMs),
  })

  // ── 4. Check if agent is tagged ───────────────────────────
  if (!isAgentTagged(msg, body)) {
    // Reconcile display-name profile keys non-blocking (only needs pushname)
    msg.resolvePushName().then((pushname) => {
      if (pushname && pushname !== senderWaId) {
        reconcileUserIdentity(group.id, senderWaId, pushname).catch((err) => {
          console.error('[Reconcile] Failed:', err)
        })
      }
    })
    return
  }

  // Resolve push name — needed for reply context and reconciliation
  const resolvedName = await msg.resolvePushName()

  // Reconcile display-name profile keys (non-blocking)
  reconcileUserIdentity(group.id, senderWaId, resolvedName).catch((err) => {
    console.error('[Reconcile] Failed:', err)
  })

  // ── 5. Rate limit check ───────────────────────────────────
  const rateLimitKey = `ratelimit:${group.id}:${senderWaId}`
  const currentCount = await redis.incr(rateLimitKey)

  if (currentCount === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW)
  }

  if (currentCount > RATE_LIMIT_MAX) {
    if (currentCount === RATE_LIMIT_MAX + 1) {
      await db.from('messages').insert({
        group_id:       group.id,
        sender_wa_id:   'agent',
        sender_name:    AGENT_NAME,
        body:           getRateLimitResponse(group.character_config),
        is_agent_reply: true,
        timestamp:      new Date().toISOString(),
      })

      const { sendReply } = await import('./client.js')
      await sendReply(waGroupId, getRateLimitResponse(group.character_config), msg.waMsgId)
    }
    return
  }

  // ── 6. Queue reply job ────────────────────────────────────
  const { queueReplyJob } = await import('../lib/reply-queue.js')
  await queueReplyJob({
    group_id:     group.id,
    group_name:   group.name,
    wa_group_id:  waGroupId,
    message_id:   stored?.id,
    sender_wa_id: senderWaId,
    sender_name:  resolvedName,
    body,
    wa_msg_id:    msg.waMsgId,
  })
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
