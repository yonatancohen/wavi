import type { LinkContent } from '@wavi/shared';

const URL_RE = /https?:\/\/[^\s<>\]"'`]+/gi;
const TRAILING_PUNCT = /[),.。、;:!?]+$/;

/** Pull http(s) URLs from message text (WhatsApp plain links). */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(TRAILING_PUNCT, '');
    if (!/^https?:\/\//i.test(url)) continue;
    // Skip WhatsApp invite / media stubs — not readable articles.
    if (/chat\.whatsapp\.com|wa\.me\//i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(url);
  }
  return found;
}

/** URLs from the tagged message and any quoted message (e.g. "תשלח ל @wavi" on a link). */
export function collectMessageUrls(currentMessage: string, quotedBody?: string | null): string[] {
  const urls = [...extractUrls(currentMessage), ...extractUrls(quotedBody ?? '')];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
    if (out.length >= 2) break;
  }
  return out;
}

function truncateContent(text: string, maxChars = 6000): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}…`;
}

/**
 * Fetch readable page text for shared links via Tavily Extract.
 * Triggered whenever a tagged/quoted message carries a URL — ask wording does not matter.
 */
export async function fetchLinkContents(urls: string[], query?: string): Promise<LinkContent[]> {
  if (!urls.length) return [];

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[LinkReader] TAVILY_API_KEY not set — skipping link extract');
    return urls.map((url) => ({ url, content: '', failed: true }));
  }

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      urls,
      extract_depth: 'advanced',
      format: 'text',
    };
    const q = query?.trim();
    if (q && q.length >= 4) {
      body.query = q.slice(0, 300);
      body.chunks_per_source = 5;
    }

    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[LinkReader] Tavily extract HTTP ${res.status}`);
      return urls.map((url) => ({ url, content: '', failed: true }));
    }

    const data = (await res.json()) as {
      results?: Array<{ url: string; raw_content?: string; title?: string }>;
      failed_results?: Array<{ url: string; error?: string }>;
    };

    const byUrl = new Map<string, LinkContent>();
    for (const row of data.results ?? []) {
      const content = truncateContent(row.raw_content ?? '');
      byUrl.set(row.url, {
        url: row.url,
        title: row.title,
        content,
        failed: !content,
      });
    }
    for (const fail of data.failed_results ?? []) {
      if (!byUrl.has(fail.url)) {
        byUrl.set(fail.url, { url: fail.url, content: '', failed: true });
      }
    }

    return urls.map((url) => byUrl.get(url) ?? { url, content: '', failed: true });
  } catch (err) {
    console.error('[LinkReader] Extract failed:', err);
    return urls.map((url) => ({ url, content: '', failed: true }));
  }
}
