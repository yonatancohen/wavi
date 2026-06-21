import qrcode from 'qrcode'
import { db } from '../../db/client.js'
import { handleIncomingMessage } from '../handlers.js'
import { bindAgentIdentity, clearAgentIdentity } from '../agent-identity.js'
import type { WhatsAppProvider, SSEClient, GroupSummary, InboundMessage } from '../provider.js'

// Baileys uses @hapi/boom to encode disconnect reasons in lastDisconnect.error.
// We read the status code to decide whether to reconnect.
import { Boom } from '@hapi/boom'

const BAILEYS_AUTH_PATH =
  process.env.WA_BAILEYS_AUTH_PATH ?? './.baileys_auth'

/** Tiny LRU for recent message protos — supports quoting recent messages. */
function makeLru<K, V>(maxSize: number) {
  const map = new Map<K, V>()
  return {
    set(key: K, value: V) {
      if (map.size >= maxSize) {
        const oldest = map.keys().next().value
        if (oldest !== undefined) map.delete(oldest)
      }
      map.set(key, value)
    },
    get(key: K): V | undefined {
      return map.get(key)
    },
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitteredDelay(baseMs: number, maxJitterMs: number) {
  return sleep(baseMs + Math.floor(Math.random() * maxJitterMs))
}

export function createBaileysProvider(): WhatsAppProvider {
  // Lazily imported — only loaded when this provider is actually used.
  type BaileysModule = typeof import('@whiskeysockets/baileys')
  let baileys: BaileysModule | null = null

  async function getBaileys(): Promise<BaileysModule> {
    if (!baileys) {
      baileys = await import('@whiskeysockets/baileys')
    }
    return baileys
  }

  // ── State ─────────────────────────────────────────────────
  let sock: Awaited<ReturnType<BaileysModule['makeWASocket']>> | null = null
  let _connected = false
  let _connecting = false
  let _phoneNumber: string | null = null
  let _wid: string | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10

  // ── SSE subscribers ───────────────────────────────────────
  const qrSubscribers = new Set<SSEClient>()
  let _lastQrPayload: string | null = null

  function broadcastSSE(data: string) {
    for (const sub of qrSubscribers) {
      sub.send(data)
    }
  }

  // Recent message protos for quoting (cap at 200 messages)
  const recentProtos = makeLru<string, unknown>(200)

  // ── Connect ───────────────────────────────────────────────
  async function connect() {
    const {
      makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
    } = await getBaileys()

    const pino = (await import('pino')).default
    const logger = pino({ level: 'silent' })

    const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_PATH)
    const { version } = await fetchLatestBaileysVersion()

    _connecting = true
    _connected = false

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      // Don't download media — we only handle text
      getMessage: async () => undefined,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        try {
          const dataUrl = await qrcode.toDataURL(qr)
          _lastQrPayload = JSON.stringify({ type: 'qr', data: dataUrl })
          broadcastSSE(_lastQrPayload)
        } catch (err) {
          console.error('[Baileys] QR generation failed', err)
        }
      }

      if (connection === 'connecting') {
        _connecting = true
        broadcastSSE(JSON.stringify({ type: 'authenticated' }))
      }

      if (connection === 'open') {
        _connecting = false
        _connected = true
        _lastQrPayload = null
        reconnectAttempts = 0

        const userId = sock?.user?.id ?? null
        _wid = userId
        if (userId) {
          // Baileys JID for the linked account is already in @s.whatsapp.net form
          const phoneUser = userId.split('@')[0]?.split(':')[0] ?? null
          _phoneNumber = phoneUser
          bindAgentIdentity({ phoneUser, wid: userId })
          console.log(`[Baileys] Connected — phone: ${phoneUser}`)
        }

        const readyMsg = JSON.stringify({ type: 'ready', phone_number: _phoneNumber })
        for (const sub of qrSubscribers) {
          sub.send(readyMsg)
          sub.close()
        }
        qrSubscribers.clear()

        await db
          .from('agents')
          .update({ phone_number: _phoneNumber })
          .eq('id', process.env.AGENT_ID!)
          .throwOnError()
      }

      if (connection === 'close') {
        _connecting = false
        _connected = false
        _phoneNumber = null
        _wid = null
        _lastQrPayload = null
        clearAgentIdentity()

        await db
          .from('agents')
          .update({ phone_number: null })
          .eq('id', process.env.AGENT_ID!)

        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        console.warn(`[Baileys] Disconnected (status ${statusCode ?? 'unknown'}) — reconnect: ${shouldReconnect}`)

        if (shouldReconnect) {
          scheduleReconnect()
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Only handle incoming messages (not our own sends or history sync)
      if (type !== 'notify') return

      for (const msg of messages) {
        // Skip non-group, own messages, and non-text
        if (!msg.key.remoteJid?.endsWith('@g.us')) continue
        if (msg.key.fromMe) continue

        const body =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          null

        if (!body) continue

        // Store proto for potential quoting later
        recentProtos.set(msg.key.id ?? '', msg)

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
        const mentionedIds = contextInfo?.mentionedJid ?? []

        const inbound: InboundMessage = {
          waGroupId: msg.key.remoteJid,
          isGroup: true,
          chatName: msg.key.remoteJid,
          // In groups, participant holds the sender's JID
          senderWaId: msg.key.participant ?? '',
          body,
          timestampMs: Number(msg.messageTimestamp ?? 0) * 1000,
          waMsgId: msg.key.id ?? '',
          mentionedIds,
          // pushName is sent inline with the message by Baileys — no extra call needed
          resolvePushName: async () => msg.pushName ?? (msg.key.participant ?? ''),
        }

        try {
          await handleIncomingMessage(inbound)
        } catch (err) {
          console.error('[Baileys] Message handler error', err)
        }
      }
    })
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[Baileys] Max reconnect attempts reached — giving up')
      return
    }

    const delay = Math.min(1000 * 2 ** reconnectAttempts, 60_000)
    reconnectAttempts++
    console.log(`[Baileys] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`)

    setTimeout(() => {
      connect().catch((err) => {
        console.error('[Baileys] Reconnect failed', err)
        scheduleReconnect()
      })
    }, delay)
  }

  // ── WhatsAppProvider implementation ──────────────────────
  return {
    async start() {
      console.log('[Baileys] Initializing socket...')
      await connect()
    },

    async stop() {
      _connected = false
      _connecting = false
      sock?.end(new Error('stop'))
      sock = null
      console.log('[Baileys] Socket closed')
    },

    async restart() {
      console.log('[Baileys] Restarting socket...')
      sock?.end(new Error('restart'))
      sock = null
      _connected = false
      _connecting = false
      _phoneNumber = null
      _wid = null
      _lastQrPayload = null
      clearAgentIdentity()
      reconnectAttempts = 0
      await connect()
    },

    subscribeToQR(client: SSEClient) {
      if (_connected) {
        client.send(JSON.stringify({ type: 'ready', phone_number: _phoneNumber }))
        client.close()
        return () => {}
      }

      if (_connecting) {
        client.send(JSON.stringify({ type: 'authenticated' }))
      } else if (_lastQrPayload) {
        client.send(_lastQrPayload)
      }

      qrSubscribers.add(client)
      return () => qrSubscribers.delete(client)
    },

    getConnectionState() {
      return {
        connected: _connected,
        connecting: _connecting,
        phone_number: _phoneNumber,
      }
    },

    getHealthState() {
      // Baileys has no CDP layer — return a minimal healthy snapshot
      return {
        consecutive_cdp_failures: 0,
        last_forced_restart_at: null,
        restart_in_progress: false,
        cdp_op_in_flight: false,
        cdp_op_stuck_ms: 0,
      }
    },

    getIdentitySnapshot() {
      return { wid: _wid, phone: _phoneNumber }
    },

    async listGroupChats(): Promise<GroupSummary[]> {
      if (!sock || !_connected) {
        throw new Error('WhatsApp is not connected. Link your account first.')
      }

      const groups = await sock.groupFetchAllParticipating()
      return Object.values(groups).map((g) => ({
        wa_group_id: g.id,
        name: g.subject ?? 'Unnamed group',
        participant_count: g.participants?.length ?? null,
        last_activity: null,
      }))
    },

    async sendReply(waGroupId: string, body: string, quotedMsgId?: string) {
      if (!sock || !_connected) {
        throw new Error('WhatsApp is not connected')
      }

      const jid = waGroupId

      await sock.sendPresenceUpdate('composing', jid)

      // Simulate human typing delay
      const typingMs = Math.min(Math.max(body.length * 25, 1500), 5000)
      await jitteredDelay(typingMs, 800)

      await sock.sendPresenceUpdate('paused', jid)

      if (quotedMsgId) {
        const proto = recentProtos.get(quotedMsgId)
        if (proto) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await sock.sendMessage(jid, { text: body }, { quoted: proto as any })
          return
        }
      }

      await sock.sendMessage(jid, { text: body })
    },
  }
}
