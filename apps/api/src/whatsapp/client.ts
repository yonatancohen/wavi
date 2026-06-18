import pkg from 'whatsapp-web.js'
const { Client, LocalAuth, MessageTypes } = pkg
import qrcode from 'qrcode'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { handleIncomingMessage } from './handlers.js'

// ── SSE subscribers waiting for QR ───────────────────────────
type SSEClient = { send: (data: string) => void; close: () => void }
const qrSubscribers = new Set<SSEClient>()

export function subscribeToQR(client: SSEClient) {
  qrSubscribers.add(client)

  // Already connected — no QR will be emitted; notify subscriber immediately
  waClient.getState()
    .then((state) => {
      if (state === 'CONNECTED') {
        client.send(JSON.stringify({ type: 'authenticated' }))
        client.close()
        qrSubscribers.delete(client)
      }
    })
    .catch(() => {})

  return () => qrSubscribers.delete(client)
}

function broadcastQR(data: string) {
  for (const sub of qrSubscribers) {
    sub.send(data)
  }
}

// ── WhatsApp Client ───────────────────────────────────────────
export const waClient = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.WA_SESSION_PATH ?? '.wwebjs_auth',
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
  // Restore session from Supabase if available
})

// ── Events ───────────────────────────────────────────────────

waClient.on('qr', async (qr) => {
  console.log('[WA] QR received — broadcasting to dashboard')
  try {
    const dataUrl = await qrcode.toDataURL(qr)
    broadcastQR(JSON.stringify({ type: 'qr', data: dataUrl }))
  } catch (err) {
    console.error('[WA] QR generation failed', err)
  }
})

waClient.on('authenticated', () => {
  console.log('[WA] Authenticated ✓')
  broadcastQR(JSON.stringify({ type: 'authenticated' }))
  // Close all QR subscribers — they don't need updates anymore
  for (const sub of qrSubscribers) sub.close()
  qrSubscribers.clear()
})

waClient.on('ready', async () => {
  console.log('[WA] Client ready ✓')

  // Persist session info to Supabase
  const info = waClient.info
  if (info) {
    await db
      .from('agents')
      .update({ phone_number: info.wid.user })
      .eq('id', process.env.AGENT_ID!)
      .throwOnError()
  }
})

waClient.on('disconnected', async (reason) => {
  console.warn('[WA] Disconnected:', reason)

  // Notify dashboard via Supabase realtime
  await db
    .from('agents')
    .update({ phone_number: null })
    .eq('id', process.env.AGENT_ID!)

  // Attempt reconnect with backoff
  scheduleReconnect()
})

waClient.on('message', async (msg) => {
  // Ignore status broadcasts and non-text for now
  if (msg.isStatus) return
  if (msg.type !== MessageTypes.TEXT) return

  try {
    await handleIncomingMessage(msg)
  } catch (err) {
    console.error('[WA] Message handler error', err)
  }
})

// ── Reconnect Logic ───────────────────────────────────────────
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[WA] Max reconnect attempts reached — giving up')
    return
  }

  const delay = Math.min(1000 * 2 ** reconnectAttempts, 60_000) // max 60s
  reconnectAttempts++
  console.log(`[WA] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`)

  setTimeout(async () => {
    try {
      await waClient.initialize()
      reconnectAttempts = 0
    } catch (err) {
      console.error('[WA] Reconnect failed', err)
      scheduleReconnect()
    }
  }, delay)
}

// ── Send helpers ──────────────────────────────────────────────

export async function sendReply(
  waGroupId: string,
  replyBody: string,
  quotedMsgId?: string,
) {
  const chat = await waClient.getChatById(waGroupId)

  if (quotedMsgId) {
    const quoted = await waClient.getMessageById(quotedMsgId)
    await chat.sendMessage(replyBody, { quotedMessageId: quoted.id._serialized })
  } else {
    await chat.sendMessage(replyBody)
  }
}
