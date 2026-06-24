import OpenAI from 'openai';
import { recordImageGenerationCall } from '../lib/usage.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_MODEL = 'dall-e-3';

export async function generateImage(prompt: string, groupId?: string): Promise<{ buffer: Buffer; mimetype: string }> {
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });

  await recordImageGenerationCall({ groupId });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no data');

  return {
    buffer: Buffer.from(b64, 'base64'),
    mimetype: 'image/png',
  };
}
