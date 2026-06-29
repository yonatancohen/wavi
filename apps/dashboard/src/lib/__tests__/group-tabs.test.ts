import { describe, expect, it } from 'bun:test';
import { GROUP_TABS, tabFromParam } from '../group-tabs.js';

describe('GROUP_TABS', () => {
  it('contains the expected 8 tabs in order', () => {
    expect(GROUP_TABS).toEqual(['setup', 'character', 'people', 'dynamics', 'messages', 'testChat', 'automations', 'sync']);
  });
});

describe('tabFromParam', () => {
  it('returns setup for undefined', () => {
    expect(tabFromParam(undefined)).toBe('setup');
  });

  it('returns setup for an empty string', () => {
    expect(tabFromParam('')).toBe('setup');
  });

  it('returns setup for an unrecognised value', () => {
    expect(tabFromParam('unknown')).toBe('setup');
    expect(tabFromParam('hash#character')).toBe('setup');
    expect(tabFromParam('#character')).toBe('setup');
  });

  it('returns each valid tab id unchanged', () => {
    for (const tab of GROUP_TABS) {
      expect(tabFromParam(tab)).toBe(tab);
    }
  });

  it('uses the first element when given an array', () => {
    expect(tabFromParam(['character', 'setup'])).toBe('character');
  });

  it('returns setup when the array contains an invalid tab', () => {
    expect(tabFromParam(['nope'])).toBe('setup');
  });
});
