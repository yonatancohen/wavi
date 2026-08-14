export type ExtractedEvent = {
  who: string[];
  what: string;
  when?: string;
  why_it_matters?: string;
};

export type EpisodeSummaryResult = {
  summary: string;
  events: ExtractedEvent[];
};

const FALLBACK_SUMMARY = 'Group activity.';

function stripJsonFences(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function normalizeEvent(raw: unknown): ExtractedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const what = typeof rec.what === 'string' ? rec.what.trim() : '';
  if (!what) return null;

  const who = Array.isArray(rec.who)
    ? rec.who.filter((name): name is string => typeof name === 'string')
    : [];

  const event: ExtractedEvent = { who, what };
  const when = optionalString(rec.when);
  const why = optionalString(rec.why_it_matters);
  if (when) event.when = when;
  if (why) event.why_it_matters = why;
  return event;
}

function normalizeEvents(raw: unknown): ExtractedEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ExtractedEvent[] = [];
  for (const item of raw) {
    const event = normalizeEvent(item);
    if (event) events.push(event);
    if (events.length >= 3) break;
  }
  return events;
}

export function parseEpisodeSummaryResponse(text: string): EpisodeSummaryResult {
  const cleaned = stripJsonFences(text);

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed === 'string') {
      const summary = parsed.trim() || FALLBACK_SUMMARY;
      return { summary, events: [] };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>;
      const summary =
        typeof rec.summary === 'string' && rec.summary.trim() ? rec.summary.trim() : FALLBACK_SUMMARY;
      return { summary, events: normalizeEvents(rec.events) };
    }
    return { summary: FALLBACK_SUMMARY, events: [] };
  } catch {
    // Legacy Haiku returned prose; only treat `{`/`[` as broken JSON.
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
      return { summary: cleaned || FALLBACK_SUMMARY, events: [] };
    }
    return { summary: FALLBACK_SUMMARY, events: [] };
  }
}
