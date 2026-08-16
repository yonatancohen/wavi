import { describe, expect, it } from 'bun:test';
import {
  filterMemoriesAgainstRetiredBits,
  filterRagAgainstRetiredBits,
  filterStaleHumorDna,
  isSeriousAsk,
  recentlyUsedHumorBits,
  repeatedAgentPhrases,
  textIncludesHumorBit,
} from '../humor-freshness.js';

describe('isSeriousAsk', () => {
  it('detects Hebrew verdict / recap asks', () => {
    expect(isSeriousAsk('@wavi מי צודק בכל מה שהלך פה ומה הלך פה?')).toBe(true);
    expect(isSeriousAsk('@wavi תסכם מה קרה')).toBe(true);
  });

  it('leaves banter alone', () => {
    expect(isSeriousAsk('מה אומר על הפיצה')).toBe(false);
    expect(isSeriousAsk('בוא נלך לראות ספיידרמן')).toBe(false);
  });
});

describe('recentlyUsedHumorBits', () => {
  const dna = {
    style: 'dry' as const,
    recurring_bits: ['הציפורניים של אוהד', 'מגזינו זה מהלך'],
    inside_references: ['הדרמה עם הסרט'],
    example: 'הציפורניים של אוהד זה כבר קלאסיקה',
  };

  it('retires DNA bits that already appeared in agent replies', () => {
    const retired = recentlyUsedHumorBits(dna, ['אוקיי אבל הציפורניים של אוהד עדיין מצחיקות אותי', 'פסק דין: תלכו לישון']);
    expect(retired.some((b) => b.includes('ציפורניים'))).toBe(true);
    expect(retired.some((b) => b.includes('מגזינו'))).toBe(false);
  });

  it('filters stale DNA so the used gag is gone', () => {
    const filtered = filterStaleHumorDna(dna, ['שוב עם הציפורניים של אוהד חחח']);
    expect(filtered?.recurring_bits).toEqual(['מגזינו זה מהלך']);
    expect(filtered?.example).toBe('');
  });
});

describe('repeatedAgentPhrases', () => {
  it('finds a gag phrase repeated across agent replies', () => {
    const phrases = repeatedAgentPhrases(['רגע הציפורניים של אוהד שוב?', 'לא שוכחים את הציפורניים של אוהד', 'משהו אחר לגמרי על נתצ']);
    expect(phrases.some((p) => p.includes('ציפורניים') && p.includes('אוהד'))).toBe(true);
  });
});

describe('filters against retired bits', () => {
  it('drops memories and rag that only revive a retired gag', () => {
    const bit = 'הציפורניים של אוהד';
    expect(textIncludesHumorBit('זוכרים את הציפורניים של אוהד', bit)).toBe(true);

    const memories = filterMemoriesAgainstRetiredBits([{ memory_text: 'הציפורניים של אוהד זה רץ' }, { memory_text: 'אוהד מביא רשימות בלי לצעוק' }], [bit], 'תסכם מה קרה');
    expect(memories.map((m) => m.memory_text)).toEqual(['אוהד מביא רשימות בלי לצעוק']);

    const chunks = filterRagAgainstRetiredBits(['קטע על הציפורניים של אוהד', 'ויכוח נתצ מול חינוך'], [bit], 'מי צודק ומה הלך פה');
    expect(chunks).toEqual(['ויכוח נתצ מול חינוך']);
  });
});
