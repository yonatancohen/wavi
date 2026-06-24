import type { LanguageMode, UserProfileData } from '@wavi/shared';
import { namesLikelyMatch } from './identity.js';

export const MIN_LLM_PROFILE_MESSAGES = 5;

export type ParsedProfilePayload = UserProfileData & { behavioral_summary?: string };

export function parseProfileJson(text: string): ParsedProfilePayload {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean) as ParsedProfilePayload;
}

/** Drop aliases that clearly belong to another group member. */
export function filterCrossMemberAliases(aliases: string[], displayName: string, otherMemberNames: string[]): string[] {
  const others = otherMemberNames.filter((name) => name !== displayName);
  return aliases.filter((alias) => !others.some((other) => namesLikelyMatch(alias, other)));
}

export function buildMinimalProfileData(msgCount: number, aliases: string[] = []): UserProfileData {
  return {
    humor_type: 'none',
    humor_score: 0,
    formality_score: 50,
    activity_level: msgCount >= MIN_LLM_PROFILE_MESSAGES ? 'low' : 'lurker',
    dominant_topics: [],
    sensitivity_flags: [],
    emoji_usage: 'none',
    avg_message_length: 'terse',
    aliases,
  };
}

export function minimalBehavioralSummary(displayName: string, msgCount: number, languageMode: LanguageMode): string {
  if (languageMode === 'he') {
    if (msgCount === 0) return `${displayName} — חבר/ה בקבוצה, אין הודעות בייצוא.`;
    if (msgCount < MIN_LLM_PROFILE_MESSAGES) return `${displayName} — מעט הודעות (${msgCount}); פרופיל בסיסי בלבד.`;
    return `${displayName} — פרופיל בסיסי (${msgCount} הודעות); ניתוח מלא לא זמין.`;
  }
  if (msgCount === 0) return `${displayName} — group member with no messages in this export.`;
  if (msgCount < MIN_LLM_PROFILE_MESSAGES) return `${displayName} — few messages (${msgCount}); minimal profile only.`;
  return `${displayName} — minimal profile (${msgCount} messages); full analysis unavailable.`;
}
