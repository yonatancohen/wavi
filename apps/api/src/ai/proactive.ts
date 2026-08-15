import Anthropic from '@anthropic-ai/sdk';
import { buildPromptContext, buildSystemPrompt, buildConversationTurns } from './prompt.js';
import {
  DEFAULT_REPLY_MODEL,
  normalizeReplyModel,
  isGroupReplyEnabled,
  type AutomationType,
  type DigestConfig,
  type GroupStatus,
  type LanguageMode,
  type ReplyModel,
  type ScheduledPostConfig,
  type SilenceNudgeConfig,
} from '@wavi/shared';
import { maybeAutoPauseOnBudget } from '../lib/cost.js';
import { db } from '../db/client.js';
import { textFromAnthropicContent } from './anthropic-text.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TOKENS = 500;

export type ProactiveMessage = {
  body: string;
  inputTokens: number;
  outputTokens: number;
};

type TriggerConfig = SilenceNudgeConfig | DigestConfig | ScheduledPostConfig;

function useHebrewTrigger(languageMode: LanguageMode): boolean {
  return languageMode !== 'en';
}

export function buildTriggerBody(type: AutomationType, config: TriggerConfig, opts?: { elapsedHours?: number; languageMode?: LanguageMode }): string {
  const he = useHebrewTrigger(opts?.languageMode ?? 'auto');

  switch (type) {
    case 'silence_nudge': {
      const hours = opts?.elapsedHours ?? (config as SilenceNudgeConfig).threshold_hours;
      return he
        ? `[system: הקבוצה שקטה כבר ${hours} שעות — תפתח שיחה טבעית לפי מה שקורה בקבוצה, האופי שלך, וחוטים פתוחים. עברית מדוברת ישראלית, משפטים תקינים, בלי תרגום מאנגלית.]`
        : `[system: the group has been quiet for ${hours} hours — start a natural conversation based on recent group activity, your character, and open threads]`;
    }
    case 'daily_digest':
      return he
        ? '[system: כתוב סיכום קצר באופי הקבוצה של מה שקרה לאחרונה. עברית מדוברת ישראלית, משפטים תקינים, בלי כותרות ובלי תרגום מאנגלית.]'
        : "[system: generate a short in-character daily summary of what's been happening in the group]";
    case 'scheduled_post': {
      const tpl = (config as ScheduledPostConfig).template;
      const isMeetingTemplate = tpl && /(?:מפגש|פגישה|יציאה|ביחד|meeting|meetup|hangout|gathering|dinner|lunch)/i.test(tpl);
      const base = tpl
        ? he
          ? `[system: תכתוב הודעה באופי הקבוצה — רמז: ${tpl}. עברית מדוברת ישראלית, משפטים תקינים, בלי תרגום מאנגלית.]`
          : `[system: post something in-character for the group — hint: ${tpl}]`
        : he
          ? '[system: תכתוב הודעה באופי הקבוצה עכשיו. עברית מדוברת ישראלית, משפטים תקינים, בלי תרגום מאנגלית.]'
          : '[system: post something in-character for the group right now]';

      if (isMeetingTemplate) {
        return he
          ? `${base}\n[גם: תזמין בסוף בצורה טבעית — משהו כמו "מי בא?" או "מי מגיע?" — קצר, באופי, שאלה אחת.]`
          : `${base}\n[Also: naturally invite RSVPs at the end — something like "מי בא?" or "מי מגיע?" — keep it casual, in-character, one short question]`;
      }
      return base;
    }
  }
}

/** Hebrew/auto automations always use Sonnet — Haiku turns English outlines into broken Hebrew. */
export function resolveAutomationModel(languageMode: LanguageMode, config?: { reply_model?: ReplyModel } | null): ReplyModel {
  if (languageMode !== 'en') return DEFAULT_REPLY_MODEL;
  return normalizeReplyModel(config?.reply_model);
}

export async function generateProactiveMessage(groupId: string, type: AutomationType, config: TriggerConfig, elapsedHours?: number): Promise<ProactiveMessage> {
  const agentId = process.env.AGENT_ID ?? null;
  if (agentId) {
    const paused = await maybeAutoPauseOnBudget(agentId);
    if (paused) throw new Error('Budget auto-pause active — skipping proactive message');
  }

  const { data: group } = await db.from('groups').select('status, wa_group_id, language_mode').eq('id', groupId).maybeSingle();
  if (!group || !isGroupReplyEnabled(group.status as GroupStatus)) {
    throw new Error(`Group ${groupId} is not active (${group?.status ?? 'missing'})`);
  }

  const languageMode = (group.language_mode ?? 'he') as LanguageMode;
  const agentName = process.env.WA_AGENT_NAME ?? 'wavi';
  const triggerBody = buildTriggerBody(type, config, { elapsedHours, languageMode });

  const ctx = await buildPromptContext({
    groupId,
    senderWaId: 'system',
    currentMessage: triggerBody,
    quotedMessage: null,
  });

  const replyModel = resolveAutomationModel(languageMode, ctx.character_config);
  const systemPrompt = buildSystemPrompt(ctx);
  const conversationTurns = buildConversationTurns(ctx);

  const response = await anthropic.messages.create({
    model: replyModel,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [...conversationTurns, { role: 'user', content: `${agentName}: ${triggerBody}` }],
  });

  const body = textFromAnthropicContent(response.content);

  return {
    body,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
