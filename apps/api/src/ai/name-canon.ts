import { firstRawNameToken, mergeAliases, namesLikelyMatch, normalizeNameForMatch, phoneticNameKey } from '../lib/identity.js';

export type NameCanon = {
  display_name: string;
  aliases: string[];
  wa_user_id?: string;
};

/** First-name tokens from the People-tab name and stored aliases — no per-person list. */
export function expandCanonAliases(person: NameCanon, extraLabels: string[] = []): NameCanon {
  const extras = [...person.aliases, ...extraLabels].map((label) => label.trim()).filter(Boolean);
  const tokens: string[] = [];
  for (const label of [person.display_name, ...extras]) {
    const first = firstRawNameToken(label);
    if (first && first.length >= 2) tokens.push(first);
  }

  return { ...person, aliases: mergeAliases([], ...extras, ...tokens) };
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
    // Hebrew clitics attach to names (וצ'ן = and <name>).
    const re = new RegExp(`(?<![\\p{L}\\p{N}])([ובלמהשכ]?)${escaped}(?![\\p{L}\\p{N}])`, latin ? 'gui' : 'gu');
    out = out.replace(re, `$1${to}`);
  }
  return out;
}

function phoneticTargetByKey(people: NameCanon[]): Map<string, string> {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();

  for (const person of people) {
    const to = person.display_name.trim();
    if (!to) continue;
    for (const label of [to, ...person.aliases]) {
      const key = phoneticNameKey(firstRawNameToken(label));
      if (key.length < 2) continue;
      const existing = map.get(key);
      if (existing && normalizeNameForMatch(existing) !== normalizeNameForMatch(to)) {
        ambiguous.add(key);
      } else {
        map.set(key, to);
      }
    }
  }

  for (const key of ambiguous) map.delete(key);
  return map;
}

function replacePhoneticNameTokens(text: string, people: NameCanon[]): string {
  const targets = phoneticTargetByKey(people);
  if (targets.size === 0) return text;

  return text.replace(/(?<![\p{L}\p{N}])([ובלמהשכ]?)([\p{L}'׳’‘`]+)(?![\p{L}\p{N}])/gu, (match, prefix: string, token: string) => {
    const key = phoneticNameKey(token);
    const to = targets.get(key);
    if (!to || normalizeNameForMatch(token) === normalizeNameForMatch(to)) return match;
    if (normalizeNameForMatch(to).includes(normalizeNameForMatch(token)) && token.length >= 4) return match;
    return `${prefix}${to}`;
  });
}

/** Rewrite nicknames and other spellings to the People-tab display name. */
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
  return replacePhoneticNameTokens(out, people);
}
