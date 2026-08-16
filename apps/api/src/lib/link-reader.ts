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
 * True when extracted "content" is a bot/paywall shell rather than article text.
 * ScienceDirect often returns Cloudflare HTML that looks like a successful extract.
 */
export function isUnusableLinkContent(content: string): boolean {
  const t = content.replace(/\s+/g, ' ').trim();
  if (t.length < 80) return true;
  const lower = t.toLowerCase();
  if (/cloudflare|cf-error|just a moment|attention required|enable javascript and cookies/i.test(lower)) {
    return true;
  }
  if (/access denied|captcha|please verify you are a human|security check/i.test(lower)) {
    return true;
  }
  // Thin paywall shells without abstract/body
  if (/sciencedirect|elsevier/i.test(lower) && t.length < 400 && !/\babstract\b/i.test(lower)) {
    return true;
  }
  return false;
}

export function linkContentsAreUsable(links: LinkContent[] | null | undefined): boolean {
  if (!links?.length) return false;
  return links.some((l) => !l.failed && l.content.trim() && !isUnusableLinkContent(l.content));
}

/**
 * Search queries when direct extract fails (paywalled / Cloudflare hosts).
 * Prefer DOI/PII lookups that often surface open abstracts via Crossref/Unpaywall mirrors.
 */
export function linkFallbackSearchQueries(urls: string[]): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t.length < 8) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(t.slice(0, 300));
  };

  for (const url of urls) {
    try {
      const u = new URL(url);
      // Strip tracking params for cleaner search / extract fallback
      u.search = '';
      u.hash = '';
      push(u.toString());
      const pii = u.pathname.match(/\/pii\/([A-Z0-9]+)/i)?.[1];
      if (pii) {
        push(`ScienceDirect ${pii} abstract`);
        push(`Elsevier article ${pii}`);
      }
      const doi = u.pathname.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];
      if (doi) push(`${doi} abstract`);
    } catch {
      push(url);
    }
  }
  return queries.slice(0, 4);
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
      const unusable = !content || isUnusableLinkContent(content);
      byUrl.set(row.url, {
        url: row.url,
        title: unusable ? undefined : row.title,
        content: unusable ? '' : content,
        failed: unusable,
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
