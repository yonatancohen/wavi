/** Detect group-context text that talks about the prompt instead of the group. */

const EN_META =
  /\b(context block|write a (useful |short )?block|block \d|system prompt|you didn't pass|you did not pass|history (didn't|did not|hasn't) load|i (can't|cannot) write|i have nothing|empty group|no real messages|if you want me to (be able to )?write)\b/i;

const HE_META =
  /בלוק|קונטקסט|לא העברת|לא נתת|אין לי מה|אין לי כלום|קבוצה ריקה|ההיסטוריה.*(לא נטען|לא נטענה)|אין הודעות אמיתיות|אם אתה רוצה שאוכל|אם את רוצה שאוכל|לגבי\s+context|לכתוב\s+block|block\s+שימושי/i;

export function isMetaGroupContext(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return EN_META.test(t) || HE_META.test(t);
}

export function isBrokenBriefing(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\*\*|__|^#{1,3}\s/m.test(t)) return true;
  if (/בריפינג|\bbriefing\b/i.test(t)) return true;
  if (/^\s*[-*]\s/m.test(t)) return true;
  if (/אחזקה על הנעשה/.test(t)) return true;
  return false;
}

export function usableGroupContext(text: string | null | undefined): string {
  const t = text?.trim() ?? '';
  if (!t || isMetaGroupContext(t) || isBrokenBriefing(t)) return '';
  return t;
}

export function isThinEpisodeSummary(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return true;
  return /^(group activity\.?|group conversation\.?|שיחה בקבוצה\.?)$/i.test(t);
}
