/** Apostrophes the model uses when it transliterates Chen as Jackie-Chan-style צ'ן. */
const APOSTROPHE_CLASS = `['׳’‘\`ʼ´ʹˈ]`;

const LATIN_TO_HEBREW_GIVEN: Record<string, string> = {
  chen: 'חן',
  gal: 'גל',
};

/**
 * Chen (חן) is routinely spelled צ'ן — the Chinese surname, not the Hebrew name.
 * Always rewrite that token, including after Hebrew clitics (וצ'ן).
 */
export function fixMistransliteratedHebrewNames(text: string): string {
  if (!text) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])([ובלמהשכ]?)צ${APOSTROPHE_CLASS}ן(?![\\p{L}\\p{N}])`, 'gu'), '$1חן');
}

/** Hebrew given name for prose when the People-tab label is still Latin (Chen Arroyo → חן). */
export function hebrewGivenName(displayName: string): string {
  const display = displayName.trim();
  if (!display) return display;
  if (/[\u0590-\u05FF]/.test(display)) return display;
  const first = display.split(/\s+/)[0]?.toLowerCase() ?? '';
  return LATIN_TO_HEBREW_GIVEN[first] ?? display;
}
