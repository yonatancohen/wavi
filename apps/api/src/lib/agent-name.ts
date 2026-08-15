import { normalizeNameForMatch } from './identity.js';

/** Display name used for the agent in WhatsApp and chat exports. */
export function getAgentName(agentName = process.env.WA_AGENT_NAME ?? 'wavi'): string {
  const trimmed = agentName.trim();
  return trimmed || 'wavi';
}

/**
 * True when an export/live sender is the agent itself (e.g. "Wavi:" in a .txt upload).
 * Those lines are conversation history, not a group member to profile.
 */
export function isAgentExportSender(senderName?: string | null, senderWaId?: string | null, agentName = getAgentName()): boolean {
  if (senderWaId === 'agent') return true;

  const target = normalizeNameForMatch(agentName);
  if (!target) return false;

  if (senderName && normalizeNameForMatch(senderName) === target) return true;
  if (senderWaId && normalizeNameForMatch(senderWaId) === target) return true;
  return false;
}
