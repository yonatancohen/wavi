import { redis } from '../lib/redis.js'
import { db } from '../db/client.js'
import { embed, embedBatch } from '../lib/embeddings.js'
import { generateEpisodeSummary } from '../ai/summarizer.js'

const CHUNK_SIZE = 50
const CHUNK_OVERLAP = 25

interface BufferMessage {
  sender_name: string
  body: string
  timestamp: string
}

// ── Append to per-group buffer ────────────────────────────────

export async function appendToChunkBuffer(
  groupId: string,
  msg: { sender_name: string; body: string; timestamp: Date },
) {
  const key = `chunk_buffer:${groupId}`

  const entry: BufferMessage = {
    sender_name: msg.sender_name,
    body: msg.body,
    timestamp: msg.timestamp.toISOString(),
  }

  await redis.rpush(key, JSON.stringify(entry))

  // Check if we've hit chunk size
  const bufferLen = await redis.llen(key)

  if (bufferLen >= CHUNK_SIZE) {
    await flushChunkBuffer(groupId)
  }
}

// ── Flush buffer → embed → store in pgvector ─────────────────

export async function flushChunkBuffer(groupId: string) {
  const key = `chunk_buffer:${groupId}`
  const raw = await redis.lrange(key, 0, CHUNK_SIZE - 1)

  if (raw.length < 10) return // not enough to embed

  const messages: BufferMessage[] = raw.map((r) =>
    typeof r === 'string' ? JSON.parse(r) : r,
  )

  // Keep overlap in buffer (last CHUNK_OVERLAP messages)
  await redis.ltrim(key, CHUNK_SIZE - CHUNK_OVERLAP, -1)

  const content = messages
    .map((m) => `${m.sender_name}: ${m.body}`)
    .join('\n')

  const members = [...new Set(messages.map((m) => m.sender_name))]
  const msgFrom = messages[0].timestamp
  const msgTo = messages[messages.length - 1].timestamp

  // Generate a 1-sentence summary for retrieval display
  const summary = await generateChunkSummary(content)

  // Embed the content
  const embedding = await embed(content)

  // Store in Supabase pgvector
  await db.from('message_chunks').insert({
    group_id:  groupId,
    content,
    summary,
    embedding: JSON.stringify(embedding), // Supabase handles vector cast
    msg_from:  msgFrom,
    msg_to:    msgTo,
    members,
  })

  // Check if we should generate an episode summary
  await maybeGenerateEpisodeSummary(groupId)
}

// ── Episode summary every 100 messages ───────────────────────

async function maybeGenerateEpisodeSummary(groupId: string) {
  const counterKey = `episode_counter:${groupId}`
  const count = await redis.incr(counterKey)

  if (count % 100 !== 0) return

  // Pull last 100 messages from DB for episode summary
  const { data: recentMessages } = await db
    .from('messages')
    .select('sender_name, body, timestamp')
    .eq('group_id', groupId)
    .eq('is_agent_reply', false)
    .order('timestamp', { ascending: false })
    .limit(100)

  if (!recentMessages || recentMessages.length < 20) return

  const content = recentMessages
    .reverse()
    .map((m) => `${m.sender_name}: ${m.body}`)
    .join('\n')

  const summary = await generateEpisodeSummary(content)
  const embedding = await embed(summary)

  const msgFrom = recentMessages[0].timestamp
  const msgTo = recentMessages[recentMessages.length - 1].timestamp

  await db.from('episode_summaries').insert({
    group_id:  groupId,
    summary,
    embedding: JSON.stringify(embedding),
    msg_from:  msgFrom,
    msg_to:    msgTo,
  })
}

// ── Chunk summary (1 sentence, cheap Haiku call) ──────────────

async function generateChunkSummary(content: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Summarize this WhatsApp group conversation in ONE sentence (max 20 words). Focus on the main topic or event.\n\n${content.slice(0, 2000)}`,
    }],
  })

  return response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : 'Group conversation.'
}
