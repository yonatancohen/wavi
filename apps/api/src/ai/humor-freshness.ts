/**
 * Keep running gags from becoming the default reply seasoning.
 * Once a bit lands in recent agent replies, retire it until the ask is about it again.
 */

import type { HumorDNA } from '@wavi/shared';

const SERIOUS_HE = /(?:^|[\s,@])(?:תסכם|תסכמי|סיכום|תן סיכום|מי צודק|מה הלך|מה קרה|מה היה|פסק דין|ברצינות|בלי בדיחות|תענה ברצינות)/u;
const SERIOUS_EN = /\b(?:summarize|summary|who(?:'s| is) right|what happened|what went on|be serious|no jokes?|verdict)\b/i;

/** Asks that want a straight answer — summaries, verdicts, recap — not a callback. */
export function isSeriousAsk(message: string): boolean {
  const t = message.replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  return SERIOUS_HE.test(t) || SERIOUS_EN.test(t);
}

function normalizeHumorText(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'`׳״]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when `haystack` contains the bit as a contiguous phrase (not a single short token). */
export function textIncludesHumorBit(haystack: string, bit: string): boolean {
  const h = normalizeHumorText(haystack);
  const b = normalizeHumorText(bit);
  if (!h || !b) return false;
  if (b.length < 4) return false;
  // Single very short tokens are too noisy ("כן", "וואי").
  if (!b.includes(' ') && b.length < 6) return false;
  return h.includes(b);
}

function collectDnaBits(dna: HumorDNA | undefined | null): string[] {
  if (!dna) return [];
  const bits = [...(dna.recurring_bits ?? []), ...(dna.inside_references ?? [])];
  if (dna.example?.trim()) bits.push(dna.example.trim());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bit of bits) {
    const key = normalizeHumorText(bit);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(bit.trim());
  }
  return out;
}

/**
 * Bits from humor_dna (or repeated agent phrases) that already showed up in
 * recent agent replies — treat as retired unless the tagged ask is about them.
 */
export function recentlyUsedHumorBits(dna: HumorDNA | undefined | null, recentAgentBodies: string[]): string[] {
  const bodies = recentAgentBodies.map((b) => b.trim()).filter(Boolean);
  if (!bodies.length) return [];

  const retired: string[] = [];
  const seen = new Set<string>();

  for (const bit of collectDnaBits(dna)) {
    const hits = bodies.filter((body) => textIncludesHumorBit(body, bit)).length;
    if (hits === 0) continue;
    const key = normalizeHumorText(bit);
    if (seen.has(key)) continue;
    seen.add(key);
    retired.push(bit);
  }

  // Catch gags that are not in DNA but the agent already repeated across replies.
  for (const phrase of repeatedAgentPhrases(bodies)) {
    const key = normalizeHumorText(phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    retired.push(phrase);
  }

  return retired;
}

/** 2–4 word phrases that appear in at least two recent agent replies. */
export function repeatedAgentPhrases(agentBodies: string[], minHits = 2): string[] {
  const counts = new Map<string, { display: string; hits: number }>();

  for (const body of agentBodies) {
    const tokens = normalizeHumorText(body)
      .split(' ')
      .filter((t) => t.length > 1);
    const local = new Set<string>();
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const slice = tokens.slice(i, i + n);
        if (slice.every((t) => t.length < 3) && n === 2) continue;
        const key = slice.join(' ');
        if (key.length < 8) continue;
        if (local.has(key)) continue;
        local.add(key);
        const prev = counts.get(key);
        if (prev) prev.hits += 1;
        else counts.set(key, { display: slice.join(' '), hits: 1 });
      }
    }
  }

  return [...counts.values()]
    .filter((row) => row.hits >= minHits)
    .sort((a, b) => b.display.length - a.display.length)
    .slice(0, 5)
    .map((row) => row.display);
}

/** Drop DNA bits/refs/example that were already used in recent agent replies. */
export function filterStaleHumorDna(dna: HumorDNA | undefined | null, recentAgentBodies: string[]): HumorDNA | undefined {
  if (!dna) return undefined;
  const retired = recentlyUsedHumorBits(dna, recentAgentBodies);

  const keep = (bit: string) => !retired.some((r) => textIncludesHumorBit(bit, r) || textIncludesHumorBit(r, bit));

  const recurring_bits = (dna.recurring_bits ?? []).filter(keep);
  const inside_references = (dna.inside_references ?? []).filter(keep);
  const example = dna.example && keep(dna.example) ? dna.example : '';

  if (!recurring_bits.length && !inside_references.length && !example) {
    // Style alone is fine — no concrete gag left to echo.
    return { style: dna.style, recurring_bits: [], inside_references: [], example: '' };
  }

  return { ...dna, recurring_bits, inside_references, example };
}

export function askMentionsHumorBit(ask: string, bit: string): boolean {
  return textIncludesHumorBit(ask, bit);
}

/** Keep memories that are not just a retired running gag. */
export function filterMemoriesAgainstRetiredBits<T extends { memory_text: string }>(memories: T[], retiredBits: string[], ask: string): T[] {
  if (!retiredBits.length) return memories;
  return memories.filter((m) => {
    const text = m.memory_text ?? '';
    return !retiredBits.some((bit) => textIncludesHumorBit(text, bit) && !askMentionsHumorBit(ask, bit));
  });
}

/** Drop RAG lines that only revive a retired gag the ask is not about. */
export function filterRagAgainstRetiredBits(chunks: string[], retiredBits: string[], ask: string): string[] {
  if (!retiredBits.length) return chunks;
  return chunks.filter((chunk) => {
    return !retiredBits.some((bit) => textIncludesHumorBit(chunk, bit) && !askMentionsHumorBit(ask, bit));
  });
}
