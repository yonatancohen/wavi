import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { parseWAExport, chunkMessages, formatChunkForEmbedding } from '../lib/parser.js'
import { embedBatch, embed } from '../lib/embeddings.js'
import { generateEpisodeSummary, generateGroupContext, synthesizeCharacter } from '../ai/summarizer.js'
import type { IngestionProgress } from '@wavi/shared'

export const ingestRoute: FastifyPluginAsync = async (fastify) => {

  // ── POST /api/ingest/:groupId — upload .txt export ───────────
  fastify.post<{ Params: { groupId: string } }>('/:groupId', async (req, reply) => {
    const { groupId } = req.params

    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file uploaded' })

    const buffer = await data.toBuffer()
    const raw = buffer.toString('utf-8')

    // Start ingestion as background job — respond immediately
    reply.send({ ok: true, message: 'Ingestion started' })

    // Fire and forget (non-blocking)
    runIngestion(groupId, raw).catch((err) => {
      console.error('[Ingest] Failed:', err)
    })
  })

  // ── GET /api/ingest/:groupId/progress — SSE progress stream ──
  fastify.get<{ Params: { groupId: string } }>('/:groupId/progress', async (req, reply) => {
    const { groupId } = req.params

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders()

    const sendProgress = (progress: IngestionProgress) => {
      reply.raw.write(`data: ${JSON.stringify(progress)}\n\n`)
    }

    // Poll Redis for progress updates
    const interval = setInterval(async () => {
      const raw = await redis.get(`ingestion_progress:${groupId}`)
      if (raw) {
        const progress = typeof raw === 'string' ? JSON.parse(raw) : raw
        sendProgress(progress)
        if (progress.stage === 'done' || progress.stage === 'error') {
          clearInterval(interval)
          reply.raw.end()
        }
      }
    }, 500)

    req.raw.on('close', () => clearInterval(interval))
  })
}

// ── Background ingestion pipeline ────────────────────────────

async function runIngestion(groupId: string, raw: string) {
  const progressKey = `ingestion_progress:${groupId}`

  const setProgress = async (progress: Partial<IngestionProgress>) => {
    await redis.setex(progressKey, 3600, JSON.stringify({
      group_id: groupId,
      total_messages: 0,
      processed_messages: 0,
      chunks_embedded: 0,
      stage: 'parsing',
      ...progress,
    }))
  }

  try {
    // ── Stage 1: Parse ──────────────────────────────────────
    await setProgress({ stage: 'parsing' })
    const messages = parseWAExport(raw)
    const realMessages = messages.filter((m) => !m.is_system_message)

    await setProgress({ stage: 'embedding', total_messages: realMessages.length })

    // ── Stage 2: Chunk + Embed ──────────────────────────────
    const chunks = chunkMessages(realMessages, 50, 25)
    const BATCH_SIZE = 10 // embed 10 chunks at a time

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const contents = batch.map(formatChunkForEmbedding)

      // Filter out empty chunks
      const nonEmpty = contents.filter((c) => c.length > 20)
      if (nonEmpty.length === 0) continue

      const embeddings = await embedBatch(nonEmpty)

      const rows = nonEmpty.map((content, idx) => {
        const originalChunk = batch[idx]
        if (!originalChunk) return null
        return {
          group_id:  groupId,
          content,
          summary:   null, // will be filled in background
          embedding: JSON.stringify(embeddings[idx]),
          msg_from:  originalChunk[0]?.timestamp.toISOString(),
          msg_to:    originalChunk[originalChunk.length - 1]?.timestamp.toISOString(),
          members:   [...new Set(originalChunk.map((m) => m.sender_name))],
        }
      }).filter(Boolean)

      await db.from('message_chunks').insert(rows.filter(Boolean) as any[])

      await setProgress({
        stage: 'embedding',
        total_messages: realMessages.length,
        processed_messages: Math.min((i + BATCH_SIZE) * 50, realMessages.length),
        chunks_embedded: i + BATCH_SIZE,
      })
    }

    // ── Stage 3: User profiling ─────────────────────────────
    await setProgress({ stage: 'profiling', processed_messages: realMessages.length, chunks_embedded: chunks.length })
    await buildUserProfilesFromHistory(groupId, realMessages)

    // ── Stage 4: Episode summaries ──────────────────────────
    const episodeSummaries: string[] = []
    for (let i = 0; i < realMessages.length; i += 100) {
      const slice = realMessages.slice(i, i + 100)
      const content = slice.map((m) => `${m.sender_name}: ${m.body}`).join('\n')
      const summary = await generateEpisodeSummary(content)
      episodeSummaries.push(summary)

      const embedding = await embed(summary)
      await db.from('episode_summaries').insert({
        group_id:  groupId,
        summary,
        embedding: JSON.stringify(embedding),
        msg_from:  slice[0]?.timestamp.toISOString(),
        msg_to:    slice[slice.length - 1]?.timestamp.toISOString(),
      })
    }

    // ── Stage 5: Character synthesis ────────────────────────
    await setProgress({ stage: 'synthesizing' })

    const { data: profiles } = await db
      .from('user_profiles')
      .select('display_name, behavioral_summary')
      .eq('group_id', groupId)

    const { data: group } = await db
      .from('groups')
      .select('name, language_mode')
      .eq('id', groupId)
      .single()

    const character = await synthesizeCharacter({
      groupName:        group?.name ?? 'the group',
      episodeSummaries: episodeSummaries.slice(-10),
      userProfiles:     (profiles ?? []).map((p) => `${p.display_name}: ${p.behavioral_summary}`),
      languageMode:     group?.language_mode ?? 'auto',
    })

    await db.from('groups').update({
      character_config: { ...character, preset: 'custom', version: 1 },
    }).eq('id', groupId)

    await setProgress({ stage: 'done' })

  } catch (err: any) {
    console.error('[Ingest] Error:', err)
    await setProgress({ stage: 'error', error: err.message ?? 'Unknown error' })
  }
}

// ── Build user profiles from parsed history ───────────────────

async function buildUserProfilesFromHistory(
  groupId: string,
  messages: Array<{ sender_name: string; body: string; timestamp: Date }>,
) {
  // Group messages by sender
  const byUser: Record<string, string[]> = {}
  for (const msg of messages) {
    if (!byUser[msg.sender_name]) byUser[msg.sender_name] = []
    byUser[msg.sender_name].push(msg.body)
  }

  for (const [name, msgs] of Object.entries(byUser)) {
    if (msgs.length < 5) continue // not enough data

    const sample = msgs.slice(-100).join('\n')

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Analyze this person's WhatsApp messages and return JSON only:
{
  "humor_type": "sarcastic|absurdist|self-deprecating|dad-jokes|dry|none",
  "humor_score": <0-100>,
  "formality_score": <0-100>,
  "activity_level": "high|medium|low|lurker",
  "dominant_topics": ["topic1", "topic2"],
  "sensitivity_flags": [],
  "emoji_usage": "heavy|moderate|rare|none",
  "avg_message_length": "long|medium|short|terse",
  "behavioral_summary": "One sentence describing how this person communicates"
}

Messages from ${name}:
${sample.slice(0, 2000)}`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

    try {
      const clean = text.replace(/```json|```/g, '').trim()
      const profile = JSON.parse(clean)

      await db.from('user_profiles').upsert({
        group_id:           groupId,
        wa_user_id:         name, // will be reconciled with real WA IDs later
        display_name:       name,
        profile_data:       profile,
        behavioral_summary: profile.behavioral_summary ?? '',
        msg_count:          msgs.length,
        last_updated:       new Date().toISOString(),
      }, { onConflict: 'group_id,wa_user_id' })
    } catch {
      // Skip malformed profile
    }
  }
}
