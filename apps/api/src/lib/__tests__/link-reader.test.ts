import { describe, expect, it } from 'bun:test';
import { collectMessageUrls, extractUrls } from '../link-reader.js';

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
