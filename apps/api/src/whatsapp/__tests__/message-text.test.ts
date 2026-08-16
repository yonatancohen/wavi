import { describe, expect, it } from 'bun:test';
import { textFromBaileysMessageContent } from '../baileys-message-text.js';
import { enrichWwebjsMessageBody } from '../wwebjs-message-text.js';

describe('textFromBaileysMessageContent', () => {
  it('pulls canonicalUrl from link-preview quotes even when text is stubby', () => {
    const body = textFromBaileysMessageContent({
      extendedTextMessage: {
        text: 'שלחתי לך מחקר',
        matchedText: 'https://www.sciencedirect.com/science/article/pii/S0738059325001683',
        canonicalUrl: 'https://www.sciencedirect.com/science/article/pii/S0738059325001683?utm_source=chatgpt.com',
        title: 'Education study',
      },
    });
    expect(body).toContain('https://www.sciencedirect.com/science/article/pii/S0738059325001683');
    expect(body).toContain('שלחתי לך מחקר');
  });

  it('includes document caption and title', () => {
    const body = textFromBaileysMessageContent({
      documentMessage: {
        caption: 'see this',
        title: 'paper.pdf',
        fileName: 'paper.pdf',
      },
    });
    expect(body).toContain('see this');
    expect(body).toContain('paper.pdf');
  });
});

describe('enrichWwebjsMessageBody', () => {
  it('appends canonicalUrl and links from raw message metadata', () => {
    const body = enrichWwebjsMessageBody('check this', {
      links: [{ link: 'https://example.com/a' }],
      _data: { canonicalUrl: 'https://example.com/canonical' },
    });
    expect(body).toContain('check this');
    expect(body).toContain('https://example.com/a');
    expect(body).toContain('https://example.com/canonical');
  });
});
