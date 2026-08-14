import { namesLikelyMatch, normalizeNameForMatch } from '../lib/identity.js';

export type NameCanon = {
  display_name: string;
  aliases: string[];
  wa_user_id?: string;
};

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

function replaceNameToken(text: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const latin = /^[\x00-\x7F]*$/.test(from);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, latin ? 'gui' : 'gu');
  return text.replace(re, to);
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
