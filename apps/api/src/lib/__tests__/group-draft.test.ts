import { describe, expect, it } from 'bun:test';
import { createDraftWaGroupId, DRAFT_GROUP_PREFIX, isDraftGroup } from '@wavi/shared';

describe('draft group helpers', () => {
  it('detects draft placeholder wa_group_id values', () => {
    expect(isDraftGroup(`${DRAFT_GROUP_PREFIX}abc-123`)).toBe(true);
    expect(isDraftGroup('120363123456789012@g.us')).toBe(false);
  });

  it('creates unique draft ids with the draft prefix', () => {
    const a = createDraftWaGroupId();
    const b = createDraftWaGroupId();
    expect(a).toStartWith(DRAFT_GROUP_PREFIX);
    expect(b).toStartWith(DRAFT_GROUP_PREFIX);
    expect(a).not.toBe(b);
  });
});
