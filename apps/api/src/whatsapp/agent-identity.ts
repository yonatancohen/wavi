import type { Client } from 'whatsapp-web.js'

let clientRef: Client | null = null
let phoneUser: string | null = null
let lidUser: string | null = null

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid
}

export function bindAgentIdentity(
  client: Client | null,
  identity: { phoneUser: string | null; lidUser?: string | null },
) {
  clientRef = client
  phoneUser = identity.phoneUser
  lidUser = identity.lidUser ?? null
}

export function clearAgentIdentity() {
  clientRef = null
  phoneUser = null
  lidUser = null
}

/** All known numeric ids for the linked agent (phone + LID). */
export function getAgentUserIds(): string[] {
  const ids = new Set<string>()
  if (phoneUser) ids.add(phoneUser)
  if (lidUser) ids.add(lidUser)

  const wid = clientRef?.info?.wid?._serialized
  if (wid) ids.add(waUserId(wid))

  return [...ids]
}

/** Linked account JID — used to detect native @ mentions in groups. */
export function getAgentWaJid(): string | null {
  const wid = clientRef?.info?.wid?._serialized
  if (wid) return wid
  if (phoneUser) return `${phoneUser}@c.us`
  if (lidUser) return `${lidUser}@lid`
  return null
}

/** True when the message tags the agent by name or native WA @ mention. */
export function isAgentTagged(
  msg: { mentionedIds?: string[] },
  body: string,
  agentName = process.env.WA_AGENT_NAME ?? 'wavi',
): boolean {
  if (body.toLowerCase().includes(`@${agentName.toLowerCase()}`)) return true

  const agentIds = getAgentUserIds()
  if (agentIds.length === 0) return false

  const isKnownAgent = (jidOrUser: string) => agentIds.includes(waUserId(jidOrUser))

  if (msg.mentionedIds?.some(isKnownAgent)) return true

  // Native mentions embed @phone or @lid in the body instead of the display name
  for (const id of agentIds) {
    if (body.includes(`@${id}`)) return true
  }

  return false
}

type LidPhoneClient = Client & {
  getContactLidAndPhone?: (ids: string[]) => Promise<Array<{ lid?: string; pn?: string }>>
}

/** Resolve phone + LID pair for the linked WhatsApp account. */
export async function resolveAgentIdentity(
  client: Client,
  widSerialized: string,
  widUser: string,
): Promise<{ phoneUser: string; lidUser: string | null }> {
  let resolvedPhone = widUser
  let resolvedLid: string | null = widSerialized.endsWith('@lid') ? widUser : null

  const lookup = (client as LidPhoneClient).getContactLidAndPhone
  if (lookup) {
    try {
      const [mapping] = await lookup.call(client, [widSerialized])
      if (mapping?.pn) resolvedPhone = waUserId(mapping.pn)
      if (mapping?.lid) resolvedLid = waUserId(mapping.lid)
    } catch (err) {
      console.warn('[WA] LID/phone lookup failed — native @ mentions may not match until reconnect', err)
    }
  }

  return { phoneUser: resolvedPhone, lidUser: resolvedLid }
}
