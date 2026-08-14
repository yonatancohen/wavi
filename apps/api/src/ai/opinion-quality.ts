export type StructuredOpinion = { topic: string; stance: string; because?: string };

export function flattenOpinion(op: StructuredOpinion | string): string {
  if (typeof op === 'string') return op.trim();

  const stance = op.stance.trim();
  const because = op.because?.trim();
  if (because && stance.length < 40) return `${stance} — ${because}`;
  return stance;
}

const EN_RECAP =
  /\bwe (went|did|decided|visited|traveled|flew|ate|stayed)\b|\bthe group (went|did|decided|visited)\b|\b(went|flew|traveled) to\b/i;
const EN_DATE_RECAP = /\blast (summer|year|week) we\b/i;
const HE_RECAP = /הלכנו|יצאנו|טסנו|אכלנו|החלטנו|נסענו|ביקרנו|היינו ב|הקבוצה (הלכה|יצאה|החליטה|נסעה)/;
const HE_DATE_RECAP = /בשנה שעברה|בחודש שעבר|בקיץ שעבר/;

// Past-event verbs also appear as reasons inside a present take ("אם לא יצאנו…", "we should…").
// Hebrew has no JS \b, so אם/צריך are matched as literals.
const PRESENT_STANCE = /\b(should|shouldn't|need to|must|every time)\b|צריך|אם/i;

export function isRecapOpinion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (PRESENT_STANCE.test(t)) return false;
  return EN_RECAP.test(t) || EN_DATE_RECAP.test(t) || HE_RECAP.test(t) || HE_DATE_RECAP.test(t);
}

const GENERIC_EN =
  /\b(good\s+)?food\s+is\s+(important|good)\b|\bplanning\s+is\s+fun\b|\bhumor\s+is\s+important\b/i;
const GENERIC_HE = /אוכל זה חשוב|תכנון זה כיף|הומור חשוב/;

export function isGenericOpinion(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || t.length > 180) return true;
  return GENERIC_EN.test(t) || GENERIC_HE.test(t);
}

export function evaluateOpinion(text: string): {
  ok: boolean;
  reason?: 'empty' | 'generic' | 'recap' | 'too_long' | 'too_short';
} {
  const t = text.trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (t.length < 12) return { ok: false, reason: 'too_short' };
  if (t.length > 180) return { ok: false, reason: 'too_long' };
  if (GENERIC_EN.test(t) || GENERIC_HE.test(t)) return { ok: false, reason: 'generic' };
  if (isRecapOpinion(t)) return { ok: false, reason: 'recap' };
  return { ok: true };
}

export function filterValidOpinions(opinions: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of opinions) {
    const t = raw.trim();
    if (!t) continue;
    if (!evaluateOpinion(t).ok) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function asStructuredOpinion(value: unknown): StructuredOpinion | null {
  if (!value || typeof value !== 'object') return null;
  const stance = (value as { stance?: unknown }).stance;
  if (typeof stance !== 'string') return null;
  const topic = (value as { topic?: unknown }).topic;
  const because = (value as { because?: unknown }).because;
  return {
    topic: typeof topic === 'string' ? topic : '',
    stance,
    ...(typeof because === 'string' ? { because } : {}),
  };
}

export function parseSynthesisOpinions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const flattened: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      flattened.push(flattenOpinion(item));
      continue;
    }
    const structured = asStructuredOpinion(item);
    if (structured) flattened.push(flattenOpinion(structured));
  }
  return filterValidOpinions(flattened);
}
