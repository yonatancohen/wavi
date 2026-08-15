import { describe, expect, it } from 'bun:test';
import type { ParsedWAMessage } from '@wavi/shared';
import { parseWAExport } from '../parser.js';
import { collectObservedAliasesByPerson, resolveExportMessages } from '../resolve-export-messages.js';
import { isAgentExportSender } from '../agent-name.js';

function msg(sender: string, body: string): ParsedWAMessage {
  return {
    sender_name: sender,
    sender_wa_id: sender,
    body,
    timestamp: new Date('2024-08-23T12:08:54'),
    is_system_message: false,
    is_media_omitted: false,
  };
}

describe('export agent senders', () => {
  it('does not collect Wavi as a person from .txt exports', () => {
    const resolved = resolveExportMessages([msg('Dan', 'מי רעב?'), msg('Wavi', 'אני פה'), msg('wavi', 'עוד שורה')]);
    const aliases = collectObservedAliasesByPerson(resolved);
    expect(aliases.has('Wavi')).toBe(false);
    expect(aliases.has('wavi')).toBe(false);
    expect(aliases.has('Dan')).toBe(true);
  });

  it('marks parsed Wavi lines as agent senders', () => {
    const raw = ['[12/03/2024, 14:32:11] Dan: hey there', '[12/03/2024, 14:32:20] Wavi: whats up', '[12/03/2024, 14:32:30] Sara: coming'].join('\n');

    const parsed = parseWAExport(raw);
    const senders = parsed.map((m) => m.sender_name);
    expect(senders).toContain('Wavi');
    expect(parsed.filter((m) => isAgentExportSender(m.sender_name, m.sender_wa_id)).map((m) => m.sender_name)).toEqual(['Wavi']);
    expect(parsed.filter((m) => !isAgentExportSender(m.sender_name, m.sender_wa_id)).map((m) => m.sender_name)).toEqual(['Dan', 'Sara']);
  });
});
