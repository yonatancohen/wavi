import type { LanguageMode } from '@wavi/shared';
import { db } from '../db/client.js';
import { mergeAliases, messageReferencesName } from '../lib/identity.js';
import { buildMinimalProfileData, filterCrossMemberAliases, MIN_LLM_PROFILE_MESSAGES, minimalBehavioralSummary, parseProfileJson } from '../lib/profile-fallback.js';
import { upsertUserProfile } from '../lib/profile-store.js';
import type { ResolvedExportMessage } from '../lib/resolve-export-messages.js';
import { synthesisLanguageInstruction } from './language.js';

interface ProfileMessage {
  body: string;
}

const PROXIMITY_MS = 90 * 1000;
const PROFILE_LLM_RETRIES = 2;

export type ProfileBuildResult = 'full' | 'stub' | 'skipped';

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
    const parsed = parseProfileJson(text) as { aliases?: string[] };
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

async function upsertStubProfile(
  groupId: string,
  waUserId: string,
  displayName: string,
  msgCount: number,
  languageMode: LanguageMode,
  aliases: string[],
  options?: { merge?: boolean },
): Promise<void> {
  await upsertUserProfile(
    {
      group_id: groupId,
      wa_user_id: waUserId,
      display_name: displayName,
      profile_data: buildMinimalProfileData(msgCount, aliases),
      behavioral_summary: minimalBehavioralSummary(displayName, msgCount, languageMode),
      msg_count: msgCount,
    },
    { merge: options?.merge },
  );
}

async function callProfileLlm(displayName: string, sample: string, languageMode: LanguageMode): Promise<string> {
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

  return response.content[0].type === 'text' ? response.content[0].text : '{}';
}

export async function profileUser(
  groupId: string,
  waUserId: string,
  displayName: string,
  messages: ProfileMessage[],
  languageMode: LanguageMode = 'auto',
  preloadedAliases: string[] = [],
  options?: { merge?: boolean; otherMemberNames?: string[] },
): Promise<ProfileBuildResult> {
  const msgCount = messages.length;
  if (msgCount === 0) return 'skipped';

  const safeAliases = filterCrossMemberAliases(preloadedAliases, displayName, options?.otherMemberNames ?? []);

  if (msgCount < MIN_LLM_PROFILE_MESSAGES) {
    await upsertStubProfile(groupId, waUserId, displayName, msgCount, languageMode, safeAliases, options);
    return 'stub';
  }

  const sample = messages
    .slice(-100)
    .map((m) => m.body)
    .join('\n');

  let lastError: unknown;
  for (let attempt = 1; attempt <= PROFILE_LLM_RETRIES; attempt++) {
    try {
      const text = await callProfileLlm(displayName, sample, languageMode);
      const parsed = parseProfileJson(text);
      const llmAliases = filterCrossMemberAliases(parsed.aliases ?? [], displayName, options?.otherMemberNames ?? []);
      const aliases = mergeAliases(safeAliases, ...llmAliases);

      await upsertUserProfile(
        {
          group_id: groupId,
          wa_user_id: waUserId,
          display_name: displayName,
          profile_data: { ...parsed, aliases },
          behavioral_summary: parsed.behavioral_summary ?? '',
          msg_count: msgCount,
        },
        { merge: options?.merge },
      );
      return 'full';
    } catch (err) {
      lastError = err;
      console.warn(`[Profiler] LLM profile attempt ${attempt}/${PROFILE_LLM_RETRIES} failed for ${displayName} (${waUserId}):`, err);
    }
  }

  console.error(`[Profiler] Using minimal profile for ${displayName} (${waUserId}) after LLM failure:`, lastError);
  await upsertStubProfile(groupId, waUserId, displayName, msgCount, languageMode, safeAliases, options);
  return 'stub';
}

/** Merge mode: existing profiles with no export messages are left untouched in the DB. */
async function logPreservedSilentProfiles(groupId: string, exportWaIds: Set<string>, merge: boolean) {
  if (!merge) return;

  const { data: existing } = await db.from('user_profiles').select('wa_user_id, display_name').eq('group_id', groupId);
  const preserved = (existing ?? []).filter((p) => !exportWaIds.has(p.wa_user_id));
  if (preserved.length > 0) {
    console.log(`[Profiler] Merge mode — kept ${preserved.length} profile(s) with no messages in this export: ${preserved.map((p) => p.display_name).join(', ')}`);
  }
}

export async function buildUserProfilesFromHistory(
  groupId: string,
  messages: ResolvedExportMessage[],
  languageMode: LanguageMode = 'auto',
  observedAliasesByPerson?: Map<string, string[]>,
  options?: { merge?: boolean },
) {
  const byUser: Record<string, { displayName: string; bodies: string[] }> = {};
  for (const msg of messages) {
    if (msg.is_system_message) continue;
    const id = msg.sender_wa_id;
    if (!byUser[id]) byUser[id] = { displayName: msg.sender_name, bodies: [] };
    byUser[id].bodies.push(msg.body);
  }

  const otherMemberNames = Object.values(byUser).map((u) => u.displayName);
  const stats = { full: 0, stub: 0, skipped: 0 };

  for (const [waUserId, { displayName, bodies }] of Object.entries(byUser)) {
    const observed = observedAliasesByPerson?.get(waUserId) ?? [];
    const addressedSamples = collectAddressedSamples(waUserId, displayName, messages);
    const llmAliases = filterCrossMemberAliases(await extractAliasesFromContext(displayName, bodies, addressedSamples, languageMode), displayName, otherMemberNames);
    const allAliases = mergeAliases(observed, ...llmAliases);

    const result = await profileUser(
      groupId,
      waUserId,
      displayName,
      bodies.map((body) => ({ body })),
      languageMode,
      allAliases,
      { merge: options?.merge, otherMemberNames },
    );
    stats[result]++;
  }

  await logPreservedSilentProfiles(groupId, new Set(Object.keys(byUser)), options?.merge === true);

  console.log(`[Profiler] Group ${groupId}: ${stats.full} full, ${stats.stub} stub/minimal, ${stats.skipped} skipped (${Object.keys(byUser).length} senders in export)`);
}
