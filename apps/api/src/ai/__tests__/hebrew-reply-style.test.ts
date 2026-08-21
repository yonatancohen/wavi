import { describe, expect, it } from 'bun:test';
import {
  hebrewDatetime,
  hebrewDigestFormatRules,
  hebrewDigestGrounding,
  hebrewDigestTrigger,
  hebrewGrammarFirstRules,
  hebrewGroundingRules,
  hebrewHumorCraftRules,
  hebrewHumorStyleLabel,
  hebrewWebSearchEmpty,
  hebrewWhatsAppFormatRules,
} from '../hebrew-reply-style.js';

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
    expect(rules).toContain('אל תפתח ב"לא,"');
  });
});

describe('hebrewWhatsAppFormatRules', () => {
  it('forbids em-dashes and לגבי bridges', () => {
    const rules = hebrewWhatsAppFormatRules();
    expect(rules).toContain('בלי מקף ארוך');
    expect(rules).toContain('ולגבי');
    expect(rules).toContain('נושא אחד');
    expect(rules).toContain('פתיח שלילה ריק');
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
    expect(rules).toContain('אל תמחזר');
  });

  it('turns humor off on serious asks and lists retired bits', () => {
    const serious = hebrewHumorCraftRules(90, { serious: true });
    expect(serious).toContain('כבוי');
    expect(serious).toContain('בלי בדיחות');

    const retired = hebrewHumorCraftRules(70, { retiredBits: ['הציפורניים של אוהד'] });
    expect(retired).toContain('הציפורניים של אוהד');
    expect(retired).toContain('אסורים עכשיו');
  });
});

describe('hebrewGroundingRules', () => {
  it('bans inventing chat facts and external guesses', () => {
    const rules = hebrewGroundingRules();
    expect(rules).toContain('עובדות — בלי המצאות');
    expect(rules).toContain('אל תמציא מי אמר מה');
    expect(rules).toContain('אל תנחש מספרים');
    expect(hebrewWebSearchEmpty()).toContain('אל תמציא עובדות');
    expect(hebrewWebSearchEmpty()).not.toContain('בניחוש');
  });
});

describe('hebrewHumorStyleLabel', () => {
  it('maps stored English style ids to Hebrew', () => {
    expect(hebrewHumorStyleLabel('dry')).toBe('יבש');
    expect(hebrewHumorStyleLabel('sarcastic')).toBe('סרקסטי');
  });
});

describe('hebrewDatetime', () => {
  it('tells Hebrew replies to phrase from now and message times without English scaffolding', () => {
    const block = hebrewDatetime('יום שישי, 21 באוגוסט 2026, 10:00', 'Asia/Jerusalem');
    expect(block).toContain('הזמן עכשיו');
    expect(block).toContain('Asia/Jerusalem');
    expect(block).toContain('היום, אתמול');
    expect(block).not.toContain('BLOCK — CURRENT TIME');
    expect(block).not.toContain('today / yesterday');
  });
});

describe('hebrewDigestTrigger', () => {
  it('anchors a daily digest in Hebrew to the last 24 hours of messages', () => {
    const body = hebrewDigestTrigger('יום שישי, 21 באוגוסט 2026, 10:00', 'Asia/Jerusalem', 'daily');
    expect(body).toContain('סיכום');
    expect(body).toContain('24');
    expect(body).toContain('10:00');
    expect(body).toContain('Asia/Jerusalem');
    expect(body).toContain('רק מה שכתוב');
    expect(body).not.toContain('Right now');
    expect(body).not.toContain('this morning');
    expect(body).not.toContain('7 הימים');
  });

  it('anchors a weekly digest in Hebrew to the last 7 days', () => {
    const body = hebrewDigestTrigger('יום שישי, 21 באוגוסט 2026, 10:00', 'Asia/Jerusalem', 'weekly');
    expect(body).toContain('7');
    expect(body).toContain('רק מה שכתוב');
    expect(body).not.toContain('24 שעות');
    expect(body).not.toContain('Right now');
  });
});

describe('hebrewDigestFormatRules', () => {
  it('asks for a real recap of the window, not a mashup of old trips', () => {
    const rules = hebrewDigestFormatRules();
    expect(rules).toContain('2–5 משפטים');
    expect(rules).toContain('חלון');
    expect(rules).toContain('לא קשורים');
    expect(rules).not.toContain('נושא אחד להודעה');
    expect(rules).not.toContain('ONE short message');
  });
});

describe('hebrewDigestGrounding', () => {
  it('forbids old RAG, events, and invented itineraries', () => {
    const rules = hebrewDigestGrounding();
    expect(rules).toContain('רק על ההודעות');
    expect(rules).toContain('אל תמציא');
    expect(rules).not.toContain('retrieved past context');
    expect(rules).not.toContain('events, memories');
  });
});
