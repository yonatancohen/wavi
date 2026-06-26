import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import type { CharacterConfig, LanguageMode } from '@wavi/shared';
import { synthesisLanguageInstruction } from './language.js';
import { recordAnthropicCall } from '../lib/usage-record.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

export interface WelcomeMessageOptions {
  groupId: string;
  groupName: string;
  languageMode: LanguageMode;
  characterConfig: CharacterConfig | null;
  imageGenerationEnabled: boolean;
  webSearchEnabled: boolean;
  /** preview = short 3-4 sentence story; full = complete 8-10 sentence story */
  mode?: 'preview' | 'full';
}

interface MemberProfile {
  display_name: string;
  behavioral_summary: string | null;
  profile_data: {
    dominant_topics?: string[];
    aliases?: string[];
    activity_level?: string;
  } | null;
}

async function fetchTopMember(groupId: string): Promise<MemberProfile | null> {
  // Pick the member with the richest profile (longest behavioral summary — proxy for most data)
  // and highest activity level, excluding any profile that looks like the agent itself.
  const { data } = await db
    .from('user_profiles')
    .select('display_name, behavioral_summary, profile_data')
    .eq('group_id', groupId)
    .not('behavioral_summary', 'is', null)
    .order('behavioral_summary', { ascending: false }) // longest first
    .limit(10);

  if (!data?.length) return null;

  // Prefer the member with 'high' or 'very_high' activity if available.
  const high = data.find((p) => {
    const pd = p.profile_data as { activity_level?: string } | null;
    return pd?.activity_level === 'high' || pd?.activity_level === 'very_high';
  });

  const chosen = high ?? data[0];
  return chosen as MemberProfile;
}

async function fetchTopMemberRecentQuotes(groupId: string, displayName: string): Promise<string[]> {
  const { data } = await db
    .from('messages')
    .select('body')
    .eq('group_id', groupId)
    .eq('sender_name', displayName)
    .eq('is_agent_reply', false)
    .not('body', 'ilike', '<Media omitted>%')
    .not('body', 'ilike', 'image omitted%')
    .order('timestamp', { ascending: false })
    .limit(20);

  // Return 3–5 short representative quotes
  const quotes = (data ?? [])
    .map((r) => (r.body as string).trim())
    .filter((b) => b.length > 10 && b.length < 120)
    .slice(0, 4);

  return quotes;
}

export async function generateWelcomeMessage(opts: WelcomeMessageOptions): Promise<string> {
  const { groupId, groupName, languageMode, characterConfig, imageGenerationEnabled, webSearchEnabled } = opts;

  const topMember = await fetchTopMember(groupId);
  const quotes = topMember ? await fetchTopMemberRecentQuotes(groupId, topMember.display_name) : [];

  const langInstruction = synthesisLanguageInstruction(languageMode === 'auto' ? 'he' : languageMode);
  const isHebrew = (languageMode === 'auto' ? 'he' : languageMode) === 'he';

  const agentTag = `@${AGENT_NAME}`;

  // Build the how-to-use bullets dynamically based on enabled features
  const bullets = isHebrew
    ? [
        `**${agentTag} [שאלה/נושא]** — שאלות, ויכוחים, חוות דעת, בדיחות — אני בפנים`,
        `**${agentTag} מתי הפעם האחרונה ש...** — אני זוכר את ההיסטוריה של הקבוצה`,
        `**${agentTag} מי זה [שם]** — ספר לי על חברי הקבוצה`,
        `**${agentTag} תזכיר לי [X] בעוד [זמן]** — reminders`,
        ...(imageGenerationEnabled ? [`**${agentTag} צור תמונה של...** — יוצר תמונות לפי בקשה`] : []),
        ...(webSearchEnabled ? [`**${agentTag} חפש [נושא]** — גישה לאינטרנט לשאלות עדכניות`] : []),
      ]
    : [
        `**${agentTag} [question/topic]** — questions, banter, opinions, jokes — I'm in`,
        `**${agentTag} last time we...** — I remember the group's history`,
        `**${agentTag} who is [name]** — I know your group members`,
        `**${agentTag} remind me [X] in [time]** — reminders`,
        ...(imageGenerationEnabled ? [`**${agentTag} create an image of...** — generates images on request`] : []),
        ...(webSearchEnabled ? [`**${agentTag} search [topic]** — live web access for current questions`] : []),
      ];

  const bulletText = bullets.map((b) => `• ${b}`).join('\n');

  const isPreview = (opts.mode ?? 'full') === 'preview';

  const memberSection = topMember
    ? `
Member to profile: ${topMember.display_name}
Behavioral summary: ${topMember.behavioral_summary ?? 'N/A'}
Dominant topics: ${(topMember.profile_data?.dominant_topics ?? []).join(', ') || 'N/A'}
Activity level: ${topMember.profile_data?.activity_level ?? 'unknown'}
Sample quotes from their messages: ${quotes.length ? quotes.map((q) => `"${q}"`).join(' | ') : 'none available'}
`
    : 'No member data available yet — skip the member spotlight section.';

  const characterVoice = characterConfig?.voice ?? '';
  const signatureBehavior = characterConfig?.signature_behavior ?? '';

  const prompt = `${langInstruction}

You are generating a WhatsApp welcome message for a group called "${groupName}".
The message is sent by the AI group member named ${AGENT_NAME}, who has this character:
Voice: ${characterVoice || 'casual, witty group member'}
Signature behavior: ${signatureBehavior || 'jumps into conversations naturally'}

Write the welcome message in this structure:

1. A SHORT intro line (1 sentence) introducing ${AGENT_NAME} to the group — casual, in-character.

2. A MEMBER SPOTLIGHT about the top group member below.
   Write it like a dramatic/funny roast-tribute in the group's exact voice.
   Reference their topics, quirks, a memorable quote or two if available.
   Do NOT make it generic — use the actual data. Make it feel like the group is nodding.
   Length: ${isPreview ? '3–4 sentences (this is a quick preview)' : '8–10 sentences (full version — go deep, be specific, earn the laughs)'}.

3. A HOW-TO-USE section titled appropriately. Use exactly these bullets (do not add or remove any):
${bulletText}

4. A short closing line (1 sentence) — casual, in-character.

${memberSection}

Output ONLY the WhatsApp message text. Use *bold* with asterisks for section headers and bullet labels.
No markdown headers with #. Keep it WhatsApp-native (asterisks for bold, newlines between sections).
Emojis are encouraged but not overdone.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  await recordAnthropicCall({ type: 'synthesis', groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}
