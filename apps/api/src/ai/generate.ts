import Anthropic from '@anthropic-ai/sdk';
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js';
import { parseImageReply } from './image-reply.js';
import { DEFAULT_REPLY_MODEL, type QuotedMessageContext, type ReplyModel } from '@wavi/shared';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MAX_TOKENS = 500;

export type GeneratedReply = {
  replyText: string;
  imagePrompt?: string;
  imageCaption?: string;
  inputTokens: number;
  outputTokens: number;
};

function resolveReplyModel(config: { reply_model?: ReplyModel } | null | undefined): ReplyModel {
  return config?.reply_model ?? DEFAULT_REPLY_MODEL;
}

export async function generateReplyText(params: {
  groupId: string;
  senderWaId: string;
  senderName: string;
  body: string;
  quotedMessage?: QuotedMessageContext | null;
  extraTurns?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<GeneratedReply> {
  const ctx = await buildPromptContext({
    groupId: params.groupId,
    senderWaId: params.senderWaId,
    currentMessage: params.body,
    quotedMessage: params.quotedMessage,
  });

  const replyModel = resolveReplyModel(ctx.character_config);
  const systemPrompt = buildSystemPrompt(ctx);
  const conversationTurns = buildConversationTurns(ctx);

  const response = await anthropic.messages.create({
    model: replyModel,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [...conversationTurns, ...(params.extraTurns ?? []), { role: 'user', content: `${params.senderName}: ${params.body}` }],
  });

  const rawReply = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  if (ctx.image_generation_enabled) {
    const imageReply = parseImageReply(rawReply);
    if (imageReply) {
      return {
        replyText: imageReply.caption,
        imagePrompt: imageReply.imagePrompt,
        imageCaption: imageReply.caption,
        ...usage,
      };
    }
  }

  return {
    replyText: rawReply,
    ...usage,
  };
}
