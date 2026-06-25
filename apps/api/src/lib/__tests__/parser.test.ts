import { describe, expect, it } from 'bun:test';
import { parseWAExport } from '../parser.js';

describe('parseWAExport', () => {
  it('parses a simple Android message', () => {
    const raw = '21/03/2014, 13:32 - Ohad: מי רעב?';
    const [msg] = parseWAExport(raw);
    expect(msg?.sender_name).toBe('Ohad');
    expect(msg?.body).toBe('מי רעב?');
  });

  it('parses a simple iOS message', () => {
    const raw = '[12/03/2024, 14:32:11] Dan: hey there';
    const [msg] = parseWAExport(raw);
    expect(msg?.sender_name).toBe('Dan');
    expect(msg?.body).toBe('hey there');
  });

  it('keeps sender when first line ends with colon before continuation', () => {
    const raw = `19/08/2014, 21:05 - לוצ'י: סיכום:
שיפוץ קל ואפשר לחיות שם`;
    const [msg] = parseWAExport(raw);
    expect(msg?.sender_name).toBe("לוצ'י");
    expect(msg?.body).toBe('סיכום:\nשיפוץ קל ואפשר לחיות שם');
  });

  it('keeps sender for quote-style multiline messages', () => {
    const raw = `30/04/2015, 22:19 - Ohad: אני מניח שהתשובה תהיה:
"תנו לי קודם להגיע הביתה ואז נראה"`;
    const [msg] = parseWAExport(raw);
    expect(msg?.sender_name).toBe('Ohad');
    expect(msg?.body).toContain('אני מניח שהתשובה תהיה');
    expect(msg?.body).toContain('תנו לי קודם להגיע הביתה');
  });

  it('does not invent phantom senders from multiline colon continuations', () => {
    const raw = [
      '21/03/2014, 13:32 - Ohad: מי רעב?',
      "19/08/2014, 21:05 - לוצ'י: סיכום:",
      'שיפוץ קל ואפשר לחיות שם',
      '30/04/2015, 22:19 - Ohad: אני מניח שהתשובה תהיה:',
      '"תנו לי קודם להגיע הביתה ואז נראה"',
    ].join('\n');

    const messages = parseWAExport(raw);
    const senders = new Set(messages.map((m) => m.sender_name));
    expect(senders.size).toBe(2);
    expect(senders.has('Ohad')).toBe(true);
    expect(senders.has("לוצ'י")).toBe(true);
    expect([...senders].some((s) => s.includes(':'))).toBe(false);
  });

  it('accumulates generic multiline bodies under the same sender', () => {
    const raw = `21/03/2014, 13:32 - Ohad: line one
line two continues`;
    const [msg] = parseWAExport(raw);
    expect(msg?.sender_name).toBe('Ohad');
    expect(msg?.body).toBe('line one\nline two continues');
  });
});
