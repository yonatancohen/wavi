import { describe, expect, it } from 'bun:test';
import { alignExportIdentities } from '../export-alignment.js';
import type { ParsedWAMessage } from '@wavi/shared';

function msg(sender: string, body: string, ts: Date): ParsedWAMessage {
  return {
    sender_name: sender,
    body,
    timestamp: ts,
    is_system_message: false,
    is_media_omitted: false,
  };
}

describe('alignExportIdentities', () => {
  it('links different sender labels for the same message content', () => {
    const ts = new Date('2024-08-23T12:08:54');
    const primary = [msg('Alon Arroyo', 'hey everyone', ts), msg('Chen Arroyo', 'מה קורה', ts)];
    const secondary = [msg('אלון', 'hey everyone', ts), msg('Chen', 'מה קורה', ts)];

    const result = alignExportIdentities(primary, secondary);

    expect(result.matched_message_count).toBeGreaterThanOrEqual(1);
    expect(result.label_to_canonical_id.get('אלון')).toBe('Alon Arroyo');
    expect(result.links.some((l) => l.secondary_label === 'אלון' && l.primary_label === 'Alon Arroyo')).toBe(true);
  });

  it('returns empty when no overlapping messages', () => {
    const ts1 = new Date('2024-01-01T10:00:00');
    const ts2 = new Date('2024-06-01T10:00:00');
    const primary = [msg('Alice', 'hello', ts1)];
    const secondary = [msg('Bob', 'different', ts2)];

    const result = alignExportIdentities(primary, secondary);
    expect(result.matched_message_count).toBe(0);
    expect(result.links.length).toBe(0);
  });
});
