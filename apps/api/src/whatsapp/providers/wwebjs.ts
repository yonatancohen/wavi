import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageTypes } = pkg;
import qrcode from 'qrcode';
import { db } from '../../db/client.js';
import { handleIncomingMessage } from '../handlers.js';
import { bindAgentIdentity, clearAgentIdentity } from '../agent-identity.js';
import type { WhatsAppProvider, SSEClient, GroupSummary, InboundMessage, QuotedMessage } from '../provider.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WA_DATA_PATH = process.env.WA_SESSION_PATH ?? path.join(API_ROOT, '.wwebjs_auth');
const WA_CACHE_PATH = process.env.WA_CACHE_PATH ?? path.join(API_ROOT, '.wwebjs_cache');

const GET_CONTACT_TIMEOUT_MS = 15_000;

async function resolveQuotedMessage(msg: {
  hasQuotedMsg?: boolean;
  getQuotedMessage?: () => Promise<{ body?: string; author?: string; from?: string; fromMe?: boolean }>;
}): Promise<QuotedMessage | undefined> {
  if (!msg.hasQuotedMsg || !msg.getQuotedMessage) return undefined;
  try {
    const quoted = await msg.getQuotedMessage();
    const fromMe = quoted.fromMe === true;
    const senderWaId = quoted.author ?? quoted.from ?? '';
    let senderName = senderWaId;
    try {
      const contact = await (quoted as { getContact?: () => Promise<{ pushname?: string }> }).getContact?.();
      senderName = contact?.pushname ?? senderWaId;
    } catch {
      // use JID fallback
    }
    return {
      body: quoted.body ?? '',
      senderWaId,
      senderName,
      fromMe,
    };
  } catch {
    return undefined;
  }
}

function getProtocolTimeoutMs() {
  const n = Number(process.env.WA_PROTOCOL_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 300_000;
}

function isProtocolOrCdpError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.name === 'ProtocolError' || err.message.includes('Runtime.callFunctionOn timed out') || err.message.includes('Protocol error') || err.message.includes('Session closed');
}

// wwebjs re-injects from an un-awaited `framenavigated` handler on LOGOUT. If
// the puppeteer page still has its bindings registered, exposeFunction throws
// "already exists", surfacing as an unhandled rejection that would otherwise
// kill the whole process.
function isPageBindingAlreadyExistsError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message.includes('already exists') && (err.message.includes('page binding') || err.message.includes('window['));
}

function positiveEnvMs(key: string, fallback: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function positiveEnvInt(key: string, fallback: number) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function getHealthConfig() {
  return {
    probeIntervalMs: positiveEnvMs('WA_HEALTH_PROBE_INTERVAL_MS', 60_000),
    probeTimeoutMs: positiveEnvMs('WA_HEALTH_PROBE_TIMEOUT_MS', 8_000),
    stuckOpMs: positiveEnvMs('WA_STUCK_OP_MS', 45_000),
    failureThreshold: positiveEnvInt('WA_CDP_FAILURE_THRESHOLD', 2),
    restartCooldownMs: positiveEnvMs('WA_RESTART_COOLDOWN_MS', 120_000),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSessionUserDataDir() {
  return path.resolve(WA_DATA_PATH, 'session');
}

function isBrowserAlreadyRunningError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message.includes('browser is already running') || err.message.includes('Code: 21') || err.message.includes('profile appears to be in use');
}

function killStaleBrowserProcesses(userDataDir: string) {
  let pids: string[] = [];
  try {
    pids = execFileSync('pgrep', ['-f', userDataDir], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return 0;
  }

  let killed = 0;
  for (const pid of pids) {
    const n = Number(pid);
    if (!n || n === process.pid) continue;
    try {
      process.kill(n, 'SIGTERM');
      killed++;
    } catch {
      // already exited
    }
  }
  return killed;
}

function removeStaleSingletonLocks(userDataDir: string) {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      const target = path.join(userDataDir, name);
      // Use lstat (not stat) so we detect dangling symlinks that existsSync misses.
      fs.lstatSync(target);
      fs.unlinkSync(target);
    } catch {
      // file doesn't exist or can't be removed — ignore
    }
  }
}

type LidPhoneClient = InstanceType<typeof Client> & {
  getContactLidAndPhone?: (ids: string[]) => Promise<Array<{ lid?: string; pn?: string }>>;
};

type PuppeteerPage = {
  exposeFunction: (name: string, fn: (...args: unknown[]) => unknown) => Promise<void>;
};

type ClientWithPage = InstanceType<typeof Client> & { pupPage?: PuppeteerPage | null };

// wwebjs re-runs inject() from an un-awaited `framenavigated` listener on
// LOGOUT. After the navigation, window[name] is reset so its "if absent" guard
// passes, but puppeteer still has the binding registered internally, so
// page.exposeFunction throws "already exists". Because the listener is async and
// un-awaited, that rejection is unhandled and crashes the (Bun) process before
// our global handler can reliably intercept it. Puppeteer already re-exposes
// bindings across navigations via its init script, so swallowing the duplicate
// here is safe and removes the crash at its source.
const hardenedPages = new WeakSet<object>();

function hardenPageBindings(client: InstanceType<typeof Client>) {
  const page = (client as ClientWithPage).pupPage;
  if (!page || hardenedPages.has(page)) return;

  const originalExposeFunction = page.exposeFunction.bind(page);
  page.exposeFunction = async (name, fn) => {
    try {
      await originalExposeFunction(name, fn);
    } catch (err) {
      if (isPageBindingAlreadyExistsError(err)) {
        console.warn(`[WA] Ignoring duplicate page binding "${name}" during re-inject`);
        return;
      }
      throw err;
    }
  };
  hardenedPages.add(page);
}

function waUserId(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

async function resolveAgentIdentity(client: InstanceType<typeof Client>, widSerialized: string, widUser: string): Promise<{ phoneUser: string; lidUser: string | null }> {
  let resolvedPhone = widUser;
  let resolvedLid: string | null = widSerialized.endsWith('@lid') ? widUser : null;

  const lookup = (client as LidPhoneClient).getContactLidAndPhone;
  if (lookup) {
    try {
      const [mapping] = await lookup.call(client, [widSerialized]);
      if (mapping?.pn) resolvedPhone = waUserId(mapping.pn);
      if (mapping?.lid) resolvedLid = waUserId(mapping.lid);
    } catch (err) {
      console.warn('[WA] LID/phone lookup failed — native @ mentions may not match until reconnect', err);
    }
  }

  return { phoneUser: resolvedPhone, lidUser: resolvedLid };
}

export function createWwebjsProvider(): WhatsAppProvider {
  // ── CDP op serialisation ──────────────────────────────────
  let waOpChain: Promise<unknown> = Promise.resolve();
  let waOpStartedAt: number | null = null;

  function withWaLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      waOpStartedAt = Date.now();
      try {
        return await fn();
      } finally {
        waOpStartedAt = null;
      }
    };
    const next = waOpChain.then(run, run);
    waOpChain = next.catch(() => {});
    return next;
  }

  // ── Health monitor ────────────────────────────────────────
  let consecutiveCdpFailures = 0;
  let lastForcedRestartAt = 0;
  let restartInProgress = false;
  let healthMonitorTimer: ReturnType<typeof setInterval> | null = null;

  function resetCdpFailures() {
    consecutiveCdpFailures = 0;
  }

  function reportCdpFailure(source: string) {
    consecutiveCdpFailures++;
    const { failureThreshold } = getHealthConfig();
    console.warn(`[WA] CDP failure ${consecutiveCdpFailures}/${failureThreshold} (${source})`);
    if (consecutiveCdpFailures >= failureThreshold) {
      void forceRestartWaClient(`cdp failures from ${source}`);
    }
  }

  async function probeWaCdp(): Promise<boolean> {
    // Fast path: waClient.info is populated in memory when the session is live.
    if (waClient.info?.wid?._serialized) {
      resetCdpFailures();
      return true;
    }

    const { probeTimeoutMs } = getHealthConfig();
    try {
      const state = await Promise.race([waClient.getState(), sleep(probeTimeoutMs).then(() => Promise.reject(new Error('health probe timeout')))]);
      if (state === 'CONNECTED') {
        resetCdpFailures();
        return true;
      }
      consecutiveCdpFailures++;
      console.warn(`[WA] Health probe: unexpected state "${state}"`);
      return false;
    } catch (err) {
      consecutiveCdpFailures++;
      console.warn('[WA] Health probe failed', err);
      return false;
    }
  }

  async function forceRestartWaClient(reason: string) {
    const { restartCooldownMs } = getHealthConfig();
    const now = Date.now();

    if (restartInProgress) return;
    if (now - lastForcedRestartAt < restartCooldownMs) {
      console.warn(`[WA] Skipping forced restart — cooldown active (${reason})`);
      return;
    }

    restartInProgress = true;
    lastForcedRestartAt = now;
    console.warn(`[WA] Forcing client restart: ${reason}`);

    stopWaHealthMonitor();
    _waConnected = false;
    _waConnecting = false;
    _waPhoneNumber = null;
    clearReadyFallback();
    clearAgentIdentity();
    waOpStartedAt = null;
    waOpChain = Promise.resolve();

    try {
      await waClient.destroy();
    } catch (err) {
      console.warn('[WA] destroy() during forced restart', err);
    }

    const userDataDir = getSessionUserDataDir();
    const killed = killStaleBrowserProcesses(userDataDir);
    if (killed > 0) {
      console.log(`[WA] Killed ${killed} stale browser process(es) during restart`);
    }
    await sleep(500);
    removeStaleSingletonLocks(userDataDir);

    reconnectAttempts = 0;
    restartInProgress = false;

    try {
      await initializeWithCleanup();
      resetCdpFailures();
      console.log('[WA] Forced restart complete — waiting for ready');
    } catch (err) {
      console.error('[WA] Forced restart failed', err);
      scheduleReconnect();
    }
  }

  function runWaHealthCheck() {
    if (!_waConnected || restartInProgress || _waConnecting) return;

    const { stuckOpMs, failureThreshold } = getHealthConfig();

    if (waOpStartedAt && Date.now() - waOpStartedAt > stuckOpMs) {
      void forceRestartWaClient(`CDP operation stuck for ${Math.round((Date.now() - waOpStartedAt) / 1000)}s`);
      return;
    }

    if (waOpStartedAt) return;

    void probeWaCdp().then((ok) => {
      if (!ok && consecutiveCdpFailures >= failureThreshold) {
        void forceRestartWaClient('health probe');
      }
    });
  }

  function startWaHealthMonitor() {
    stopWaHealthMonitor();
    const { probeIntervalMs } = getHealthConfig();
    healthMonitorTimer = setInterval(runWaHealthCheck, probeIntervalMs);
    console.log(`[WA] Health monitor started (every ${probeIntervalMs / 1000}s)`);
  }

  function stopWaHealthMonitor() {
    if (healthMonitorTimer) {
      clearInterval(healthMonitorTimer);
      healthMonitorTimer = null;
    }
  }

  // ── Internal connection state ─────────────────────────────
  let _waConnected = false;
  let _waConnecting = false;
  let _waPhoneNumber: string | null = null;
  let readyFallbackTimer: ReturnType<typeof setInterval> | null = null;

  function clearReadyFallback() {
    if (readyFallbackTimer) {
      clearInterval(readyFallbackTimer);
      readyFallbackTimer = null;
    }
  }

  function startReadyFallback() {
    clearReadyFallback();
    let attempts = 0;
    readyFallbackTimer = setInterval(async () => {
      if (_waConnected) {
        clearReadyFallback();
        return;
      }
      attempts++;
      if (attempts > 40) {
        clearReadyFallback();
        console.warn('[WA] Ready fallback timed out after authenticated');
        _waConnecting = false;
        return;
      }

      // Fast path: if waClient.info is already populated, the session is live.
      if (waClient.info?.wid?._serialized) {
        console.log('[WA] Ready fallback — waClient.info is populated');
        await markReady();
        return;
      }

      try {
        const state = await Promise.race([waClient.getState(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getState timeout')), 5000))]);
        if (state === 'CONNECTED') {
          console.log('[WA] Ready fallback — getState() is CONNECTED');
          await markReady();
        }
      } catch {
        // still initialising
      }
    }, 3000);
  }

  // ── SSE subscribers ───────────────────────────────────────
  const qrSubscribers = new Set<SSEClient>();
  let _lastQrPayload: string | null = null;

  function broadcastQR(data: string) {
    for (const sub of qrSubscribers) {
      sub.send(data);
    }
  }

  // ── WhatsApp Client ───────────────────────────────────────
  const waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: WA_DATA_PATH }),
    webVersionCache: { type: 'local', path: WA_CACHE_PATH },
    puppeteer: {
      headless: true,
      protocolTimeout: getProtocolTimeoutMs(),
      ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled'],
    },
  });

  // ── markReady ─────────────────────────────────────────────
  async function markReady() {
    if (_waConnected) return;

    console.log('[WA] Client ready ✓');
    _waConnected = true;
    _waConnecting = false;
    _lastQrPayload = null;
    clearReadyFallback();

    const info = waClient.info;
    if (info) {
      const { phoneUser, lidUser } = await resolveAgentIdentity(waClient, info.wid._serialized, info.wid.user);
      _waPhoneNumber = phoneUser;
      bindAgentIdentity({ phoneUser, lidUser, wid: info.wid._serialized });
      if (lidUser) {
        console.log(`[WA] Agent identity — phone: ${phoneUser}, lid: ${lidUser}`);
      }
    }

    const readyMsg = JSON.stringify({ type: 'ready', phone_number: _waPhoneNumber });
    for (const sub of qrSubscribers) {
      sub.send(readyMsg);
      sub.close();
    }
    qrSubscribers.clear();

    if (info) {
      await db.from('agents').update({ phone_number: _waPhoneNumber }).eq('id', process.env.AGENT_ID!).throwOnError();
    }

    startWaHealthMonitor();
  }

  // ── Events ────────────────────────────────────────────────
  waClient.on('qr', async (qr) => {
    hardenPageBindings(waClient);
    try {
      const dataUrl = await qrcode.toDataURL(qr);
      _lastQrPayload = JSON.stringify({ type: 'qr', data: dataUrl });
      broadcastQR(_lastQrPayload);
    } catch (err) {
      console.error('[WA] QR generation failed', err);
    }
  });

  waClient.on('authenticated', () => {
    hardenPageBindings(waClient);
    console.log('[WA] Authenticated ✓');
    _waConnecting = true;
    broadcastQR(JSON.stringify({ type: 'authenticated' }));
    startReadyFallback();
  });

  waClient.on('ready', () => {
    markReady().catch((err) => console.error('[WA] markReady failed', err));
  });

  waClient.on('loading_screen', (percent, message) => {
    hardenPageBindings(waClient);
    console.log(`[WA] Loading ${percent}% — ${message}`);
  });

  waClient.on('auth_failure', (msg) => {
    console.error('[WA] Auth failure:', msg);
    _waConnecting = false;
    clearReadyFallback();
  });

  waClient.on('disconnected', async (reason) => {
    console.warn('[WA] Disconnected:', reason);
    _waConnected = false;
    _waConnecting = false;
    _waPhoneNumber = null;
    _lastQrPayload = null;
    clearReadyFallback();
    clearAgentIdentity();
    stopWaHealthMonitor();

    await db.from('agents').update({ phone_number: null }).eq('id', process.env.AGENT_ID!);

    scheduleReconnect();
  });

  waClient.on('message', async (msg) => {
    if (msg.isStatus) return;
    if (msg.type !== MessageTypes.TEXT) return;

    // Map native wwebjs Message -> provider-agnostic InboundMessage
    let chat: Awaited<ReturnType<typeof msg.getChat>>;
    try {
      chat = await msg.getChat();
    } catch (err) {
      console.error('[WA] getChat failed, dropping message', err);
      return;
    }

    const inbound: InboundMessage = {
      waGroupId: chat.id._serialized,
      isGroup: chat.isGroup,
      chatName: chat.name ?? '',
      senderWaId: msg.author ?? msg.from,
      body: msg.body,
      timestampMs: msg.timestamp * 1000,
      waMsgId: msg.id._serialized,
      mentionedIds: (msg as { mentionedIds?: string[] }).mentionedIds ?? [],
      quotedMessage: await resolveQuotedMessage(msg),
      resolvePushName: async () => {
        try {
          const contact = await Promise.race([msg.getContact(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('getContact timeout')), GET_CONTACT_TIMEOUT_MS))]);
          return contact.pushname ?? msg.author ?? msg.from;
        } catch (err) {
          console.warn('[WA] getContact failed — using sender id as display name:', err);
          return msg.author ?? msg.from;
        }
      },
    };

    try {
      await handleIncomingMessage(inbound);
    } catch (err) {
      console.error('[WA] Message handler error', err);
    }
  });

  // ── Reconnect logic ───────────────────────────────────────
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WA] Max reconnect attempts reached — giving up');
      return;
    }

    const delay = Math.min(1000 * 2 ** reconnectAttempts, 60_000);
    reconnectAttempts++;
    console.log(`[WA] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`);

    setTimeout(async () => {
      try {
        await waClient.initialize();
        hardenPageBindings(waClient);
        reconnectAttempts = 0;
      } catch (err) {
        console.error('[WA] Reconnect failed', err);
        scheduleReconnect();
      }
    }, delay);
  }

  // ── Startup helpers ───────────────────────────────────────
  async function initializeWithCleanup() {
    const userDataDir = getSessionUserDataDir();
    removeStaleSingletonLocks(userDataDir);

    const killed = killStaleBrowserProcesses(userDataDir);
    if (killed > 0) {
      console.log(`[WA] Stopped ${killed} stale browser process(es) from a previous run`);
      await sleep(500);
    }

    try {
      await waClient.initialize();
    } catch (err) {
      if (!isBrowserAlreadyRunningError(err)) throw err;
      console.warn('[WA] Browser lock detected — retrying after cleanup');
      killStaleBrowserProcesses(userDataDir);
      await sleep(500);
      removeStaleSingletonLocks(userDataDir);
      await waClient.initialize();
    }
    hardenPageBindings(waClient);
  }

  // ── Send helpers ──────────────────────────────────────────
  async function waitUntilConnected(timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (_waConnected) return;

      try {
        const state = await Promise.race([waClient.getState(), sleep(5_000).then(() => null as string | null)]);
        if (state === 'CONNECTED') return;
      } catch {
        // browser may still be initialising
      }

      await sleep(1_000);
    }

    throw new Error('WhatsApp is not connected');
  }

  async function sendReplyOnce(waGroupId: string, replyBody: string, quotedMsgId?: string) {
    await waitUntilConnected();

    const chat = await waClient.getChatById(waGroupId);
    if (!chat) throw new Error(`WhatsApp chat not found: ${waGroupId}`);

    const typingMs = Math.min(Math.max(replyBody.length * 25, 1500), 5000);
    const jitter = Math.floor(Math.random() * 800);
    await chat.sendStateTyping();
    await sleep(typingMs + jitter);
    await chat.clearState();

    if (quotedMsgId) {
      const quoted = await waClient.getMessageById(quotedMsgId);
      await chat.sendMessage(replyBody, { quotedMessageId: quoted.id._serialized });
    } else {
      await chat.sendMessage(replyBody);
    }
  }

  // ── Starting guard ────────────────────────────────────────
  let starting = false;

  // ── WhatsAppProvider implementation ──────────────────────
  return {
    start() {
      if (starting) return;
      starting = true;
      console.log('[WA] Initializing client...');
      initializeWithCleanup().catch((err) => {
        console.error('[WA] Initial connection failed', err);
        starting = false;
      });
    },

    async stop() {
      stopWaHealthMonitor();
      try {
        await waClient.destroy();
        console.log('[WA] Client stopped');
      } catch (err) {
        console.warn('[WA] Client stop error', err);
      } finally {
        starting = false;
      }
    },

    async restart() {
      console.log('[WA] Manual restart requested');
      stopWaHealthMonitor();

      _waConnected = false;
      _waConnecting = false;
      _waPhoneNumber = null;
      _lastQrPayload = null;
      clearReadyFallback();
      clearAgentIdentity();
      waOpStartedAt = null;
      waOpChain = Promise.resolve();
      consecutiveCdpFailures = 0;

      try {
        await waClient.destroy();
      } catch {
        /* ignore */
      }

      const userDataDir = getSessionUserDataDir();
      killStaleBrowserProcesses(userDataDir);
      await sleep(500);
      removeStaleSingletonLocks(userDataDir);

      starting = false;
      reconnectAttempts = 0;
      restartInProgress = false;

      await initializeWithCleanup();
    },

    subscribeToQR(client: SSEClient) {
      if (_waConnected) {
        client.send(JSON.stringify({ type: 'ready', phone_number: _waPhoneNumber }));
        client.close();
        return () => {};
      }

      if (_waConnecting) {
        client.send(JSON.stringify({ type: 'authenticated' }));
      } else if (_lastQrPayload) {
        client.send(_lastQrPayload);
      }

      qrSubscribers.add(client);
      return () => qrSubscribers.delete(client);
    },

    getConnectionState() {
      return {
        connected: _waConnected,
        connecting: _waConnecting,
        phone_number: _waPhoneNumber,
      };
    },

    getHealthState() {
      const stuckMs = waOpStartedAt ? Date.now() - waOpStartedAt : 0;
      return {
        consecutive_cdp_failures: consecutiveCdpFailures,
        last_forced_restart_at: lastForcedRestartAt ? new Date(lastForcedRestartAt).toISOString() : null,
        restart_in_progress: restartInProgress,
        cdp_op_in_flight: waOpStartedAt !== null,
        cdp_op_stuck_ms: stuckMs,
      };
    },

    getIdentitySnapshot() {
      return {
        wid: waClient.info?.wid?._serialized ?? null,
        phone: waClient.info?.me?.user ?? null,
      };
    },

    async listGroupChats(): Promise<GroupSummary[]> {
      const state = await waClient.getState().catch(() => null);
      if (state !== 'CONNECTED') {
        throw new Error('WhatsApp is not connected. Link your account first.');
      }

      const chats = await waClient.getChats();
      return chats
        .filter((chat) => chat.isGroup)
        .map((chat) => {
          const participants = (chat as { participants?: unknown[] }).participants;
          return {
            wa_group_id: chat.id._serialized,
            name: chat.name ?? 'Unnamed group',
            participant_count: Array.isArray(participants) ? participants.length : null,
            last_activity: chat.timestamp ? new Date(chat.timestamp * 1000).toISOString() : null,
          };
        });
    },

    sendReply(waGroupId: string, replyBody: string, quotedMsgId?: string) {
      return withWaLock(async () => {
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await sendReplyOnce(waGroupId, replyBody, quotedMsgId);
            return;
          } catch (err) {
            if (!isProtocolOrCdpError(err) || attempt === maxAttempts) throw err;

            reportCdpFailure('sendReply');

            console.warn(`[WA] sendReply CDP error (attempt ${attempt}/${maxAttempts}), retrying…`, err);

            await sleep(2_000 * attempt);
          }
        }
      });
    },

    recoverFromUnhandledError(err: unknown): boolean {
      if (isPageBindingAlreadyExistsError(err)) {
        console.warn('[WA] Recovering from page-binding inject race', err);
        void forceRestartWaClient('page binding already exists');
        return true;
      }
      if (isProtocolOrCdpError(err)) {
        console.warn('[WA] Recovering from protocol/CDP error', err);
        void forceRestartWaClient('unhandled protocol/CDP error');
        return true;
      }
      return false;
    },
  };
}
