import { describe, expect, test, beforeEach } from 'bun:test';
import { bindAgentIdentity, clearAgentIdentity, isAgentTagged } from '../agent-identity.js';

describe('isAgentTagged', () => {
  beforeEach(() => clearAgentIdentity());

  test('matches @wavi text tag', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(isAgentTagged({}, '@wavi hello', 'wavi')).toBe(true);
  });

  test('matches native LID mention in body when phone differs', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(isAgentTagged({}, '@262680938057813 בוקר טוב', 'wavi')).toBe(true);
  });

  test('matches mentionedIds LID', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(isAgentTagged({ mentionedIds: ['262680938057813@lid'] }, 'בוקר טוב', 'wavi')).toBe(true);
  });

  test('ignores unrelated native mention', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(isAgentTagged({}, '@95077707808998 בוקר טוב', 'wavi')).toBe(false);
  });

  test('no match when agent identity unknown', () => {
    expect(isAgentTagged({}, '@262680938057813 בוקר טוב', 'wavi')).toBe(false);
  });
});
