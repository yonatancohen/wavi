import Anthropic from '@anthropic-ai/sdk';
import type { LanguageMode, EmojiUsageLevel, VoiceExample } from '@wavi/shared';
import { synthesisLanguageInstruction } from './language.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHARACTER_SYNTHESIS_RETRIES = 2;

export type SynthesizedCharacter = {
  voice: string;
  opinions: string[];
  signature_behavior: string;
  sliders: {
    formality: number;
    humor: number;
    verbosity: number;
    assertiveness: number;
    empathy: number;
    emoji_usage: EmojiUsageLevel;
  };
  examples: VoiceExample[];
};

function defaultCharacterFallback(groupName: string, languageMode: LanguageMode): SynthesizedCharacter {
  if (languageMode === 'he') {
    return {
      voice: `חבר/ה ותיק/ה ב"${groupName}" — מדבר/ת עברית יומיומית, מכיר/ה את הקבוצה, קצת מגזים/ה אבל לא מתנשא/ת.`,
      opinions: ['תכנון יוצאים צריך להסתיים עם אוכל טוב', 'קבוצה בלי הומור זה לא קבוצה', 'אם לא סגרו מקום עד רביעי — זה לא קורה'],
      signature_behavior: 'מוסיף/ה אנרגיה לכל תוכנית שכבר הוגדרה — כמו hype man של הקבוצה.',
      sliders: { formality: 15, humor: 75, verbosity: 45, assertiveness: 60, empathy: 70, emoji_usage: 'medium' },
      examples: [],
    };
  }

  return {
    voice: `A longtime member of ${groupName} who knows everyone well and matches the group's casual tone.`,
    opinions: ['Good plans should end with good food', 'A group without humor is just a calendar', 'If it is not locked by Wednesday it is not happening'],
    signature_behavior: 'Hypes up whatever the group already decided to do.',
    sliders: { formality: 30, humor: 70, verbosity: 50, assertiveness: 60, empathy: 65, emoji_usage: 'medium' },
    examples: [],
  };
}

function buildCharacterSynthesisPrompt(params: { groupName: string; episodeSummaries: string[]; userProfiles: string[]; languageMode: LanguageMode }): string {
  const lang = synthesisLanguageInstruction(params.languageMode);
  const languageFieldsRule =
    params.languageMode === 'he'
      ? 'CRITICAL: voice, every opinion, signature_behavior, and ALL user/agent text in examples MUST be in natural Israeli Hebrew — no English in those fields.'
      : params.languageMode === 'en'
        ? 'CRITICAL: voice, opinions, signature_behavior, and examples MUST be in English.'
        : 'CRITICAL: voice, opinions, signature_behavior, and examples MUST follow the language rule above.';

  return `${lang}
${languageFieldsRule}

You are designing an AI persona for a WhatsApp group called "${params.groupName}".

Based on the group's history below, create a character that FITS this group's energy — grounded in their actual topics, inside jokes, and tone. Use specific themes from the summaries (trips, food, family, plans) — NOT generic internet opinions.

GROUP HISTORY SUMMARIES:
${params.episodeSummaries.slice(0, 10).join('\n\n')}

MEMBER PROFILES:
${params.userProfiles.join('\n')}

Respond in valid JSON only (no markdown, no explanation):
{
  "voice": "2-3 sentence description of how this character talks and their personality",
  "opinions": ["opinion 1", "opinion 2", "opinion 3"],
  "signature_behavior": "one specific recurring quirk or behavior",
  "sliders": {
    "formality": <0-100>,
    "humor": <0-100>,
    "verbosity": <0-100>,
    "assertiveness": <0-100>,
    "empathy": <0-100>,
    "emoji_usage": "none|low|medium|high"
  },
  "examples": [
    { "user": "<a message a group member might send>", "agent": "<how this character would reply — natural length, in character>" },
    { "user": "<another realistic message>", "agent": "<reply>" },
    { "user": "<a third message>", "agent": "<reply>" }
  ]
}`;
}

async function callCharacterSynthesis(prompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '{}';
}

function parseCharacterJson(text: string): SynthesizedCharacter {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as SynthesizedCharacter;
}

// ── Episode summary (every 100 messages) ─────────────────────

export async function generateEpisodeSummary(content: string, languageMode: LanguageMode = 'auto'): Promise<string> {
  const lang = synthesisLanguageInstruction(languageMode);
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `${lang}\n\nSummarize this WhatsApp group conversation in 2-3 sentences. Focus on: what happened, who was involved, and any decisions or notable moments.\n\n${content.slice(0, 4000)}`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Group activity.';
}

// ── Rolling group context (every 100 messages) ────────────────

export async function generateGroupContext(params: { groupName: string; recentContent: string; previousContext: string; languageMode?: LanguageMode }): Promise<string> {
  const lang = synthesisLanguageInstruction(params.languageMode ?? 'auto');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `${lang}\n\nYou are analyzing a WhatsApp group called "${params.groupName}".

Previous context: ${params.previousContext || 'None'}

Recent conversation:
${params.recentContent.slice(0, 3000)}

Write a SHORT context summary (max 150 words) covering:
- What topics are currently active
- The current tone/energy of the group
- Any ongoing threads or unresolved discussions
- Any memorable recent moments`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

// ── Character synthesis (Sonnet — used at setup only) ─────────

export async function synthesizeCharacter(params: { groupName: string; episodeSummaries: string[]; userProfiles: string[]; languageMode: LanguageMode }): Promise<SynthesizedCharacter> {
  const prompt = buildCharacterSynthesisPrompt(params);
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHARACTER_SYNTHESIS_RETRIES; attempt++) {
    try {
      const text = await callCharacterSynthesis(prompt);
      return parseCharacterJson(text);
    } catch (err) {
      lastError = err;
      console.warn(`[Character] Synthesis attempt ${attempt}/${CHARACTER_SYNTHESIS_RETRIES} failed for "${params.groupName}":`, err);
    }
  }

  console.error(`[Character] Using ${params.languageMode} fallback for "${params.groupName}":`, lastError);
  return defaultCharacterFallback(params.groupName, params.languageMode);
}

/** Chunk summary (1 sentence). */
export async function generateChunkSummary(content: string, languageMode: LanguageMode = 'auto'): Promise<string> {
  const lang = synthesisLanguageInstruction(languageMode);
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `${lang}\n\nSummarize this WhatsApp group conversation in ONE sentence (max 20 words). Focus on the main topic or event.\n\n${content.slice(0, 2000)}`,
      },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Group conversation.';
}
