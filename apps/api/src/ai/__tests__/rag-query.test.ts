import { describe, expect, it } from 'bun:test';
import { normalizeRagQuery } from '../rag-query.js';

describe('normalizeRagQuery', () => {
  it('strips agent tag and filler', () => {
    const q = normalizeRagQuery('@wavi מי זה Dan Cohen? וואו', []);
    expect(q).not.toContain('@wavi');
    expect(q).toContain('Dan Cohen');
  });

  it('prepends recent context when available', () => {
    const q = normalizeRagQuery('@wavi who is he?', [
      { sender_name: 'Bob', body: 'earlier msg' },
      { sender_name: 'Alice', body: 'talking about Dan' },
    ]);
    expect(q).toContain('Alice');
    expect(q).toContain('who is he');
  });
});
