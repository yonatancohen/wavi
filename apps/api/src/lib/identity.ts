/**
 * Participant identity helpers — canonical wa_user_id spine with observed labels/aliases.
 */

/** Strip bidi marks and isolate chars common in Hebrew WhatsApp exports. */
export function stripUnicodeDirectionMarks(text: string): string {
  return text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
}

/** Normalize a label for fuzzy comparison (case, whitespace, punctuation). */
export function normalizeNameForMatch(name: string): string {
  return stripUnicodeDirectionMarks(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First token of a normalized name — useful for "Alon Arroyo" vs "אלון". */
export function firstNameToken(name: string): string {
  const norm = normalizeNameForMatch(name);
  const token = norm.split(' ')[0];
  return token ?? '';
}

const PHONE_IN_LABEL = /^[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]*~?\s*(\+?\d[\d\s\-().]{7,}\d)\s*$/;

/** Extract digits-only phone user id from a WhatsApp export sender label. */
export function parsePhoneFromLabel(label: string): string | null {
  const clean = stripUnicodeDirectionMarks(label).trim();
  const match = clean.match(PHONE_IN_LABEL);
  if (!match?.[1]) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

export type SenderIdentity = {
  wa_user_id: string;
  display_name: string;
  /** How the id was derived — phone labels are cross-device stable. */
  id_source: 'phone' | 'export_label';
};

/** Resolve export sender label → canonical id + human display name. */
export function resolveSenderIdentity(senderLabel: string): SenderIdentity {
  const displayName = stripUnicodeDirectionMarks(senderLabel).trim();
  const phone = parsePhoneFromLabel(displayName);
  if (phone) {
    return { wa_user_id: phone, display_name: displayName, id_source: 'phone' };
  }
  return {
    wa_user_id: displayName,
    display_name: displayName,
    id_source: 'export_label',
  };
}

/** Whether two labels likely refer to the same person (exact, first-name, or substring). */
export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const fa = firstNameToken(a);
  const fb = firstNameToken(b);
  if (fa.length >= 3 && fa === fb) return true;

  return false;
}

/** Merge alias lists, preserving order and skipping duplicates (case-insensitive). */
export function mergeAliases(existing: string[], ...incoming: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...existing, ...incoming]) {
    const alias = stripUnicodeDirectionMarks(raw).trim();
    if (!alias || alias.length < 2) continue;
    const key = normalizeNameForMatch(alias);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

/** Clean message body — strip direction marks around @mentions. */
export function cleanMessageBody(body: string): string {
  return stripUnicodeDirectionMarks(body);
}

/**
 * Extract @-mention display labels from a message body (exporter's contact names).
 */
export function extractMentionLabels(body: string): string[] {
  const cleaned = stripUnicodeDirectionMarks(body);
  const labels: string[] = [];

  // Hebrew groups: mention ends before space + Hebrew letter (start of message text)
  const heRe = /@([^\n@]+?)(?=\s[\u0590-\u05FF])/gu;
  let m: RegExpExecArray | null;
  while ((m = heRe.exec(cleaned)) !== null) {
    const label = m[1]?.trim();
    if (label && label.length >= 2) labels.push(label);
  }
  if (labels.length) return labels;

  // Latin / mixed: @name until double-space, end, or sentence punctuation
  const enRe = /@([\p{L}\p{N}\s❤️♥️.''\-]+?)(?=\s{2,}|$|[.!?](?:\s|$))/gu;
  while ((m = enRe.exec(cleaned)) !== null) {
    const label = m[1]?.trim();
    if (label && label.length >= 2) labels.push(label);
  }
  return labels;
}

/** Pair mention labels from body with wa ids when counts align (WhatsApp preserves order). */
export function pairMentionLabelsWithIds(labels: string[], waIds: string[]): Array<{ waId: string; label: string }> {
  const pairs: Array<{ waId: string; label: string }> = [];
  if (labels.length === 0 || waIds.length === 0) return pairs;

  const n = Math.min(labels.length, waIds.length);
  for (let i = 0; i < n; i++) {
    const waId = waIds[i]?.split('@')[0] ?? waIds[i];
    const label = labels[i];
    if (waId && label) pairs.push({ waId, label });
  }
  return pairs;
}

const APOSTROPHES = ["'", '׳', '’', '‘', '`'];

/** Apostrophe spellings of a name (צ'ן / צ׳ן) so boundary matching hits WhatsApp variants. */
export function apostropheNameVariants(from: string): string[] {
  if (!APOSTROPHES.some((mark) => from.includes(mark))) return [from];
  return [...new Set(APOSTROPHES.map((mark) => from.replace(/['׳’‘`]/g, mark)))];
}

/**
 * Word-boundary regex for a person name. Hebrew clitics (ו/ב/ל/מ/ה/ש/כ) may prefix the name.
 * Latin names use the `i` flag; Hebrew does not (niqqud-free letters are case-less).
 */
export function nameBoundaryRegex(name: string): RegExp | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const latin = /^[\x00-\x7F]*$/.test(trimmed);
  return new RegExp(`(?<![\\p{L}\\p{N}])([ובלמהשכ]?)${escaped}(?![\\p{L}\\p{N}])`, latin ? 'gui' : 'gu');
}

/** True when `name` appears as its own token in `text` (not a substring of a longer word). */
export function nameAppearsInText(text: string, name: string): boolean {
  const cleaned = stripUnicodeDirectionMarks(text);
  for (const variant of apostropheNameVariants(name.trim())) {
    const re = nameBoundaryRegex(variant);
    if (!re) continue;
    re.lastIndex = 0;
    if (re.test(cleaned)) return true;
  }
  return false;
}

/** Drop a leading "שאביז." / "hey," greeting so slang openers are not treated as people. */
export function stripGreetingOpener(message: string): string {
  return stripUnicodeDirectionMarks(message).replace(/^[\p{L}\p{N}'’׳]+[!.?,]\s+/u, '');
}

/** Check if a message text references a person by display name or any alias. */
export function messageReferencesName(message: string, displayName: string, aliases: string[] = []): boolean {
  const haystack = stripGreetingOpener(message);
  const candidates = [displayName, ...aliases].filter((n) => n.trim().length >= 2);
  return candidates.some((name) => nameAppearsInText(haystack, name));
}
