import Anthropic from '@anthropic-ai/sdk';
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js';
import { parseImageReply } from './image-reply.js';
import { anthropicContentTypes, textFromAnthropicContent } from './anthropic-text.js';
import { normalizeReplyModel, type QuotedMessageContext, type ReplyModel } from '@wavi/shared';

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
  return normalizeReplyModel(config?.reply_model);
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
    // Sonnet 5 may emit a thinking block first; keep headroom so text is not truncated to empty.
    max_tokens: replyModel === 'claude-haiku-4-5' ? MAX_TOKENS : 1024,
    system: systemPrompt,
    // Use ctx.current_message (mention @digits already rewritten to @DisplayName).
    messages: [...conversationTurns, ...(params.extraTurns ?? []), { role: 'user', content: `${params.senderName}: ${ctx.current_message}` }],
  });

  const rawReply = textFromAnthropicContent(response.content);
  if (!rawReply) {
    console.warn(`[Generate] Empty reply text (blocks: ${anthropicContentTypes(response.content)})`);
  }
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
