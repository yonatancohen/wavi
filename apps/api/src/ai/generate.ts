import Anthropic from '@anthropic-ai/sdk';
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js';
import { parseImageReply } from './image-reply.js';
import { anthropicContentTypes, textFromAnthropicContent } from './anthropic-text.js';
import { normalizeReplyModel, type QuotedMessageContext, type ReplyModel } from '@wavi/shared';
import { invokedRewriteInstruction, replyMissesInvokedPeople } from './reply-grounding.js';
import { stripEmptyDisagreementOpener } from './reply-opener.js';
import { effectiveReplyLanguage } from './language.js';

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

  let rawReply = textFromAnthropicContent(response.content);
  if (!rawReply) {
    console.warn(`[Generate] Empty reply text (blocks: ${anthropicContentTypes(response.content)})`);
  }
  let inputTokens = response.usage.input_tokens;
  let outputTokens = response.usage.output_tokens;

  if (ctx.image_generation_enabled) {
    const imageReply = parseImageReply(rawReply);
    if (imageReply) {
      return {
        replyText: imageReply.caption,
        imagePrompt: imageReply.imagePrompt,
        imageCaption: imageReply.caption,
        inputTokens,
        outputTokens,
      };
    }
  }

  const invoked = ctx.invoked_people ?? [];
  if (rawReply && invoked.length > 0 && replyMissesInvokedPeople(rawReply, invoked)) {
    const he = effectiveReplyLanguage(ctx.language_mode, ctx.current_message, ctx.recent_messages) === 'he';
    const retry = await anthropic.messages.create({
      model: replyModel,
      max_tokens: replyModel === 'claude-haiku-4-5' ? MAX_TOKENS : 1024,
      system: systemPrompt,
      messages: [
        ...conversationTurns,
        ...(params.extraTurns ?? []),
        { role: 'user', content: `${params.senderName}: ${ctx.current_message}` },
        { role: 'assistant', content: rawReply },
        { role: 'user', content: invokedRewriteInstruction(invoked, he) },
      ],
    });
    const retryText = textFromAnthropicContent(retry.content);
    if (retryText) rawReply = retryText;
    inputTokens += retry.usage.input_tokens;
    outputTokens += retry.usage.output_tokens;
  }

  // Strip dry-humor "לא," / "Nah," when the tagged ask was not yes/no — stops the
  // tic from landing in chat and from seeding the next voice-example capture.
  if (rawReply) {
    rawReply = stripEmptyDisagreementOpener(rawReply, ctx.current_message);
  }

  return {
    replyText: rawReply,
    inputTokens,
    outputTokens,
  };
}
