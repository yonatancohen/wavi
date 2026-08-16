import type { WebSearchContext } from '@wavi/shared';

const AGENT_NAME = process.env.WA_AGENT_NAME ?? 'wavi';

const SKIP_PATTERNS = [
  /^(?:remember|forget|recall|זכור|תזכור|שכח)\b/i,
  /^(?:what do you remember|מה אתה זוכר|מה את זוכרת)/i,
  /^(?:roast|רוסט|תרוסט)\b/i,
  /^(?:summarize|סכם|תסכם)\b/i,
  /^(?:settle|תפתור)\b/i,
  /^(?:thanks|thank you|תודה|תודה רבה)\b/i,
  // Group-chat recap / verdict — answer from conversation context, not the open web.
  /(?:מי צודק|מה הלך(?:\s+פה)?|מה קרה(?:\s+פה)?|תסכם|סיכום)/u,
  /\b(?:who(?:'s| is) right|what happened(?:\s+here)?|what went on|summarize|summary)\b/i,
];

const QUESTION_PATTERNS = [
  /\?/,
  /^(?:who|what|when|where|why|how|which|is|are|was|were|did|does|do|can|will|should)\b/i,
  /^(?:מי|מה|מתי|איפה|למה|איך|האם|כמה)\b/u,
  /\b(?:today|tonight|now|latest|current|score|weather|news|price|stock|rate|results?)\b/i,
  /\b(?:היום|עכשיו|מזג|תוצאה|חדשות|מחיר|שער)\b/u,
];

// Explicit requests to search / verify — match even without question marks or factual keywords.
// Note: \b is ASCII-only so Hebrew patterns use (?:^|[\s,]) or bare substring matches instead.
const EXPLICIT_SEARCH_PATTERNS = [
  /\b(?:search|google|look.?up|check.?(?:the\s+)?(?:web|internet|online)|browse|fact.?check|verify)\b/i,
  /\b(?:is it true|are they right about)\b/i,
  /(?:^|[\s,])(?:תחפש|חפש|תגגל|גגל|תחפשי|חפשי|תבדוק|תבדקי)(?:[\s,]|$)/u,
  /(?:האם זה נכון|זה נכון ש)/u,
  // "אינטרנט" anywhere in the message (covers "תבדוק באינטרנט", "יש לך אינטרנט?" etc.)
  /אינטרנט/u,
  /\b(?:internet|online|web)\b/i,
];

/** Strip agent tag and WA mentions before building a search query. */
export function normalizeWebSearchQuery(message: string): string {
  return message
    .replace(new RegExp(`@${AGENT_NAME}`, 'gi'), '')
    .replace(/@\d{5,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heuristic: skip banter/commands; search when the message looks like a factual question or an explicit search request. */
export function shouldUseWebSearch(message: string): boolean {
  const q = normalizeWebSearchQuery(message);
  if (q.length < 8) return false;
  if (SKIP_PATTERNS.some((p) => p.test(q))) return false;
  if (EXPLICIT_SEARCH_PATTERNS.some((p) => p.test(q))) return true;
  return QUESTION_PATTERNS.some((p) => p.test(q));
}

export async function searchWeb(query: string): Promise<WebSearchContext | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[WebSearch] TAVILY_API_KEY not set — skipping search');
    return null;
  }

  const trimmed = query.slice(0, 400);
  if (!trimmed) return null;

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: trimmed,
        max_results: 5,
        search_depth: 'basic',
        include_answer: true,
      }),
    });

    if (!res.ok) {
      console.error(`[WebSearch] Tavily HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string }>;
    };

    const results = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));

    if (!results.length && !data.answer) return null;

    return {
      query: trimmed,
      answer: data.answer,
      results,
    };
  } catch (err) {
    console.error('[WebSearch] Search failed:', err);
    return null;
  }
}
