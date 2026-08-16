import { describe, expect, it } from 'bun:test';
import { collectMessageUrls, extractUrls, isUnusableLinkContent, linkContentsAreUsable, linkFallbackSearchQueries } from '../link-reader.js';

describe('extractUrls', () => {
  it('pulls https links and trims trailing punctuation', () => {
    const text = 'הנה קבל שוב https://www.sciencedirect.com/science/article/pii/S0738059325001683?utm_source=chatgpt.com';
    expect(extractUrls(text)).toEqual(['https://www.sciencedirect.com/science/article/pii/S0738059325001683?utm_source=chatgpt.com']);
  });

  it('skips WhatsApp invite links', () => {
    expect(extractUrls('join https://chat.whatsapp.com/AbCdEf')).toEqual([]);
  });
});

describe('collectMessageUrls', () => {
  it('reads a URL from the quoted message when the tag ask has none', () => {
    const urls = collectMessageUrls('תשלח ל @wavi', 'שלחתי מחקר הנה https://example.com/paper.pdf');
    expect(urls).toEqual(['https://example.com/paper.pdf']);
  });

  it('prefers unique urls from current then quoted, max 2', () => {
    const urls = collectMessageUrls('read https://a.example/1 and https://b.example/2', 'also https://c.example/3');
    expect(urls).toEqual(['https://a.example/1', 'https://b.example/2']);
  });
});

describe('isUnusableLinkContent', () => {
  it('rejects Cloudflare challenge shells', () => {
    expect(isUnusableLinkContent('Just a moment... Enable JavaScript and cookies to continue Cloudflare Ray ID abc')).toBe(true);
  });

  it('rejects short empty-ish extract', () => {
    expect(isUnusableLinkContent('ScienceDirect')).toBe(true);
  });

  it('accepts real abstract-length text', () => {
    const body =
      'Abstract This paper examines educational technology outcomes across 56 percent of reported spending cases and finds that waste claims are often overstated when controlling for measurement error. '.repeat(
        2,
      );
    expect(isUnusableLinkContent(body)).toBe(false);
  });
});

describe('linkContentsAreUsable', () => {
  it('is false when all extracts failed', () => {
    expect(linkContentsAreUsable([{ url: 'https://x.test', content: '', failed: true }])).toBe(false);
  });

  it('is true when at least one usable body exists', () => {
    const body = 'Abstract findings about learning outcomes and cost effectiveness in schools. '.repeat(3);
    expect(
      linkContentsAreUsable([
        { url: 'https://blocked.test', content: '', failed: true },
        { url: 'https://ok.test', content: body, failed: false },
      ]),
    ).toBe(true);
  });
});

describe('linkFallbackSearchQueries', () => {
  it('builds ScienceDirect PII abstract queries from the article URL', () => {
    const url = 'https://www.sciencedirect.com/science/article/pii/S0738059325001683?utm_source=chatgpt.com';
    const qs = linkFallbackSearchQueries([url]);
    expect(qs[0]).toBe('https://www.sciencedirect.com/science/article/pii/S0738059325001683');
    expect(qs.some((q) => /ScienceDirect S0738059325001683 abstract/i.test(q))).toBe(true);
    expect(qs.every((q) => !q.includes('utm_source'))).toBe(true);
  });
});
