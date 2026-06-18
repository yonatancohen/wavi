import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

// ── Single embedding ──────────────────────────────────────────

export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // safety trim
    dimensions: EMBEDDING_DIMENSIONS,
  })
  return response.data[0].embedding
}

// ── Batch embeddings (more efficient for ingestion) ───────────

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  })

  // OpenAI returns in order — safe to map by index
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

export { EMBEDDING_DIMENSIONS }
