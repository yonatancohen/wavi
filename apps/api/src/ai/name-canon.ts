import { mergeAliases, namesLikelyMatch, normalizeNameForMatch } from '../lib/identity.js';

export type NameCanon = {
  display_name: string;
  aliases: string[];
  wa_user_id?: string;
};

/** Extra spellings the model invents (Chen → צ'ן) plus first-name tokens. */
export function expandCanonAliases(person: NameCanon, extraLabels: string[] = []): NameCanon {
  const extras = [...person.aliases, ...extraLabels].map((label) => label.trim()).filter(Boolean);
  const tokens: string[] = [];
  for (const label of [person.display_name, ...extras]) {
    const first = label.trim().split(/\s+/)[0];
    if (first && first.length >= 2) tokens.push(first);
  }

  const haystack = [person.display_name, ...extras, ...tokens].join(' ');
  const more: string[] = [];
  if (person.display_name.includes('חן') || /\bchen\b/i.test(haystack)) {
    more.push("צ'ן", 'צ׳ן', 'Chen');
  }
  if (person.display_name.includes('גל') || /\bgal\b/i.test(haystack) || /my love/i.test(haystack)) {
    more.push('Gal', 'My Love');
  }

  return { ...person, aliases: mergeAliases([], ...extras, ...tokens, ...more) };
}

export function formatMemberRoster(people: NameCanon[]): string {
  return people
    .map((person) => {
      const name = person.display_name.trim();
      if (!name) return '';
      const aliases = person.aliases.map((alias) => alias.trim()).filter((alias) => alias && normalizeNameForMatch(alias) !== normalizeNameForMatch(name));
      return aliases.length ? `${name} (also: ${aliases.join(', ')})` : name;
    })
    .filter(Boolean)
    .join('\n');
}

export function resolveSenderLabel(senderWaId: string | null | undefined, senderName: string, people: NameCanon[]): string {
  if (senderWaId) {
    const byId = people.find((person) => person.wa_user_id && person.wa_user_id === senderWaId);
    if (byId?.display_name.trim()) return byId.display_name.trim();
  }

  const label = senderName.trim();
  if (!label) return senderName;

  for (const person of people) {
    const names = [person.display_name, ...person.aliases];
    if (names.some((name) => namesLikelyMatch(label, name))) return person.display_name.trim();
  }

  return senderName;
}

const APOSTROPHES = ["'", '׳', '’', '‘', '`'];

function apostropheVariants(from: string): string[] {
  if (!APOSTROPHES.some((mark) => from.includes(mark))) return [from];
  return [...new Set(APOSTROPHES.map((mark) => from.replace(/['׳’‘`]/g, mark)))];
}

function replaceNameToken(text: string, from: string, to: string): string {
  let out = text;
  for (const variant of apostropheVariants(from)) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const latin = /^[\x00-\x7F]*$/.test(variant);
    // Hebrew clitics attach to names (וצ'ן = and Chen).
    const re = new RegExp(`(?<![\\p{L}\\p{N}])([ובלמהשכ]?)${escaped}(?![\\p{L}\\p{N}])`, latin ? 'gui' : 'gu');
    out = out.replace(re, `$1${to}`);
  }
  return out;
}

/** Rewrite contact nicknames / Latin spellings to the curated display name. */
export function applyCanonicalNames(text: string, people: NameCanon[]): string {
  const replacements: Array<{ from: string; to: string }> = [];
  for (const person of people) {
    const to = person.display_name.trim();
    if (!to) continue;
    for (const alias of person.aliases) {
      const from = alias.trim();
      if (!from || normalizeNameForMatch(from) === normalizeNameForMatch(to)) continue;
      replacements.push({ from, to });
    }
  }
  replacements.sort((a, b) => b.from.length - a.from.length);

  let out = text;
  for (const { from, to } of replacements) {
    out = replaceNameToken(out, from, to);
  }
  return out;
}
