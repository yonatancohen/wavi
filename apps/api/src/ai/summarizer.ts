import Anthropic from '@anthropic-ai/sdk';
import type { LanguageMode, EmojiUsageLevel, VoiceExample, AgentGender } from '@wavi/shared';
import { synthesisLanguageInstruction } from './language.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHARACTER_SYNTHESIS_RETRIES = 2;

export interface SynthesisUsageContext {
  groupId?: string;
}

export type SynthesizedCharacter = {
  voice: string;
  opinions: string[];
  signature_behavior: string;
  agent_gender?: AgentGender;
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
      voice: `חבר ותיק ב"${groupName}" — מדבר עברית יומיומית, מכיר את הקבוצה, קצת מגזים אבל לא מתנשא.`,
      opinions: ['תכנון יוצאים צריך להסתיים עם אוכל טוב', 'קבוצה בלי הומור זה לא קבוצה', 'אם לא סגרו מקום עד רביעי — זה לא קורה'],
      signature_behavior: 'מוסיף אנרגיה לכל תוכנית שכבר הוגדרה — כמו hype man של הקבוצה.',
      agent_gender: 'זכר',
      sliders: { formality: 15, humor: 75, verbosity: 45, assertiveness: 60, empathy: 70, emoji_usage: 'medium' },
      examples: [],
    };
  }

  return {
    voice: `A longtime member of ${groupName} who knows everyone well and matches the group's casual tone.`,
    opinions: ['Good plans should end with good food', 'A group without humor is just a calendar', 'If it is not locked by Wednesday it is not happening'],
    signature_behavior: 'Hypes up whatever the group already decided to do.',
    agent_gender: 'זכר',
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

  const genderRule =
    params.languageMode === 'he'
      ? 'agent_gender: infer the character\'s grammatical gender from the group context and member profiles. Use "זכר" (masculine) or "נקבה" (feminine). All-male group → "זכר". All-female → "נקבה". Mixed → choose whichever fits the persona best. Default "זכר" if ambiguous.'
      : '';

  return `${lang}
${languageFieldsRule}
${genderRule ? genderRule + '\n' : ''}
You are designing an AI persona for a WhatsApp group called "${params.groupName}".

Based on the group's history below, create a character that FITS this group's energy — grounded in their actual topics, inside jokes, and tone.

GROUP HISTORY SUMMARIES:
${params.episodeSummaries.slice(0, 10).join('\n\n')}

MEMBER PROFILES:
${params.userProfiles.join('\n')}

OPINION RULES — this is the most important part:
- Opinions must be specific to THIS group's real topics (trips they took, food spots they argue about, inside dynamics, recurring plans that fell through, etc.)
- Each opinion is a short, punchy sentence the character would actually say out loud in chat — opinionated, slightly provocative, conversation-starting
- NOT generic internet takes ("pizza is better than pasta") — those are filler and useless
- NOT neutral observations — opinions should have a clear stance someone in the group could agree or push back on
- Good example: "אם לא יצאנו ב-22:00 בדיוק, הלילה נגמר בפיצה אצל אחד מאיתנו ולא בבר"
- Good example: "Every time we try to plan something outdoors it rains — we should just stop pretending"
- Bad example: "Good food is important" — too vague
- Bad example: "Planning is fun" — not an opinion, not specific

Respond in valid JSON only (no markdown, no explanation):
{
  "voice": "2-3 sentence description of how this character talks and their personality — include one concrete speech habit or verbal tic",
  "opinions": ["<specific group-rooted opinion>", "<specific group-rooted opinion>", "<specific group-rooted opinion>"],
  "signature_behavior": "one specific recurring behavior grounded in this group's patterns — not generic",
  "agent_gender": "זכר",
  "sliders": {
    "formality": <0-100>,
    "humor": <0-100>,
    "verbosity": <0-100>,
    "assertiveness": <0-100>,
    "empathy": <0-100>,
    "emoji_usage": "none|low|medium|high"
  },
  "examples": [
    { "user": "<realistic message based on what this group actually talks about>", "agent": "<in-character reply that shows the voice, not just agrees>" },
    { "user": "<another realistic message, different topic/tone>", "agent": "<reply>" },
    { "user": "<a third message — include at least one where the agent voices an opinion or pushes back>", "agent": "<reply>" }
  ]
}`;
}

async function callCharacterSynthesis(prompt: string, usageContext?: SynthesisUsageContext): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });
  return response.content[0].type === 'text' ? response.content[0].text : '{}';
}

function parseCharacterJson(text: string): SynthesizedCharacter {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as SynthesizedCharacter;
}

// ── Episode summary (every 100 messages) ─────────────────────

export async function generateEpisodeSummary(content: string, languageMode: LanguageMode = 'auto', usageContext?: SynthesisUsageContext): Promise<string> {
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
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Group activity.';
}

// ── Rolling group context (every 100 messages) ────────────────

export async function generateGroupContext(params: {
  groupName: string;
  recentContent: string;
  previousContext: string;
  languageMode?: LanguageMode;
  usageContext?: SynthesisUsageContext;
}): Promise<string> {
  const lang = synthesisLanguageInstruction(params.languageMode ?? 'auto');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `${lang}

You are capturing the living memory of a WhatsApp group called "${params.groupName}" for an AI group member that needs to participate naturally.

Previous context (what was known before): ${params.previousContext || 'None'}

Recent conversation:
${params.recentContent.slice(0, 3000)}

Write a SHORT context block (max 150 words) IN THE SAME LANGUAGE as the group (${lang}) covering:
1. Active threads: what are people planning, discussing, or waiting for right now?
2. Group mood: what's the energy — excited, annoyed, joking around?
3. Open loops: any unresolved questions, unanswered messages, or pending decisions?
4. Recent callbacks: inside jokes, references, or events that came up and might be referenced again

Be specific (names, places, events). Skip generic observations. Write as if briefing someone who was away for a week and needs to jump back into the chat naturally.`,
      },
    ],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: params.usageContext?.groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

// ── Character synthesis (Sonnet — used at setup only) ─────────

export async function synthesizeCharacter(params: {
  groupName: string;
  episodeSummaries: string[];
  userProfiles: string[];
  languageMode: LanguageMode;
  usageContext?: SynthesisUsageContext;
}): Promise<SynthesizedCharacter> {
  const prompt = buildCharacterSynthesisPrompt(params);
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHARACTER_SYNTHESIS_RETRIES; attempt++) {
    try {
      const text = await callCharacterSynthesis(prompt, params.usageContext);
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
export async function generateChunkSummary(content: string, languageMode: LanguageMode = 'auto', usageContext?: SynthesisUsageContext): Promise<string> {
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
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Group conversation.';
}
