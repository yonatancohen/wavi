import qrcode from 'qrcode';
import { rm } from 'node:fs/promises';
import { db } from '../../db/client.js';
import { handleIncomingMessage } from '../handlers.js';
import { bindAgentIdentity, clearAgentIdentity } from '../agent-identity.js';
import type { WhatsAppProvider, SSEClient, GroupSummary, InboundMessage, QuotedMessage, ReplyMedia } from '../provider.js';

// Baileys uses @hapi/boom to encode disconnect reasons in lastDisconnect.error.
// We read the status code to decide whether to reconnect.
import { Boom } from '@hapi/boom';

function resolveBaileysQuoted(contextInfo: unknown): QuotedMessage | undefined {
  const ctx = contextInfo as {
    quotedMessage?: { conversation?: string; extendedTextMessage?: { text?: string } } | null;
    participant?: string;
  } | null;
  if (!ctx?.quotedMessage) return undefined;
  const body = ctx.quotedMessage.conversation ?? ctx.quotedMessage.extendedTextMessage?.text ?? '';
  if (!body) return undefined;
  const senderWaId = ctx.participant ?? '';
  return {
    body,
    senderWaId,
    senderName: senderWaId,
  };
}

// Bun compatibility: in Bun's ws shim, registering 'upgrade' or
// 'unexpected-response' listeners on a ws.WebSocket silently breaks delivery
// of ALL subsequent events (message, close, etc.) for that socket. Baileys
// always registers both, so the WA noise-protocol frames never arrive and the
// connection hangs forever. Patching the prototype to skip those two
// registrations keeps Bun's event routing intact for the events that matter.
// Must happen at module-evaluation time, BEFORE Baileys is dynamically
// imported, so that Baileys's own WebSocket reference shares the fixed proto.
import WS from 'ws';

if (process.versions.bun) {
  // The 'ws' types model the prototype as readonly, so reach it through an
  // untyped view to monkey-patch `.on` without scattered @ts-expect-error
  // directives (which break when the cast is line-wrapped by the formatter).
  const proto = (WS as unknown as { WebSocket: { prototype: Record<string, unknown> } }).WebSocket.prototype;
  const origOn = proto.on as (this: unknown, event: string, listener: (...a: unknown[]) => void) => unknown;
  proto.on = function (this: unknown, event: string, listener: (...a: unknown[]) => void) {
    if (event === 'upgrade' || event === 'unexpected-response') return this;
    return origOn.call(this, event, listener);
  };
}

const BAILEYS_AUTH_PATH = process.env.WA_BAILEYS_AUTH_PATH ?? './.baileys_auth';

/** Tiny LRU for recent message protos — supports quoting recent messages. */
function makeLru<K, V>(maxSize: number) {
  const map = new Map<K, V>();
  return {
    set(key: K, value: V) {
      if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, value);
    },
    get(key: K): V | undefined {
      return map.get(key);
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(baseMs: number, maxJitterMs: number) {
  return sleep(baseMs + Math.floor(Math.random() * maxJitterMs));
}

export function createBaileysProvider(): WhatsAppProvider {
  // Lazily imported — only loaded when this provider is actually used.
  type BaileysModule = typeof import('@whiskeysockets/baileys');
  let baileys: BaileysModule | null = null;

  async function getBaileys(): Promise<BaileysModule> {
    if (!baileys) {
      baileys = await import('@whiskeysockets/baileys');
    }
    return baileys;
  }

  // ── State ─────────────────────────────────────────────────
  let sock: Awaited<ReturnType<BaileysModule['makeWASocket']>> | null = null;
  let _connected = false;
  let _connecting = false;
  let _phoneNumber: string | null = null;
  let _wid: string | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  // ── SSE subscribers ───────────────────────────────────────
  const qrSubscribers = new Set<SSEClient>();
  let _lastQrPayload: string | null = null;

  function broadcastSSE(data: string) {
    for (const sub of qrSubscribers) {
      sub.send(data);
    }
  }

  // Recent message protos for quoting (cap at 200 messages)
  const recentProtos = makeLru<string, unknown>(200);

  // ── Connect ───────────────────────────────────────────────
  async function connect() {
    // Mark as connecting immediately so the status API never returns a false
    // "disconnected" state during the async setup phase (auth load + version
    // fetch). Without this, the dashboard shows "offline" for the first few
    // seconds after server startup.
    _connecting = true;
    _connected = false;

    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = await getBaileys();

    const pino = (await import('pino')).default;
    const logger = pino({ level: 'silent' });

    const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_PATH);
    const { version } = await fetchLatestBaileysVersion();

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
    });

    sock.ev.on('creds.update', (update) => {
      saveCreds();
      // The LID (@lid JID) may arrive in creds.update after connection.open.
      // Update agent identity so isAgentTagged() can match @lid mentions.
      const rawLid = (update as { me?: { lid?: string } }).me?.lid ?? null;
      if (rawLid && _connected) {
        const lidUser = rawLid.split('@')[0]?.split(':')[0] ?? null;
        if (lidUser) {
          bindAgentIdentity({ phoneUser: _phoneNumber, wid: _wid, lidUser });
          console.log(`[Baileys] LID updated — ${lidUser}`);
        }
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const dataUrl = await qrcode.toDataURL(qr);
          _lastQrPayload = JSON.stringify({ type: 'qr', data: dataUrl });
          broadcastSSE(_lastQrPayload);
        } catch (err) {
          console.error('[Baileys] QR generation failed', err);
        }
      }

      if (connection === 'connecting') {
        _connecting = true;
        // Do NOT send 'authenticated' here — that fires before the QR is even
        // generated and causes the dashboard to replace the QR with a spinner,
        // making it impossible for the user to scan.
      }

      if (connection === 'open') {
        _connecting = false;
        _connected = true;
        _lastQrPayload = null;
        reconnectAttempts = 0;

        const userId = sock?.user?.id ?? null;
        _wid = userId;
        if (userId) {
          // Baileys JID for the linked account is already in @s.whatsapp.net form
          const phoneUser = userId.split('@')[0]?.split(':')[0] ?? null;
          _phoneNumber = phoneUser;
          // WhatsApp uses @lid JIDs for @-mentions in groups. Extract the LID
          // so isAgentTagged() can match it (sock.user.lid may arrive slightly
          // later via creds.update, but grab it now if already present).
          const rawLid = (sock?.user as { lid?: string } | undefined)?.lid ?? null;
          const lidUser = rawLid ? (rawLid.split('@')[0]?.split(':')[0] ?? null) : null;
          bindAgentIdentity({ phoneUser, wid: userId, lidUser });
          console.log(`[Baileys] Connected — phone: ${phoneUser} | wid: ${userId} | lid: ${lidUser ?? 'pending'}`);
        }

        // 1. Tell the dashboard QR was scanned and we are finalising
        broadcastSSE(JSON.stringify({ type: 'authenticated' }));
        // 2. Tell the dashboard we are fully connected
        broadcastSSE(JSON.stringify({ type: 'ready', phone_number: _phoneNumber }));
        // Close all remaining QR subscribers — they got the events above
        for (const sub of qrSubscribers) sub.close();
        qrSubscribers.clear();

        try {
          await db.from('agents').update({ phone_number: _phoneNumber }).eq('id', process.env.AGENT_ID!).throwOnError();
        } catch (err) {
          console.error('[Baileys] Failed to persist phone_number to DB:', err);
        }
      }

      if (connection === 'close') {
        _connecting = false;
        _connected = false;
        _phoneNumber = null;
        _wid = null;
        _lastQrPayload = null;
        clearAgentIdentity();

        await db.from('agents').update({ phone_number: null }).eq('id', process.env.AGENT_ID!);

        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        // 440 = connectionReplaced: another session (browser/device) took over.
        // Reconnecting with the same credentials would just get kicked again.
        // Wipe auth and start fresh so we get a clean new QR.
        const isReplaced = statusCode === 440;

        console.warn(`[Baileys] Disconnected (status ${statusCode ?? 'unknown'}) — loggedOut: ${isLoggedOut} | replaced: ${isReplaced}`);

        if (isLoggedOut || isReplaced) {
          await clearBaileysAuth();
        }
        scheduleReconnect();
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Only handle incoming messages (not our own sends or history sync)
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Skip non-group, own messages, and non-text
        if (!msg.key.remoteJid?.endsWith('@g.us')) continue;
        if (msg.key.fromMe) continue;

        const body = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;

        if (!body) continue;

        // Store proto for potential quoting later
        recentProtos.set(msg.key.id ?? '', msg);

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const mentionedIds = contextInfo?.mentionedJid ?? [];

        const inbound: InboundMessage = {
          waGroupId: msg.key.remoteJid,
          isGroup: true,
          chatName: msg.key.remoteJid,
          senderWaId: msg.key.participant ?? '',
          body,
          timestampMs: Number(msg.messageTimestamp ?? 0) * 1000,
          waMsgId: msg.key.id ?? '',
          mentionedIds,
          quotedMessage: resolveBaileysQuoted(contextInfo),
          resolvePushName: async () => msg.pushName ?? msg.key.participant ?? '',
        };

        console.log(`[Baileys] Inbound group msg — group: ${inbound.waGroupId} | sender: ${inbound.senderWaId} | mentions: [${mentionedIds.join(',')}] | body: ${body.slice(0, 60)}`);

        try {
          await handleIncomingMessage(inbound);
        } catch (err) {
          console.error('[Baileys] Message handler error', err);
        }
      }
    });
  }

  async function clearBaileysAuth() {
    try {
      await rm(BAILEYS_AUTH_PATH, { recursive: true, force: true });
      console.log('[Baileys] Cleared auth state — next connect will show a fresh QR');
    } catch (err) {
      console.error('[Baileys] Failed to clear auth state:', err);
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[Baileys] Max reconnect attempts reached — clearing auth and restarting fresh');
      reconnectAttempts = 0;
      clearBaileysAuth()
        .then(() => connect())
        .catch((err) => {
          console.error('[Baileys] Fresh restart failed:', err);
        });
      return;
    }

    const delay = Math.min(1000 * 2 ** reconnectAttempts, 60_000);
    reconnectAttempts++;
    console.log(`[Baileys] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`);

    setTimeout(() => {
      connect().catch((err) => {
        console.error('[Baileys] Reconnect failed', err);
        scheduleReconnect();
      });
    }, delay);
  }

  // ── WhatsAppProvider implementation ──────────────────────
  return {
    async start() {
      console.log('[Baileys] Initializing socket...');
      await connect();
    },

    async stop() {
      _connected = false;
      _connecting = false;
      sock?.end(new Error('stop'));
      sock = null;
      console.log('[Baileys] Socket closed');
    },

    async restart() {
      console.log('[Baileys] Restarting socket...');
      sock?.end(new Error('restart'));
      sock = null;
      _connected = false;
      _connecting = false;
      _phoneNumber = null;
      _wid = null;
      _lastQrPayload = null;
      clearAgentIdentity();
      reconnectAttempts = 0;
      await connect();
    },

    subscribeToQR(client: SSEClient) {
      if (_connected) {
        client.send(JSON.stringify({ type: 'ready', phone_number: _phoneNumber }));
        client.close();
        return () => {};
      }

      // Replay the last QR if we have one — do NOT send 'authenticated' for
      // the pre-QR connecting phase (it would hide the QR behind a spinner).
      if (_lastQrPayload) {
        client.send(_lastQrPayload);
      }

      qrSubscribers.add(client);
      return () => qrSubscribers.delete(client);
    },

    getConnectionState() {
      return {
        connected: _connected,
        connecting: _connecting,
        phone_number: _phoneNumber,
      };
    },

    getHealthState() {
      // Baileys has no CDP layer — return a minimal healthy snapshot
      return {
        consecutive_cdp_failures: 0,
        last_forced_restart_at: null,
        restart_in_progress: false,
        cdp_op_in_flight: false,
        cdp_op_stuck_ms: 0,
      };
    },

    getIdentitySnapshot() {
      return { wid: _wid, phone: _phoneNumber };
    },

    async listGroupChats(): Promise<GroupSummary[]> {
      if (!sock || !_connected) {
        throw new Error('WhatsApp is not connected. Link your account first.');
      }

      const groups = await sock.groupFetchAllParticipating();
      return Object.values(groups).map((g) => ({
        wa_group_id: g.id,
        name: g.subject ?? 'Unnamed group',
        participant_count: g.participants?.length ?? null,
        last_activity: null,
      }));
    },

    async sendReply(waGroupId: string, body: string, quotedMsgId?: string, media?: ReplyMedia) {
      if (!sock || !_connected) {
        throw new Error('WhatsApp is not connected');
      }

      const jid = waGroupId;

      await sock.sendPresenceUpdate('composing', jid);

      const typingLen = media ? (media.caption?.length ?? 0) : body.length;
      const typingMs = Math.min(Math.max(typingLen * 25, 1500), 5000);
      await jitteredDelay(typingMs, 800);

      await sock.sendPresenceUpdate('paused', jid);

      if (media) {
        const payload = { image: media.data, caption: media.caption };
        if (quotedMsgId) {
          const proto = recentProtos.get(quotedMsgId);
          if (proto) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await sock.sendMessage(jid, payload, { quoted: proto as any });
            return;
          }
        }
        await sock.sendMessage(jid, payload);
        return;
      }

      if (quotedMsgId) {
        const proto = recentProtos.get(quotedMsgId);
        if (proto) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await sock.sendMessage(jid, { text: body }, { quoted: proto as any });
          return;
        }
      }

      await sock.sendMessage(jid, { text: body });
    },

    recoverFromUnhandledError(): boolean {
      // Baileys has no puppeteer page/CDP layer, so the wwebjs-specific
      // transient crashes don't apply here. Reconnect is handled internally
      // via connection.update, so nothing to recover at the process level.
      return false;
    },
  };
}
