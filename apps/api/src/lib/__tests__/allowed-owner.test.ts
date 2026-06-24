import { describe, expect, it, afterEach } from 'bun:test';
import { getAllowedOwnerEmail, isOwnerEmail } from '../allowed-owner.js';

describe('isOwnerEmail', () => {
  const original = process.env.ALLOWED_OWNER_EMAIL;

  afterEach(() => {
    if (original === undefined) delete process.env.ALLOWED_OWNER_EMAIL;
    else process.env.ALLOWED_OWNER_EMAIL = original;
  });

  it('allows any email when ALLOWED_OWNER_EMAIL is unset', () => {
    delete process.env.ALLOWED_OWNER_EMAIL;
    expect(isOwnerEmail('anyone@example.com')).toBe(true);
  });

  it('matches owner email case-insensitively', () => {
    process.env.ALLOWED_OWNER_EMAIL = 'Owner@Example.com';
    expect(isOwnerEmail('owner@example.com')).toBe(true);
    expect(isOwnerEmail('other@example.com')).toBe(false);
  });

  it('reads env via getAllowedOwnerEmail', () => {
    process.env.ALLOWED_OWNER_EMAIL = '  me@test.com  ';
    expect(getAllowedOwnerEmail()).toBe('me@test.com');
  });
});
