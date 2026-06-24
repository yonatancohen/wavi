import { describe, expect, it } from 'bun:test';
import { isGroupReplyEnabled } from '@wavi/shared';

describe('isGroupReplyEnabled', () => {
  it('allows replies only when the group is live', () => {
    expect(isGroupReplyEnabled('active')).toBe(true);
    expect(isGroupReplyEnabled('pending_setup')).toBe(false);
    expect(isGroupReplyEnabled('paused')).toBe(false);
  });
});
