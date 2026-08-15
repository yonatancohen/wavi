import Anthropic from '@anthropic-ai/sdk';
import type { LanguageMode, EmojiUsageLevel, VoiceExample, AgentGender, HumorDNA } from '@wavi/shared';
import { parseEpisodeSummaryResponse, type EpisodeSummaryResult, type ExtractedEvent } from './episode-events.js';
import { hebrewAwareModel, synthesisLanguageInstruction } from './language.js';
import { isBrokenBriefing, isMetaGroupContext } from './context-quality.js';
import { evaluateOpinion, parseSynthesisOpinions } from './opinion-quality.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHARACTER_SYNTHESIS_RETRIES = 2;
const GROUP_CONTEXT_RETRIES = 2;

export interface SynthesisUsageContext {
  groupId?: string;
}

export type SynthesizedCharacter = {
  voice: string;
  opinions: string[];
  signature_behavior: string;
  agent_gender?: AgentGender;
  humor_dna?: HumorDNA;
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

export type CharacterSynthesisInput = {
  groupName: string;
  episodeSummaries: string[];
  userProfiles: string[];
  relationshipNarratives?: string[];
  voiceSamples?: string[];
  languageMode: LanguageMode;
};

export function buildCharacterSynthesisPrompt(params: CharacterSynthesisInput): string {
  const lang = synthesisLanguageInstruction(params.languageMode);
  const languageFieldsRule =
    params.languageMode === 'he'
      ? 'CRITICAL: voice, every opinion stance/because, signature_behavior, and ALL user/agent text in examples MUST be in natural Israeli Hebrew — no English in those fields.'
      : params.languageMode === 'en'
        ? 'CRITICAL: voice, opinions, signature_behavior, and examples MUST be in English.'
        : 'CRITICAL: voice, opinions, signature_behavior, and examples MUST follow the language rule above.';

  const genderRule =
    params.languageMode === 'he'
      ? 'agent_gender: infer the character\'s grammatical gender from the group context and member profiles. Use "זכר" (masculine) or "נקבה" (feminine). All-male group → "זכר". All-female → "נקבה". Mixed → choose whichever fits the persona best. Default "זכר" if ambiguous.'
      : '';

  const facts = params.episodeSummaries.slice(0, 10).join('\n\n') || '(none)';
  const people = params.userProfiles.join('\n') || '(none)';
  const dynamics = (params.relationshipNarratives ?? []).filter(Boolean).slice(0, 8).join('\n') || '(none)';
  const lines = (params.voiceSamples ?? []).slice(0, 20).join('\n') || '(none)';

  return `${lang}
${languageFieldsRule}
${genderRule ? genderRule + '\n' : ''}
You are designing an AI persona for a WhatsApp group called "${params.groupName}".

Create a character that FITS this group's energy. History below is FACTS — do not copy it into opinions.

GROUP HISTORY (facts only — what happened; NOT personality, NOT opinions):
${facts}

PEOPLE AND DYNAMICS:
${people}
${dynamics}

REAL LINES FROM THIS CHAT (match this register; steal topics, not recaps):
${lines}

OPINION RULES — this is the most important part:
- Each opinion is a present-tense TAKE someone in the group could agree or push back on
- stance: a short punchy sentence the character would actually say out loud
- because: a group-specific reason (recurring pattern, dynamic, habit) — not a recap of one outing
- NOT a past-tense event ("we went to Eilat", "הקבוצה יצאה לאילת") — those are facts, already in history
- NOT generic internet takes ("pizza is better than pasta")
- NOT neutral observations ("planning is fun", "good food is important")
- Good example: "אם לא יצאנו ב-22:00 בדיוק, הלילה נגמר בפיצה אצל אחד מאיתנו ולא בבר"
- Good example: "Every time we try to plan something outdoors it rains — we should just stop pretending"
- Bad example: "יצאנו לאילת בקיץ" — recap, not an opinion
- Bad example: "The group decided to stay in" — recap, not an opinion

HUMOR DNA — equally important:
- style: identify the DOMINANT humor mode of this group from the actual messages (sarcastic, absurdist, self-deprecating, dad-jokes, dry, or none if the group is serious)
- recurring_bits: specific phrases, callback jokes, or running gags that came up multiple times — pulled from actual history, not invented
- inside_references: dynamics or situations the group references for humor (e.g. "always blames Dan when plans fail", "the trip to Eilat always comes up")
- example: quote or reconstruct ONE moment from history that got a big reaction — be specific (who said what)
If the history doesn't have clear humor patterns, it's fine to return minimal/empty arrays and "none" for style. Don't invent.

Respond in valid JSON only (no markdown, no explanation):
{
  "voice": "2-3 sentence description of how this character talks and their personality — include one concrete speech habit or verbal tic",
  "opinions": [
    { "topic": "<what they actually argue about>", "stance": "<present-tense take>", "because": "<group-specific reason, not a recap>" },
    { "topic": "<topic>", "stance": "<take>", "because": "<reason>" },
    { "topic": "<topic>", "stance": "<take>", "because": "<reason>" }
  ],
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
  "humor_dna": {
    "style": "<one of: sarcastic|absurdist|self-deprecating|dad-jokes|dry|none>",
    "recurring_bits": ["<a phrase or joke pattern that repeats in this group>", "<another bit>"],
    "inside_references": ["<a group-specific reference or callback>", "<another>"],
    "example": "<ONE concrete example of something that made the group laugh — from their history>"
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
  const parsed = JSON.parse(clean) as SynthesizedCharacter & { opinions?: unknown };
  return { ...parsed, opinions: parseSynthesisOpinions(parsed.opinions) };
}

function rejectedOpinionLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const lines: string[] = [];
  for (const item of raw) {
    const text =
      typeof item === 'string' ? item.trim() : item && typeof item === 'object' && typeof (item as { stance?: unknown }).stance === 'string' ? String((item as { stance: string }).stance).trim() : '';
    if (!text) continue;
    const result = evaluateOpinion(text);
    if (!result.ok) lines.push(`${text} (${result.reason})`);
  }
  return lines;
}

// ── Episode summary (every 100 messages) ─────────────────────

export function buildEpisodeSummaryPrompt(content: string, languageMode: LanguageMode = 'auto'): string {
  const lang = synthesisLanguageInstruction(languageMode);
  const task =
    languageMode === 'he'
      ? `סכם את השיחה. החזר JSON בלבד (בלי markdown):
{
  "summary": "2–3 משפטים תקינים: מה קרה, מי היה מעורב, החלטות או רגעים בולטים",
  "events": [
    { "who": ["<שמות>"], "what": "<אירוע ממשי>", "when": "<תאריך או זמן יחסי אם ידוע>", "why_it_matters": "<למה זה עלול לחזור>" }
  ]
}

כללי אירועים:
- 0–3 אירועים. רק דברים ממשיים (טיול, החלטה, מקום, ריב שנפתר, תוכנית שנסגרה).
- בלי אווירה בלבד ובלי בדיחות בלי תוצאה.
- who/what חובה; when/why_it_matters רשות.
העברית ב-summary וב-what חייבת להיות תקינה — משפטים שלמים, התאם מין לשמות.`
      : `Summarize this WhatsApp group conversation. Return JSON only (no markdown):
{
  "summary": "2-3 factual sentences: what happened, who was involved, decisions or notable moments",
  "events": [
    { "who": ["<names>"], "what": "<concrete event>", "when": "<date or relative time if known>", "why_it_matters": "<why this might come up again>" }
  ]
}

Events rules:
- 0–3 events. Only include concrete things (trip, decision, place, fight that resolved, plan that locked).
- Skip vibe, jokes-with-no-outcome, and generic chat.
- who/what required; when/why_it_matters optional.`;

  return `${lang}

${task}

Conversation:
${content.slice(0, 4000)}`;
}

export async function generateEpisodeSummary(content: string, languageMode: LanguageMode = 'auto', usageContext?: SynthesisUsageContext): Promise<EpisodeSummaryResult> {
  const response = await anthropic.messages.create({
    model: hebrewAwareModel(languageMode),
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: buildEpisodeSummaryPrompt(content, languageMode),
      },
    ],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  return parseEpisodeSummaryResponse(text || 'Group activity.');
}

export function buildExtractEventsPrompt(summary: string, languageMode: LanguageMode = 'auto'): string {
  const lang = synthesisLanguageInstruction(languageMode);
  const task =
    languageMode === 'en'
      ? `Extract 0–3 durable events from this group episode summary. JSON only:
{ "events": [{ "who": ["<names>"], "what": "<concrete event>", "when": "<if known>", "why_it_matters": "<why it might come up again>" }] }
Skip vibe-only summaries. Empty events is fine.`
      : `חלץ 0–3 אירועים יציבים מתקציר הפרק. JSON בלבד:
{ "events": [{ "who": ["<שמות>"], "what": "<אירוע ממשי>", "when": "<אם ידוע>", "why_it_matters": "<למה זה עלול לחזור>" }] }
דלג על אווירה בלבד. מערך ריק זה בסדר.`;
  return `${lang}

${task}

Summary:
${summary.slice(0, 1500)}`;
}

/** Cheap backfill: extract events from an existing episode summary, not raw messages. */
export async function extractEventsFromSummary(summary: string, languageMode: LanguageMode = 'auto', usageContext?: SynthesisUsageContext): Promise<ExtractedEvent[]> {
  const response = await anthropic.messages.create({
    model: hebrewAwareModel(languageMode),
    max_tokens: 250,
    messages: [
      {
        role: 'user',
        content: buildExtractEventsPrompt(summary, languageMode),
      },
    ],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
  return parseEpisodeSummaryResponse(text).events;
}

// ── Rolling group context (every 100 messages) ────────────────

export type GroupContextInput = {
  groupName: string;
  recentContent: string;
  previousContext: string;
  recentEvents?: string;
  recentLines?: string;
  memberRoster?: string;
  languageMode?: LanguageMode;
};

export class MetaGroupContextError extends Error {
  constructor() {
    super('Summary came back as a complaint about missing data. Ingest more chat, then try again.');
    this.name = 'MetaGroupContextError';
  }
}

export function buildGroupContextPrompt(params: GroupContextInput): string {
  const mode = params.languageMode ?? 'auto';
  const lang = synthesisLanguageInstruction(mode);
  const events = params.recentEvents?.trim() || '(none)';
  const lines = params.recentLines?.trim() || '(none)';
  const roster = params.memberRoster?.trim() || '(none)';
  const sources = `Previous briefing (ignore if it talks about missing data, prompts, or has markdown titles): ${params.previousContext || 'None'}

PEOPLE IN THIS GROUP (use the name before "also:", never the nickname):
${roster}

GROUP HISTORY (episode notes):
${params.recentContent.slice(0, 3000) || '(none)'}

THINGS THAT HAPPENED (remembered events, facts only):
${events}

REAL LINES FROM THIS CHAT:
${lines.slice(0, 4000)}`;

  if (mode === 'he') {
    return `${lang}

כתוב תדריך קצר (עד 120 מילים) על מה קורה בקבוצת הוואטסאפ "${params.groupName}" — לחבר שחזר אחרי שבוע.

${sources}

כסה בפסקאות רציפות (לא כרשימה):
- מה מתכננים / על מה מתווכחים / למה מחכים
- האווירה
- דברים פתוחים
- קולות חוזרים (בדיחות, שמות, אירועים)

כללים:
- פלט = רק התדריך. בלי כותרת, בלי המילה בריפינג, בלי markdown, בלי כוכביות, בלי אימוג'י בכותרת, בלי רשימות ממוספרות.
- משפטים שלמים ותקינים. התאם מין לשמות.
- אל תפנה למפעיל ואל תתלונן על חוסר מידע. אם החומר דל — כתוב שהקבוצה הייתה שקטה.
- שמות ומקומות ספציפיים. בלי הכללות.
- השתמש רק בשמות הראשיים מרשימת האנשים. אם בשורות כתוב כינוי (My Love, Chen) — כתוב את השם הראשי (גל, חן).
- אל תתרגם שמות: חן לא הופך לצ'ן, גל לא הופך ל-Gal.`;
  }

  return `${lang}

Write a short briefing of what is going on in the WhatsApp group "${params.groupName}" so a member who was away for a week can jump back in.

${sources}

Cover, in at most 150 words, as continuous prose (not a titled report):
1. Active threads — plans, debates, waiting-for
2. Group mood
3. Open loops
4. Callbacks (jokes, names, events that might come up again)

Rules:
- Output ONLY the briefing. No preamble, no markdown, no title, no lists of what you need, no addressing the operator.
- Never mention prompts, blocks, context windows, loading, or missing data.
- If the notes are thin, say the group has been quiet — that is a valid briefing, not a reason to refuse.
- Be specific (names, places, events). Skip generic observations.
- Use only the canonical names from PEOPLE IN THIS GROUP. If a line uses a nickname (My Love, Chen), write the main name (גל, חן).
- Do not transliterate names (חן stays חן, not צ'ן).`;
}

async function callGroupContext(prompt: string, usageContext?: SynthesisUsageContext, languageMode?: LanguageMode): Promise<string> {
  const response = await anthropic.messages.create({
    model: hebrewAwareModel(languageMode),
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });
  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

export async function generateGroupContext(params: GroupContextInput & { usageContext?: SynthesisUsageContext }): Promise<string> {
  const basePrompt = buildGroupContextPrompt(params);
  let rejectedNote = '';

  for (let attempt = 1; attempt <= GROUP_CONTEXT_RETRIES; attempt++) {
    const prompt = rejectedNote ? `${basePrompt}\n\n${rejectedNote}` : basePrompt;
    const text = await callGroupContext(prompt, params.usageContext, params.languageMode);
    if (text && !isMetaGroupContext(text) && !isBrokenBriefing(text)) return text;

    rejectedNote =
      params.languageMode === 'he'
        ? 'הפלט הקודם נפסל. כתבת תלונה, כותרת, markdown או עברית שבורה. כתוב רק תדריך רציף ותקין מהחומר. בלי בריפינג, בלי כוכביות.'
        : 'PREVIOUS OUTPUT WAS REJECTED. You wrote about missing data, used markdown/titles, or addressed the operator. Write ONLY a prose briefing from the source material.';
    console.warn(`[GroupContext] Attempt ${attempt}/${GROUP_CONTEXT_RETRIES} was meta or empty for "${params.groupName}"`);
  }

  throw new MetaGroupContextError();
}

// ── Character synthesis (Sonnet — used at setup only) ─────────

export async function synthesizeCharacter(params: CharacterSynthesisInput & { usageContext?: SynthesisUsageContext }): Promise<SynthesizedCharacter> {
  const basePrompt = buildCharacterSynthesisPrompt(params);
  let lastError: unknown;
  let rejectedNote = '';

  for (let attempt = 1; attempt <= CHARACTER_SYNTHESIS_RETRIES; attempt++) {
    try {
      const prompt = rejectedNote ? `${basePrompt}\n\n${rejectedNote}` : basePrompt;
      const text = await callCharacterSynthesis(prompt, params.usageContext);
      const parsed = parseCharacterJson(text);
      if (parsed.opinions.length >= 2) return parsed;

      if (attempt === CHARACTER_SYNTHESIS_RETRIES && parsed.opinions.length > 0) {
        const fallback = defaultCharacterFallback(params.groupName, params.languageMode);
        return { ...parsed, opinions: [...parsed.opinions, ...fallback.opinions].slice(0, 3) };
      }

      const raw = JSON.parse(text.replace(/```json|```/g, '').trim()) as { opinions?: unknown };
      const rejected = rejectedOpinionLines(raw.opinions);
      rejectedNote = rejected.length
        ? `PREVIOUS OPINIONS WERE REJECTED (recaps or generic). Do not repeat these:\n${rejected.map((line) => `- ${line}`).join('\n')}`
        : 'PREVIOUS OPINIONS WERE TOO FEW OR INVALID. Write 3 present-tense takes, not event recaps.';
      lastError = new Error(`Only ${parsed.opinions.length} valid opinions`);
      console.warn(`[Character] Synthesis attempt ${attempt}/${CHARACTER_SYNTHESIS_RETRIES} had weak opinions for "${params.groupName}"`);
    } catch (err) {
      lastError = err;
      console.warn(`[Character] Synthesis attempt ${attempt}/${CHARACTER_SYNTHESIS_RETRIES} failed for "${params.groupName}":`, err);
    }
  }

  console.error(`[Character] Using ${params.languageMode} fallback for "${params.groupName}":`, lastError);
  return defaultCharacterFallback(params.groupName, params.languageMode);
}

export function buildChunkSummaryPrompt(content: string, languageMode: LanguageMode = 'auto'): string {
  const lang = synthesisLanguageInstruction(languageMode);
  const task =
    languageMode === 'en'
      ? 'Summarize this WhatsApp group conversation in ONE sentence (max 20 words). Focus on the main topic or event.'
      : 'סכם את השיחה במשפט אחד (עד 20 מילים). התמקד בנושא או באירוע המרכזי. עברית מדוברת, משפט תקין.';
  return `${lang}\n\n${task}\n\n${content.slice(0, 2000)}`;
}

/** Chunk summary (1 sentence). */
export async function generateChunkSummary(content: string, languageMode: LanguageMode = 'auto', usageContext?: SynthesisUsageContext): Promise<string> {
  const response = await anthropic.messages.create({
    model: hebrewAwareModel(languageMode),
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: buildChunkSummaryPrompt(content, languageMode),
      },
    ],
  });
  const { recordAnthropicCall } = await import('../lib/usage-record.js');
  await recordAnthropicCall({ type: 'synthesis', groupId: usageContext?.groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : languageMode === 'en' ? 'Group conversation.' : 'שיחה בקבוצה.';
}
