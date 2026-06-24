import { describe, expect, it } from 'bun:test';
import { participantCountFromWa } from '../participant-count.js';

describe('participantCountFromWa', () => {
  it('counts array participants (wwebjs)', () => {
    expect(participantCountFromWa([{}, {}, {}])).toBe(3);
  });

  it('counts object participants (baileys)', () => {
    expect(participantCountFromWa({ '1@s.whatsapp.net': {}, '2@s.whatsapp.net': {} })).toBe(2);
  });

  it('returns null for missing participants', () => {
    expect(participantCountFromWa(null)).toBe(null);
    expect(participantCountFromWa(undefined)).toBe(null);
  });
});
