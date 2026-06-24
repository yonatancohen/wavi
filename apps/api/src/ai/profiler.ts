import type { LanguageMode, UserProfileData } from '@wavi/shared';
import { mergeAliases, messageReferencesName } from '../lib/identity.js';
import { upsertUserProfile } from '../lib/profile-store.js';
import type { ResolvedExportMessage } from '../lib/resolve-export-messages.js';
import { synthesisLanguageInstruction } from './language.js';

interface ProfileMessage {
  body: string;
}

const PROXIMITY_MS = 90 * 1000;

async function extractAliasesFromContext(displayName: string, ownMessages: string[], addressedSamples: string[], languageMode: LanguageMode): Promise<string[]> {
  if (addressedSamples.length === 0) return [];

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const lang = synthesisLanguageInstruction(languageMode);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `${lang}

The WhatsApp contact label for one group member is "${displayName}".
Below are messages FROM them and messages where others may ADDRESS or REFER to them by nickname.

Return JSON only: { "aliases": ["nickname1", "nickname2"] }
Rules:
- Include nicknames, first names, pet names, transliterations (e.g. אלון/alon), and @mention labels used for this person
- Do NOT include the full contact label "${displayName}" itself
- Do NOT include generic words or other people's names
- Max 8 aliases, most confident first
- Empty array if none found

Their messages:
${ownMessages.slice(-30).join('\n').slice(0, 1200)}

Messages about / to them:
${addressedSamples.slice(0, 40).join('\n').slice(0, 1200)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as { aliases?: string[] };
    return mergeAliases([], ...(parsed.aliases ?? []));
  } catch {
    return [];
  }
}

function collectAddressedSamples(waUserId: string, displayName: string, messages: ResolvedExportMessage[]): string[] {
  const samples: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.is_system_message || msg.sender_wa_id === waUserId) continue;

    const prev = i > 0 ? messages[i - 1] : null;
    const proximityReply = prev && prev.sender_wa_id === waUserId && msg.timestamp.getTime() - prev.timestamp.getTime() <= PROXIMITY_MS;

    const refers = messageReferencesName(msg.body, displayName);

    if (proximityReply || refers) {
      samples.push(`${msg.sender_name}: ${msg.body}`);
    }
  }
  return samples;
}

export async function profileUser(
  groupId: string,
  waUserId: string,
  displayName: string,
  messages: ProfileMessage[],
  languageMode: LanguageMode = 'auto',
  preloadedAliases: string[] = [],
): Promise<void> {
  if (messages.length < 5) return;

  const sample = messages
    .slice(-100)
    .map((m) => m.body)
    .join('\n');

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const lang = synthesisLanguageInstruction(languageMode);
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `${lang}

Analyze this person's WhatsApp messages and return JSON only.
All human-readable text (behavioral_summary, dominant_topics, sensitivity_flags) MUST follow the language rule above.
Keep enum values (humor_type, activity_level, emoji_usage, avg_message_length) in English.

{
  "humor_type": "sarcastic|absurdist|self-deprecating|dad-jokes|dry|none",
  "humor_score": <0-100>,
  "formality_score": <0-100>,
  "activity_level": "high|medium|low|lurker",
  "dominant_topics": ["topic1", "topic2"],
  "sensitivity_flags": [],
  "emoji_usage": "heavy|moderate|rare|none",
  "avg_message_length": "long|medium|short|terse",
  "behavioral_summary": "One sentence describing how this person communicates"
}

Messages from ${displayName}:
${sample.slice(0, 2000)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as UserProfileData & { behavioral_summary?: string };
    const aliases = mergeAliases(preloadedAliases, ...(parsed.aliases ?? []));

    await upsertUserProfile({
      group_id: groupId,
      wa_user_id: waUserId,
      display_name: displayName,
      profile_data: { ...parsed, aliases },
      behavioral_summary: parsed.behavioral_summary ?? '',
      msg_count: messages.length,
    });
  } catch {
    // Skip malformed profile
  }
}

export async function buildUserProfilesFromHistory(groupId: string, messages: ResolvedExportMessage[], languageMode: LanguageMode = 'auto', observedAliasesByPerson?: Map<string, string[]>) {
  const byUser: Record<string, { displayName: string; bodies: string[] }> = {};
  for (const msg of messages) {
    if (msg.is_system_message) continue;
    const id = msg.sender_wa_id;
    if (!byUser[id]) byUser[id] = { displayName: msg.sender_name, bodies: [] };
    byUser[id].bodies.push(msg.body);
  }

  for (const [waUserId, { displayName, bodies }] of Object.entries(byUser)) {
    const observed = observedAliasesByPerson?.get(waUserId) ?? [];
    const addressedSamples = collectAddressedSamples(waUserId, displayName, messages);
    const llmAliases = await extractAliasesFromContext(displayName, bodies, addressedSamples, languageMode);
    const allAliases = mergeAliases(observed, ...llmAliases);

    await profileUser(
      groupId,
      waUserId,
      displayName,
      bodies.map((body) => ({ body })),
      languageMode,
      allAliases,
    );
  }
}
