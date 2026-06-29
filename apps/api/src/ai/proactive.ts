import Anthropic from '@anthropic-ai/sdk';
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js';
import { DEFAULT_REPLY_MODEL, isGroupReplyEnabled, type AutomationType, type DigestConfig, type GroupStatus, type ReplyModel, type ScheduledPostConfig, type SilenceNudgeConfig } from '@wavi/shared';
import { maybeAutoPauseOnBudget } from '../lib/cost.js';
import { db } from '../db/client.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TOKENS = 500;

export type ProactiveMessage = {
  body: string;
  inputTokens: number;
  outputTokens: number;
};

function buildTriggerBody(type: AutomationType, config: SilenceNudgeConfig | DigestConfig | ScheduledPostConfig, elapsedHours?: number): string {
  switch (type) {
    case 'silence_nudge': {
      const hours = elapsedHours ?? (config as SilenceNudgeConfig).threshold_hours;
      return `[system: the group has been quiet for ${hours} hours — start a natural conversation based on recent group activity, your character, and open threads]`;
    }
    case 'daily_digest':
      return "[system: generate a short in-character daily summary of what's been happening in the group]";
    case 'scheduled_post': {
      const tpl = (config as ScheduledPostConfig).template;
      const isMeetingTemplate = tpl && /(?:מפגש|פגישה|יציאה|ביחד|meeting|meetup|hangout|gathering|dinner|lunch)/i.test(tpl);

      const base = tpl ? `[system: post something in-character for the group — hint: ${tpl}]` : '[system: post something in-character for the group right now]';

      if (isMeetingTemplate) {
        return `${base}\n[Also: naturally invite RSVPs at the end — something like "מי בא?" or "מי מגיע?" — keep it casual, in-character, one short question]`;
      }
      return base;
    }
  }
}

function resolveModel(config: { reply_model?: ReplyModel } | null | undefined): ReplyModel {
  return config?.reply_model ?? DEFAULT_REPLY_MODEL;
}

export async function generateProactiveMessage(
  groupId: string,
  type: AutomationType,
  config: SilenceNudgeConfig | DigestConfig | ScheduledPostConfig,
  elapsedHours?: number,
): Promise<ProactiveMessage> {
  const agentId = process.env.AGENT_ID ?? null;
  if (agentId) {
    const paused = await maybeAutoPauseOnBudget(agentId);
    if (paused) throw new Error('Budget auto-pause active — skipping proactive message');
  }

  const { data: group } = await db.from('groups').select('status, wa_group_id').eq('id', groupId).maybeSingle();
  if (!group || !isGroupReplyEnabled(group.status as GroupStatus)) {
    throw new Error(`Group ${groupId} is not active (${group?.status ?? 'missing'})`);
  }

  const agentName = process.env.WA_AGENT_NAME ?? 'wavi';
  const triggerBody = buildTriggerBody(type, config, elapsedHours);

  const ctx = await buildPromptContext({
    groupId,
    senderWaId: 'system',
    currentMessage: triggerBody,
    quotedMessage: null,
  });

  const replyModel = resolveModel(ctx.character_config);
  const systemPrompt = buildSystemPrompt(ctx);
  const conversationTurns = buildConversationTurns(ctx);

  const response = await anthropic.messages.create({
    model: replyModel,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [...conversationTurns, { role: 'user', content: `${agentName}: ${triggerBody}` }],
  });

  const body = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

  return {
    body,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
