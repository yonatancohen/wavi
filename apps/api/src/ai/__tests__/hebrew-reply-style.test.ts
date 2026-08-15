import { describe, expect, it } from 'bun:test';
import { hebrewGrammarFirstRules, hebrewHumorCraftRules, hebrewWhatsAppFormatRules } from '../hebrew-reply-style.js';

describe('hebrewGrammarFirstRules', () => {
  it('orders grammar before format and humor', () => {
    const rules = hebrewGrammarFirstRules('זכר');
    expect(rules).toContain('דקדוק קודם');
    expect(rules.indexOf('משפט אחד בראש')).toBeLessThan(rules.indexOf('קצר אותו לוואטסאפ'));
    expect(rules.indexOf('קצר אותו לוואטסאפ')).toBeLessThan(rules.indexOf('חצי חיוך'));
  });

  it('bans essay bridges and English calques', () => {
    const rules = hebrewGrammarFirstRules('נקבה');
    expect(rules).toContain('ולגבי X');
    expect(rules).toContain('אני חושבת');
    expect(rules).toContain('נקבה');
  });
});

describe('hebrewWhatsAppFormatRules', () => {
  it('forbids em-dashes and לגבי bridges', () => {
    const rules = hebrewWhatsAppFormatRules();
    expect(rules).toContain('בלי מקף ארוך');
    expect(rules).toContain('ולגבי');
    expect(rules).toContain('נושא אחד');
  });
});

describe('hebrewHumorCraftRules', () => {
  it('stays straight when humor is low', () => {
    expect(hebrewHumorCraftRules(10)).toContain('אל תצחיק');
  });

  it('allows a sharper jab when humor is high, still one sentence', () => {
    const rules = hebrewHumorCraftRules(90);
    expect(rules).toContain('חצוף');
    expect(rules).toContain('לא סטאנדאפ');
    expect(rules).toContain('רק אם זה על הנושא');
  });
});
