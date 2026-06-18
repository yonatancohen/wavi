import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js'
import { sendReply } from '../whatsapp/client.js'
import { detectNegativeReaction, generateApology } from './recovery.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const REPLY_MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 500

// ── Worker loop ───────────────────────────────────────────────

export async function startReplyWorker() {
  console.log('[ReplyWorker] Starting...')

  while (true) {
    try {
      // Block-pop from Redis queue (poll every 1s)
      const raw = await redis.rpop('reply_jobs')

      if (!raw) {
        await sleep(1000)
        continue
      }

      const job = typeof raw === 'string' ? JSON.parse(raw) : raw
      await processReplyJob(job)
    } catch (err) {
      console.error('[ReplyWorker] Error:', err)
      await sleep(2000)
    }
  }
}

// ── Process one reply job ─────────────────────────────────────

async function processReplyJob(job: {
  group_id:    string
  wa_group_id: string
  message_id:  string
  sender_wa_id: string
  sender_name: string
  body:        string
  wa_msg_id:   string
  queued_at:   number
}) {
  const startTime = Date.now()
  console.log(`[ReplyWorker] Processing job for group ${job.group_id}`)

  try {
    // ── Build context (parallel fetch) ─────────────────────
    const ctx = await buildPromptContext({
      groupId:        job.group_id,
      senderWaId:     job.sender_wa_id,
      currentMessage: job.body,
    })

    const systemPrompt = buildSystemPrompt(ctx)
    const conversationTurns = buildConversationTurns(ctx)

    // ── Call Claude ────────────────────────────────────────
    const response = await anthropic.messages.create({
      model:      REPLY_MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages: [
        ...conversationTurns,
        { role: 'user', content: `${job.sender_name}: ${job.body}` },
      ],
    })

    const replyText = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : ''

    if (!replyText) {
      console.warn('[ReplyWorker] Empty reply generated')
      return
    }

    const latencyMs = Date.now() - startTime

    // ── Send via WhatsApp ──────────────────────────────────
    await sendReply(job.wa_group_id, replyText, job.wa_msg_id)

    // ── Store reply in DB ──────────────────────────────────
    await db.from('messages').insert({
      group_id:       job.group_id,
      sender_wa_id:   'agent',
      sender_name:    process.env.WA_AGENT_NAME ?? 'Wavi',
      body:           replyText,
      is_agent_reply: true,
      timestamp:      new Date().toISOString(),
    })

    const { data: replyRecord } = await db.from('replies').insert({
      message_id:        job.message_id,
      group_id:          job.group_id,
      body:              replyText,
      prompt_tokens:     response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      latency_ms:        latencyMs,
    }).select('id').single()

    // ── Store job ID for reaction monitoring ───────────────
    if (replyRecord?.id) {
      await redis.setex(
        `pending_reaction:${job.group_id}:${replyRecord.id}`,
        120, // monitor for 2 minutes
        JSON.stringify({ wa_group_id: job.wa_group_id, reply_body: replyText }),
      )
    }

    console.log(`[ReplyWorker] Replied in ${latencyMs}ms (${response.usage.input_tokens + response.usage.output_tokens} tokens)`)

  } catch (err) {
    console.error('[ReplyWorker] Job failed:', err)
  }
}

// ── Reaction monitor (called by message handler) ──────────────

export async function checkForNegativeReaction(params: {
  groupId:    string
  senderWaId: string
  body:       string
  waGroupId:  string
}) {
  // Look for any recent pending reply in this group
  const keys = await redis.keys(`pending_reaction:${params.groupId}:*`)
  if (keys.length === 0) return

  const isNegative = detectNegativeReaction(params.body)
  if (!isNegative) return

  // Get group character config for in-character apology
  const { data: group } = await db
    .from('groups')
    .select('character_config')
    .eq('id', params.groupId)
    .single()

  const apology = await generateApology(group?.character_config)

  await sendReply(params.waGroupId, apology)

  // Flag reply as miss
  for (const key of keys) {
    const parts = key.split(':')
    const replyId = parts[parts.length - 1]
    await db.from('replies').update({ flagged_miss: true }).eq('id', replyId)
    await redis.del(key)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
