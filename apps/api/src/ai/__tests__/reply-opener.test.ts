import { describe, expect, it } from 'bun:test';
import { hasEmptyDisagreementOpener, looksLikeYesNoAsk, stripEmptyDisagreementOpener } from '../reply-opener.js';

describe('looksLikeYesNoAsk', () => {
  it('rejects open who/what asks', () => {
    expect(looksLikeYesNoAsk('@wavi מי צודק בכל מה שהלך פה ומה הלך פה?')).toBe(false);
    expect(looksLikeYesNoAsk('@wavi תסכם מה קרה')).toBe(false);
    expect(looksLikeYesNoAsk('what happened here')).toBe(false);
  });

  it('detects polar Hebrew and English asks', () => {
    expect(looksLikeYesNoAsk('האם אלכס צודק?')).toBe(true);
    expect(looksLikeYesNoAsk('צודק?')).toBe(true);
    expect(looksLikeYesNoAsk('is Alex right?')).toBe(true);
    expect(looksLikeYesNoAsk('yes or no — should we go?')).toBe(true);
  });
});

describe('stripEmptyDisagreementOpener', () => {
  const summary = 'לא, 187 הודעות על נת"צ מול חינוך שהפכו לבייבי ולביבי זה בדיוק היום שלכם בקטנה.';

  it('strips bare לא, on open asks', () => {
    const out = stripEmptyDisagreementOpener(summary, '@wavi מי צודק בכל מה שהלך פה ומה הלך פה?');
    expect(out.startsWith('לא')).toBe(false);
    expect(out).toContain('187 הודעות');
  });

  it('keeps לא, when rejecting a yes/no ask', () => {
    const reply = 'לא, אלכס לא צודק בנתונים האלה.';
    expect(stripEmptyDisagreementOpener(reply, 'האם אלכס צודק?')).toBe(reply);
  });

  it('strips English Nah, on open asks', () => {
    expect(stripEmptyDisagreementOpener('Nah, that thread was a mess.', 'what happened here')).toBe('that thread was a mess.');
  });

  it('detects empty openers for voice-example filtering', () => {
    expect(hasEmptyDisagreementOpener(summary)).toBe(true);
    expect(hasEmptyDisagreementOpener('אלכס צודק בנתונים.')).toBe(false);
  });
});
