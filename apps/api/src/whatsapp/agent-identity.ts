import { isAgentExportSender } from '../lib/agent-name.js';
import type { QuotedMessage } from './provider.js';

let widStr: string | null = null;
let phoneUser: string | null = null;
let lidUser: string | null = null;

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

export function bindAgentIdentity(identity: { phoneUser: string | null; lidUser?: string | null; wid?: string | null }) {
  phoneUser = identity.phoneUser;
  lidUser = identity.lidUser ?? lidUser ?? null;
  widStr = identity.wid ?? null;
}

function identityRedisKey() {
  return `agent_identity:${process.env.AGENT_ID ?? 'default'}`;
}

export async function loadStoredAgentIdentity(): Promise<{ phoneUser: string | null; lidUser: string | null; wid: string | null } | null> {
  try {
    const { redis } = await import('../lib/redis.js');
    const raw = await redis.get(identityRedisKey());
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return null;
    const rec = obj as { phoneUser?: unknown; lidUser?: unknown; wid?: unknown };
    return {
      phoneUser: typeof rec.phoneUser === 'string' ? rec.phoneUser : null,
      lidUser: typeof rec.lidUser === 'string' ? rec.lidUser : null,
      wid: typeof rec.wid === 'string' ? rec.wid : null,
    };
  } catch {
    return null;
  }
}

export async function persistBoundAgentIdentity() {
  try {
    const { redis } = await import('../lib/redis.js');
    await redis.set(identityRedisKey(), JSON.stringify({ phoneUser, lidUser, wid: widStr }));
  } catch (err) {
    console.warn('[WA] Failed to persist agent identity', err);
  }
}

export function clearAgentIdentity() {
  widStr = null;
  phoneUser = null;
  lidUser = null;
}

/** All known numeric ids for the linked agent (phone + LID). */
export function getAgentUserIds(): string[] {
  const ids = new Set<string>();
  if (phoneUser) ids.add(phoneUser);
  if (lidUser) ids.add(lidUser);
  if (widStr) ids.add(waUserId(widStr));
  return [...ids];
}

/** Linked account JID — used to detect native @ mentions in groups. */
export function getAgentWaJid(): string | null {
  if (widStr) return widStr;
  if (phoneUser) return `${phoneUser}@c.us`;
  if (lidUser) return `${lidUser}@lid`;
  return null;
}

function isAgentSender(senderWaId: string, senderName?: string, agentName = process.env.WA_AGENT_NAME ?? 'wavi'): boolean {
  if (isAgentExportSender(senderName, senderWaId, agentName)) return true;
  const agentIds = getAgentUserIds();
  if (agentIds.length > 0 && agentIds.includes(waUserId(senderWaId))) return true;
  return false;
}

/** True when the user quote-replied to a message Wavi sent. */
export function isQuotedAgent(quoted?: QuotedMessage): boolean {
  if (!quoted) return false;
  if (quoted.fromMe) return true;
  return isAgentSender(quoted.senderWaId, quoted.senderName);
}

/** True when the message tags the agent by name, native WA @ mention, or quote-reply to Wavi. */
export function isAgentTagged(msg: { mentionedIds?: string[]; quotedMessage?: QuotedMessage }, body: string, agentName = process.env.WA_AGENT_NAME ?? 'wavi'): boolean {
  if (isQuotedAgent(msg.quotedMessage)) return true;

  if (body.toLowerCase().includes(`@${agentName.toLowerCase()}`)) return true;

  const agentIds = getAgentUserIds();
  if (agentIds.length === 0) return false;

  const isKnownAgent = (jidOrUser: string) => agentIds.includes(waUserId(jidOrUser));

  if (msg.mentionedIds?.some(isKnownAgent)) return true;

  for (const id of agentIds) {
    if (body.includes(`@${id}`)) return true;
  }

  return false;
}
