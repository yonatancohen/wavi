import { describe, expect, it } from 'bun:test';
import { groupProfilesByNormalizedName, isPhoneLikeWaUserId, pickKeepProfile } from '../duplicate-profiles.js';

describe('duplicate-profiles', () => {
  it('detects phone-like wa_user_id', () => {
    expect(isPhoneLikeWaUserId('972501234567')).toBe(true);
    expect(isPhoneLikeWaUserId('יונתן')).toBe(false);
    expect(isPhoneLikeWaUserId('123')).toBe(false);
  });

  it('groups same display names ignoring punctuation/case', () => {
    const groups = groupProfilesByNormalizedName([
      { id: '1', wa_user_id: 'אדיר', display_name: 'אדיר', msg_count: 10 },
      { id: '2', wa_user_id: '9725', display_name: 'אדיר', msg_count: 3 },
      { id: '3', wa_user_id: 'other', display_name: 'Other', msg_count: 1 },
    ]);
    expect(groups.get('אדיר')?.length).toBe(2);
    expect(groups.get('other')?.length).toBe(1);
  });

  it('keeps phone id over export-label id', () => {
    const result = pickKeepProfile([
      { id: 'export', wa_user_id: 'יונתן', display_name: 'יונתן', msg_count: 500 },
      { id: 'live', wa_user_id: '972501234567', display_name: 'יונתן', msg_count: 12 },
    ]);
    expect(result && 'keep' in result && result.keep.id).toBe('live');
    expect(result && 'keep' in result && result.merge.map((m) => m.id)).toEqual(['export']);
  });

  it('flags two phone ids as ambiguous unless force', () => {
    const cluster = [
      { id: 'a', wa_user_id: '972501111111', display_name: 'Dan', msg_count: 10 },
      { id: 'b', wa_user_id: '972502222222', display_name: 'Dan', msg_count: 20 },
    ];
    expect(pickKeepProfile(cluster)).toEqual({ ambiguous: true, phones: cluster });
    const forced = pickKeepProfile(cluster, { force: true });
    expect(forced && 'keep' in forced && forced.keep.id).toBe('b');
  });
});
