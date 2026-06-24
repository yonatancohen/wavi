import OpenAI from 'openai';
import { recordEmbeddingCall } from './usage.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export interface EmbedOptions {
  groupId?: string;
}

// ── Single embedding ──────────────────────────────────────────

export async function embed(text: string, options?: EmbedOptions): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // safety trim
    dimensions: EMBEDDING_DIMENSIONS,
  });
  await recordEmbeddingCall({
    groupId: options?.groupId,
    totalTokens: response.usage?.total_tokens ?? 0,
    requests: 1,
  });
  return response.data[0].embedding;
}

// ── Batch embeddings (more efficient for ingestion) ───────────

export async function embedBatch(texts: string[], options?: EmbedOptions): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  await recordEmbeddingCall({
    groupId: options?.groupId,
    totalTokens: response.usage?.total_tokens ?? 0,
    requests: texts.length,
  });

  // OpenAI returns in order — safe to map by index
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export { EMBEDDING_DIMENSIONS };
