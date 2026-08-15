import { describe, expect, it } from 'bun:test';
import { getAgentName, isAgentExportSender } from '../agent-name.js';

describe('isAgentExportSender', () => {
  it('matches the default agent name case-insensitively', () => {
    expect(isAgentExportSender('Wavi', undefined, 'wavi')).toBe(true);
    expect(isAgentExportSender('wavi', undefined, 'wavi')).toBe(true);
    expect(isAgentExportSender('WAVI', 'WAVI', 'wavi')).toBe(true);
  });

  it('matches the configured WA_AGENT_NAME', () => {
    expect(isAgentExportSender('Botty', undefined, 'Botty')).toBe(true);
    expect(isAgentExportSender('botty', 'botty', 'Botty')).toBe(true);
  });

  it('matches the reserved agent wa id', () => {
    expect(isAgentExportSender('Someone', 'agent', 'wavi')).toBe(true);
  });

  it('does not treat real members as the agent', () => {
    expect(isAgentExportSender('Dan', undefined, 'wavi')).toBe(false);
    expect(isAgentExportSender('Wavi Cohen', undefined, 'wavi')).toBe(false);
    expect(isAgentExportSender('You', undefined, 'wavi')).toBe(false);
  });
});

describe('getAgentName', () => {
  it('falls back to wavi when empty', () => {
    expect(getAgentName('')).toBe('wavi');
    expect(getAgentName('  Wavi  ')).toBe('Wavi');
  });
});
