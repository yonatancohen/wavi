import type { SSEClient } from './provider.js'
import { createWwebjsProvider } from './providers/wwebjs.js'
import { createBaileysProvider } from './providers/baileys.js'

const provider =
  process.env.WA_PROVIDER === 'baileys' ? createBaileysProvider() : createWwebjsProvider()

export const startWhatsAppClient = () => provider.start()
export const stopWhatsAppClient = () => provider.stop()
export const restartWhatsAppClient = () => provider.restart()
export const subscribeToQR = (c: SSEClient) => provider.subscribeToQR(c)
export const getWaConnectionState = () => provider.getConnectionState()
export const getWaHealthState = () => provider.getHealthState()
export const getWaIdentitySnapshot = () => provider.getIdentitySnapshot()
export const listGroupChats = () => provider.listGroupChats()
export const sendReply = (id: string, body: string, q?: string) => provider.sendReply(id, body, q)
