let widStr: string | null = null;
let phoneUser: string | null = null;
let lidUser: string | null = null;

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

export function bindAgentIdentity(identity: { phoneUser: string | null; lidUser?: string | null; wid?: string | null }) {
  phoneUser = identity.phoneUser;
  lidUser = identity.lidUser ?? null;
  widStr = identity.wid ?? null;
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

/** True when the message tags the agent by name or native WA @ mention. */
export function isAgentTagged(msg: { mentionedIds?: string[] }, body: string, agentName = process.env.WA_AGENT_NAME ?? 'wavi'): boolean {
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
