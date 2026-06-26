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
  /** preview = 2-3 sentences per member; full = 4-5 sentences per member */
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

const ACTIVITY_RANK: Record<string, number> = { very_high: 4, high: 3, medium: 2, low: 1 };

async function fetchTopMembers(groupId: string, limit = 5): Promise<MemberProfile[]> {
  const { data } = await db.from('user_profiles').select('display_name, behavioral_summary, profile_data').eq('group_id', groupId).not('behavioral_summary', 'is', null).limit(30);

  if (!data?.length) return [];

  // Sort: activity level first, then richness of behavioral summary.
  const sorted = (data as MemberProfile[]).sort((a, b) => {
    const aLevel = ACTIVITY_RANK[a.profile_data?.activity_level ?? ''] ?? 0;
    const bLevel = ACTIVITY_RANK[b.profile_data?.activity_level ?? ''] ?? 0;
    if (bLevel !== aLevel) return bLevel - aLevel;
    return (b.behavioral_summary?.length ?? 0) - (a.behavioral_summary?.length ?? 0);
  });

  return sorted.slice(0, limit);
}

async function fetchMemberQuotes(groupId: string, displayName: string, max = 2): Promise<string[]> {
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

  return (data ?? [])
    .map((r) => (r.body as string).trim())
    .filter((b) => b.length > 10 && b.length < 120)
    .slice(0, max);
}

export async function generateWelcomeMessage(opts: WelcomeMessageOptions): Promise<string> {
  const { groupId, groupName, languageMode, characterConfig, imageGenerationEnabled, webSearchEnabled } = opts;
  const isPreview = (opts.mode ?? 'preview') === 'preview';

  const members = await fetchTopMembers(groupId, 5);

  // Fetch quotes for each member in parallel
  const membersWithQuotes = await Promise.all(
    members.map(async (m) => ({
      ...m,
      quotes: await fetchMemberQuotes(groupId, m.display_name, 2),
    })),
  );

  const langInstruction = synthesisLanguageInstruction(languageMode === 'auto' ? 'he' : languageMode);
  const isHebrew = (languageMode === 'auto' ? 'he' : languageMode) === 'he';
  const agentTag = `@${AGENT_NAME}`;

  const bullets = isHebrew
    ? [
        `*${agentTag} [שאלה/נושא]* — שאלות, ויכוחים, חוות דעת, בדיחות — אני בפנים`,
        `*${agentTag} מתי הפעם האחרונה ש...* — אני זוכר את ההיסטוריה של הקבוצה`,
        `*${agentTag} מי זה [שם]* — ספר לי על חברי הקבוצה`,
        `*${agentTag} תזכיר לי [X] בעוד [זמן]* — reminders`,
        ...(imageGenerationEnabled ? [`*${agentTag} צור תמונה של...* — יוצר תמונות לפי בקשה`] : []),
        ...(webSearchEnabled ? [`*${agentTag} חפש [נושא]* — גישה לאינטרנט לשאלות עדכניות`] : []),
      ]
    : [
        `*${agentTag} [question/topic]* — questions, banter, opinions, jokes — I'm in`,
        `*${agentTag} last time we...* — I remember the group's history`,
        `*${agentTag} who is [name]* — I know your group members`,
        `*${agentTag} remind me [X] in [time]* — reminders`,
        ...(imageGenerationEnabled ? [`*${agentTag} create an image of...* — generates images on request`] : []),
        ...(webSearchEnabled ? [`*${agentTag} search [topic]* — live web access for current questions`] : []),
      ];

  const bulletText = bullets.map((b) => `• ${b}`).join('\n');

  const sentencesPerMember = isPreview ? '2–3 sentences' : '4–5 sentences';

  const membersText =
    membersWithQuotes.length > 0
      ? membersWithQuotes
          .map(
            (m, i) => `
[${i + 1}] ${m.display_name}
Summary: ${m.behavioral_summary ?? 'N/A'}
Topics: ${(m.profile_data?.dominant_topics ?? []).join(', ') || 'N/A'}
Activity: ${m.profile_data?.activity_level ?? 'unknown'}
Quotes: ${m.quotes.length ? m.quotes.map((q) => `"${q}"`).join(' | ') : 'none'}`,
          )
          .join('\n')
      : 'No member data yet — skip the spotlight section.';

  const prompt = `${langInstruction}

You are generating a WhatsApp welcome message for a group called "${groupName}".
Sender: ${AGENT_NAME} (the AI group member).
Voice: ${characterConfig?.voice || 'casual, witty group member'}
Signature: ${characterConfig?.signature_behavior || 'jumps into conversations naturally'}

Write the welcome message in this exact structure:

1. ONE intro sentence introducing ${AGENT_NAME} — casual, in-character, brief.

2. MEMBER SPOTLIGHTS — write a mini roast-tribute for each member listed below.
   ${sentencesPerMember} per person. Be specific, use their real data — topics, quirks, a quote if available.
   Don't be generic. Each entry should make the group think "yep, that's exactly them."
   Label each with their name in bold (*name*) on its own line before the story.

3. HOW TO USE section — use exactly these bullets, no additions or removals:
${bulletText}

4. ONE closing sentence — casual, in-character.

Members to profile (in order of importance):
${membersText}

Output ONLY the WhatsApp message. Use *asterisks* for bold (WhatsApp format).
No # headers. Separate sections with a blank line. Emojis welcome but not excessive.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: isPreview ? 900 : 1800,
    messages: [{ role: 'user', content: prompt }],
  });

  await recordAnthropicCall({ type: 'synthesis', groupId, usage: response.usage });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}
