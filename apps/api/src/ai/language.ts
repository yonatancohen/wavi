import type { LanguageMode } from '@wavi/shared';

/** Human-readable language name for prompts. */
export function getLanguageName(code: LanguageMode): string {
  const map: Record<string, string> = {
    he: 'Hebrew',
    en: 'English',
    ar: 'Arabic',
    es: 'Spanish',
    fr: 'French',
    ru: 'Russian',
  };
  return map[code] ?? code;
}

/** Instruction fragment for synthesis/summary LLM calls. */
export function synthesisLanguageInstruction(languageMode: LanguageMode): string {
  if (languageMode === 'he') return 'Write ALL output in natural Hebrew.';
  if (languageMode === 'en') return 'Write ALL output in natural English.';
  if (languageMode === 'auto') return 'Write in the same language the group chat uses most (Hebrew or English).';
  return `Write ALL output in natural ${getLanguageName(languageMode)}.`;
}

/** Detect Hebrew Unicode in text (for auto language rules). */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Effective reply language for auto mode.
 * Checks the current message first; if it has no Hebrew (e.g. a short English tag like "wavi?"),
 * falls back to the last 5 messages so we don't flip language mid-conversation.
 */
export function effectiveReplyLanguage(languageMode: LanguageMode, currentMessage: string, recentMessages?: Array<{ body: string }>): 'he' | 'en' | LanguageMode {
  if (languageMode === 'auto') {
    if (containsHebrew(currentMessage)) return 'he';
    if (recentMessages?.length) {
      const sample = recentMessages
        .slice(-5)
        .map((m) => m.body)
        .join(' ');
      return containsHebrew(sample) ? 'he' : 'en';
    }
    return 'en';
  }
  return languageMode;
}
