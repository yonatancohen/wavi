import { describe, expect, it } from 'bun:test';
import { emptySyncLastRun, laterIso, mergeSyncLastRun, parseRecordedSyncRuns } from '../sync-last-run.js';

describe('sync last-run helpers', () => {
  it('parses recorded timestamps and ignores junk', () => {
    expect(parseRecordedSyncRuns(null)).toEqual({});
    expect(parseRecordedSyncRuns('not-json')).toEqual({});
    expect(
      parseRecordedSyncRuns({
        profiles: '2026-08-15T10:00:00.000Z',
        dynamics: 'nope',
        extra: '2026-08-15T10:00:00.000Z',
      }),
    ).toEqual({ profiles: '2026-08-15T10:00:00.000Z' });
    expect(parseRecordedSyncRuns('{"context":"2026-08-15T09:00:00.000Z"}')).toEqual({
      context: '2026-08-15T09:00:00.000Z',
    });
  });

  it('picks the later ISO timestamp', () => {
    expect(laterIso(null, null)).toBeNull();
    expect(laterIso('2026-08-15T10:00:00.000Z', null)).toBe('2026-08-15T10:00:00.000Z');
    expect(laterIso(null, '2026-08-15T10:00:00.000Z')).toBe('2026-08-15T10:00:00.000Z');
    expect(laterIso('2026-08-15T09:00:00.000Z', '2026-08-15T11:00:00.000Z')).toBe('2026-08-15T11:00:00.000Z');
  });

  it('merges recorded and inferred times per op', () => {
    const merged = mergeSyncLastRun({ profiles: '2026-08-15T12:00:00.000Z', sharpen: '2026-08-15T08:00:00.000Z' }, { profiles: '2026-08-15T10:00:00.000Z', dynamics: '2026-08-15T11:00:00.000Z' });
    expect(merged).toEqual({
      ...emptySyncLastRun(),
      profiles: '2026-08-15T12:00:00.000Z',
      sharpen: '2026-08-15T08:00:00.000Z',
      dynamics: '2026-08-15T11:00:00.000Z',
    });
  });
});
