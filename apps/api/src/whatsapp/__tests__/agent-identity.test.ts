import { describe, expect, test, beforeEach } from 'bun:test';
import { bindAgentIdentity, clearAgentIdentity, isAgentTagged, isQuotedAgent } from '../agent-identity.js';

describe('isAgentTagged', () => {
  beforeEach(() => clearAgentIdentity());

  test('matches @wavi text tag', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(isAgentTagged({}, '@wavi hello', 'wavi')).toBe(true);
  });

  test('matches quote-reply to Wavi without @ mention', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(
      isAgentTagged(
        {
          quotedMessage: {
            body: 'כן ברור',
            senderWaId: '972553151671@c.us',
            senderName: 'wavi',
            fromMe: true,
          },
        },
        'למה אמרת את זה?',
        'wavi',
      ),
    ).toBe(true);
  });

  test('matches quote-reply by agent participant id', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(
      isAgentTagged(
        {
          quotedMessage: {
            body: 'previous reply',
            senderWaId: '262680938057813@lid',
            senderName: '262680938057813@lid',
          },
        },
        'explain',
        'wavi',
      ),
    ).toBe(true);
  });

  test('ignores quote-reply to another member', () => {
    bindAgentIdentity({ phoneUser: '972553151671', lidUser: '262680938057813' });
    expect(
      isAgentTagged(
        {
          quotedMessage: {
            body: 'hey',
            senderWaId: '95077707808998@c.us',
            senderName: 'Dan',
          },
        },
        'what do you think?',
        'wavi',
      ),
    ).toBe(false);
  });

  test('isQuotedAgent matches fromMe', () => {
    expect(isQuotedAgent({ body: 'hi', senderWaId: 'x', senderName: 'x', fromMe: true })).toBe(true);
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
