import { describe, expect, it } from 'bun:test';
import { checkInputGuard, MAX_TAGGED_MESSAGE_LENGTH } from '../guard.js';

describe('checkInputGuard', () => {
  it('blocks overly long messages', () => {
    const body = 'x'.repeat(MAX_TAGGED_MESSAGE_LENGTH + 1);
    const result = checkInputGuard(body, 'he');
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.deflection).toContain('ארוך');
  });

  it('blocks fenced code blocks', () => {
    const result = checkInputGuard('```\nfunction foo() {}\n```', 'en');
    expect(result.blocked).toBe(true);
  });

  it('blocks write-code requests', () => {
    const result = checkInputGuard('@wavi write code for a todo app', 'en');
    expect(result.blocked).toBe(true);
  });

  it('blocks Hebrew code requests', () => {
    const result = checkInputGuard('@wavi כתוב קוד לי', 'he');
    expect(result.blocked).toBe(true);
  });

  it('blocks Hebrew app-build requests', () => {
    const result = checkInputGuard('@wavi בנה לי אפליקציה', 'he');
    expect(result.blocked).toBe(true);
  });

  it('allows normal group chat questions', () => {
    const result = checkInputGuard('@wavi מי זה Dan Cohen?', 'he');
    expect(result.blocked).toBe(false);
  });

  it('allows translation requests', () => {
    const result = checkInputGuard('@wavi כתוב לי תרגום של push the limit', 'he');
    expect(result.blocked).toBe(false);
  });

  it('allows asking for a short article', () => {
    const result = checkInputGuard('@wavi כתוב לי מאמר על פרוטאין', 'he');
    expect(result.blocked).toBe(false);
  });

  it('allows fitness class mentions', () => {
    const result = checkInputGuard('@wavi create a fitness class schedule', 'en');
    expect(result.blocked).toBe(false);
  });

  it('allows document/plan requests', () => {
    const result = checkInputGuard('@wavi create a workout document', 'en');
    expect(result.blocked).toBe(false);
  });

  it('blocks implement function requests', () => {
    const result = checkInputGuard('@wavi implement a function that sorts an array', 'en');
    expect(result.blocked).toBe(true);
  });

  it('does not fire on "you are now" phrases', () => {
    const result = checkInputGuard('you are now the best coach ever', 'en');
    expect(result.blocked).toBe(false);
  });
});
