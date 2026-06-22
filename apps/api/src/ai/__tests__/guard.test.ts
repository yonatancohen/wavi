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

  it('allows normal group chat questions', () => {
    const result = checkInputGuard('@wavi מי זה Dan Cohen?', 'he');
    expect(result.blocked).toBe(false);
  });
});
