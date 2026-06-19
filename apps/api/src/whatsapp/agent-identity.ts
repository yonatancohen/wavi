import type { Client } from 'whatsapp-web.js'

let clientRef: Client | null = null
let phoneNumber: string | null = null

export function bindAgentIdentity(client: Client, phone: string | null) {
  clientRef = client
  phoneNumber = phone
}

export function clearAgentIdentity() {
  clientRef = null
  phoneNumber = null
}

/** Linked account JID — used to detect native @ mentions in groups. */
export function getAgentWaJid(): string | null {
  const wid = clientRef?.info?.wid?._serialized
  if (wid) return wid
  if (phoneNumber) return `${phoneNumber}@c.us`
  return null
}
