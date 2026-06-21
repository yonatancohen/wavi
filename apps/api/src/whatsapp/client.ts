import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from 'whatsapp-web.js'
const { Client, LocalAuth, MessageTypes } = pkg
import qrcode from 'qrcode'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { handleIncomingMessage } from './handlers.js'
import { bindAgentIdentity, clearAgentIdentity, resolveAgentIdentity } from './agent-identity.js'

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WA_DATA_PATH = process.env.WA_SESSION_PATH ?? path.join(API_ROOT, '.wwebjs_auth')
const WA_CACHE_PATH = process.env.WA_CACHE_PATH ?? path.join(API_ROOT, '.wwebjs_cache')

function getProtocolTimeoutMs() {
  const n = Number(process.env.WA_PROTOCOL_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 300_000
}

function isProtocolOrCdpError(err: unknown) {
  if (!(err instanceof Error)) return false
  return (
    err.name === 'ProtocolError' ||
    err.message.includes('Runtime.callFunctionOn timed out') ||
    err.message.includes('Protocol error') ||
    err.message.includes('Session closed')
  )
}

// Serialize CDP calls — concurrent page.evaluate() calls can hang wwebjs.
let waOpChain: Promise<unknown> = Promise.resolve()
let waOpStartedAt: number | null = null

function withWaLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    waOpStartedAt = Date.now()
    try {
      return await fn()
    } finally {
      waOpStartedAt = null
    }
  }
  const next = waOpChain.then(run, run)
  waOpChain = next.catch(() => {})
  return next
}

function getHealthConfig() {
  return {
    probeIntervalMs: positiveEnvMs('WA_HEALTH_PROBE_INTERVAL_MS', 60_000),
    probeTimeoutMs: positiveEnvMs('WA_HEALTH_PROBE_TIMEOUT_MS', 8_000),
    stuckOpMs: positiveEnvMs('WA_STUCK_OP_MS', 45_000),
    failureThreshold: positiveEnvInt('WA_CDP_FAILURE_THRESHOLD', 2),
    restartCooldownMs: positiveEnvMs('WA_RESTART_COOLDOWN_MS', 120_000),
  }
}

function positiveEnvMs(key: string, fallback: number) {
  const n = Number(process.env[key])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function positiveEnvInt(key: string, fallback: number) {
  const n = Number(process.env[key])
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

let consecutiveCdpFailures = 0
let lastForcedRestartAt = 0
let restartInProgress = false
let healthMonitorTimer: ReturnType<typeof setInterval> | null = null

export function getWaHealthState() {
  const stuckMs = waOpStartedAt ? Date.now() - waOpStartedAt : 0
  return {
    consecutive_cdp_failures: consecutiveCdpFailures,
    last_forced_restart_at: lastForcedRestartAt
      ? new Date(lastForcedRestartAt).toISOString()
      : null,
    restart_in_progress: restartInProgress,
    cdp_op_in_flight: waOpStartedAt !== null,
    cdp_op_stuck_ms: stuckMs,
  }
}

function resetCdpFailures() {
  consecutiveCdpFailures = 0
}

export function reportCdpFailure(source: string) {
  consecutiveCdpFailures++
  const { failureThreshold } = getHealthConfig()
  console.warn(
    `[WA] CDP failure ${consecutiveCdpFailures}/${failureThreshold} (${source})`,
  )
  if (consecutiveCdpFailures >= failureThreshold) {
    void forceRestartWaClient(`cdp failures from ${source}`)
  }
}

async function probeWaCdp(): Promise<boolean> {
  const { probeTimeoutMs } = getHealthConfig()
  try {
    const state = await Promise.race([
      waClient.getState(),
      sleep(probeTimeoutMs).then(() => Promise.reject(new Error('health probe timeout'))),
    ])
    if (state === 'CONNECTED') {
      resetCdpFailures()
      return true
    }
    consecutiveCdpFailures++
    console.warn(`[WA] Health probe: unexpected state "${state}"`)
    return false
  } catch (err) {
    consecutiveCdpFailures++
    console.warn('[WA] Health probe failed', err)
    return false
  }
}

async function forceRestartWaClient(reason: string) {
  const { restartCooldownMs, failureThreshold } = getHealthConfig()
  const now = Date.now()

  if (restartInProgress) return
  if (now - lastForcedRestartAt < restartCooldownMs) {
    console.warn(`[WA] Skipping forced restart — cooldown active (${reason})`)
    return
  }

  restartInProgress = true
  lastForcedRestartAt = now
  console.warn(`[WA] Forcing client restart: ${reason}`)

  stopWaHealthMonitor()
  _waConnected = false
  _waConnecting = false
  _waPhoneNumber = null
  clearReadyFallback()
  clearAgentIdentity()
  waOpStartedAt = null
  waOpChain = Promise.resolve()

  try {
    await waClient.destroy()
  } catch (err) {
    console.warn('[WA] destroy() during forced restart', err)
  }

  const userDataDir = getSessionUserDataDir()
  const killed = killStaleBrowserProcesses(userDataDir)
  if (killed > 0) {
    console.log(`[WA] Killed ${killed} stale browser process(es) during restart`)
  }
  await sleep(500)
  removeStaleSingletonLocks(userDataDir)

  reconnectAttempts = 0
  restartInProgress = false

  try {
    await initializeWithCleanup()
    resetCdpFailures()
    console.log('[WA] Forced restart complete — waiting for ready')
  } catch (err) {
    console.error('[WA] Forced restart failed', err)
    scheduleReconnect()
  }
}

function runWaHealthCheck() {
  if (!_waConnected || restartInProgress || _waConnecting) return

  const { stuckOpMs, failureThreshold } = getHealthConfig()

  if (waOpStartedAt && Date.now() - waOpStartedAt > stuckOpMs) {
    void forceRestartWaClient(
      `CDP operation stuck for ${Math.round((Date.now() - waOpStartedAt) / 1000)}s`,
    )
    return
  }

  if (waOpStartedAt) return

  void probeWaCdp().then((ok) => {
    if (!ok && consecutiveCdpFailures >= failureThreshold) {
      void forceRestartWaClient('health probe')
    }
  })
}

function startWaHealthMonitor() {
  stopWaHealthMonitor()
  const { probeIntervalMs } = getHealthConfig()
  healthMonitorTimer = setInterval(runWaHealthCheck, probeIntervalMs)
  console.log(`[WA] Health monitor started (every ${probeIntervalMs / 1000}s)`)
}

function stopWaHealthMonitor() {
  if (healthMonitorTimer) {
    clearInterval(healthMonitorTimer)
    healthMonitorTimer = null
  }
}

function getSessionUserDataDir() {
  return path.resolve(WA_DATA_PATH, 'session')
}

function isBrowserAlreadyRunningError(err: unknown) {
  return err instanceof Error && err.message.includes('browser is already running')
}

function killStaleBrowserProcesses(userDataDir: string) {
  let pids: string[] = []
  try {
    pids = execFileSync('pgrep', ['-f', userDataDir], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return 0
  }

  let killed = 0
  for (const pid of pids) {
    const n = Number(pid)
    if (!n || n === process.pid) continue
    try {
      process.kill(n, 'SIGTERM')
      killed++
    } catch {
      // already exited
    }
  }
  return killed
}

function removeStaleSingletonLocks(userDataDir: string) {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      const target = path.join(userDataDir, name)
      if (fs.existsSync(target)) fs.unlinkSync(target)
    } catch {
      // ignore — lock may still be held
    }
  }
}

// ── Internal connection state ─────────────────────────────────
// Track readiness locally so /api/agent/status never has to rely
// on getState() (which can hang while the page is still initialising).
let _waConnected = false
let _waConnecting = false
let _waPhoneNumber: string | null = null
let readyFallbackTimer: ReturnType<typeof setInterval> | null = null

export function getWaConnectionState() {
  return {
    connected: _waConnected,
    connecting: _waConnecting,
    phone_number: _waPhoneNumber,
  }
}

function clearReadyFallback() {
  if (readyFallbackTimer) {
    clearInterval(readyFallbackTimer)
    readyFallbackTimer = null
  }
}

function startReadyFallback() {
  clearReadyFallback()
  let attempts = 0
  readyFallbackTimer = setInterval(async () => {
    if (_waConnected) {
      clearReadyFallback()
      return
    }
    attempts++
    if (attempts > 40) {
      clearReadyFallback()
      console.warn('[WA] Ready fallback timed out after authenticated')
      _waConnecting = false
      return
    }
    try {
      const state = await Promise.race([
        waClient.getState(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getState timeout')), 5000),
        ),
      ])
      if (state === 'CONNECTED') {
        console.log('[WA] Ready fallback — getState() is CONNECTED')
        await markReady()
      }
    } catch {
      // still initialising
    }
  }, 3000)
}

// ── SSE subscribers waiting for QR ───────────────────────────
type SSEClient = { send: (data: string) => void; close: () => void }
const qrSubscribers = new Set<SSEClient>()

// Cache the most recent QR data URL so late-joining subscribers get it
// immediately instead of waiting for the next qr event (which may be
// 20–60 s away or never, if authentication already happened).
let _lastQrPayload: string | null = null

export function subscribeToQR(client: SSEClient) {
  if (_waConnected) {
    client.send(JSON.stringify({ type: 'ready', phone_number: _waPhoneNumber }))
    client.close()
    return () => {}
  }

  if (_waConnecting) {
    client.send(JSON.stringify({ type: 'authenticated' }))
  } else if (_lastQrPayload) {
    client.send(_lastQrPayload)
  }

  qrSubscribers.add(client)
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
    dataPath: WA_DATA_PATH,
  }),
  webVersionCache: {
    type: 'local',
    path: WA_CACHE_PATH,
  },
  puppeteer: {
    headless: true,
    // Railway Chromium can be slow; default CDP timeout is too low for getContact().
    protocolTimeout: getProtocolTimeoutMs(),
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
})

// ── Events ───────────────────────────────────────────────────

waClient.on('qr', async (qr) => {
  try {
    const dataUrl = await qrcode.toDataURL(qr)
    _lastQrPayload = JSON.stringify({ type: 'qr', data: dataUrl })
    broadcastQR(_lastQrPayload)
  } catch (err) {
    console.error('[WA] QR generation failed', err)
  }
})

async function markReady() {
  if (_waConnected) return

  console.log('[WA] Client ready ✓')
  _waConnected = true
  _waConnecting = false
  _lastQrPayload = null
  clearReadyFallback()

  const info = waClient.info
  if (info) {
    const { phoneUser, lidUser } = await resolveAgentIdentity(
      waClient,
      info.wid._serialized,
      info.wid.user,
    )
    _waPhoneNumber = phoneUser
    bindAgentIdentity(waClient, { phoneUser, lidUser })
    if (lidUser) {
      console.log(`[WA] Agent identity — phone: ${phoneUser}, lid: ${lidUser}`)
    }
  }

  const readyMsg = JSON.stringify({ type: 'ready', phone_number: _waPhoneNumber })
  for (const sub of qrSubscribers) {
    sub.send(readyMsg)
    sub.close()
  }
  qrSubscribers.clear()

  if (info) {
    await db
      .from('agents')
      .update({ phone_number: _waPhoneNumber })
      .eq('id', process.env.AGENT_ID!)
      .throwOnError()
  }

  startWaHealthMonitor()
}

waClient.on('authenticated', () => {
  console.log('[WA] Authenticated ✓')
  _waConnecting = true
  broadcastQR(JSON.stringify({ type: 'authenticated' }))
  // wwebjs sometimes emits authenticated without ready; poll getState() as fallback.
  startReadyFallback()
})

waClient.on('ready', () => {
  markReady().catch((err) => console.error('[WA] markReady failed', err))
})

waClient.on('loading_screen', (percent, message) => {
  console.log(`[WA] Loading ${percent}% — ${message}`)
})

waClient.on('auth_failure', (msg) => {
  console.error('[WA] Auth failure:', msg)
  _waConnecting = false
  clearReadyFallback()
})

waClient.on('disconnected', async (reason) => {
  console.warn('[WA] Disconnected:', reason)
  _waConnected = false
  _waConnecting = false
  _waPhoneNumber = null
  _lastQrPayload = null
  clearReadyFallback()
  clearAgentIdentity()
  stopWaHealthMonitor()

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

export async function listGroupChats() {
  const state = await waClient.getState().catch(() => null)
  if (state !== 'CONNECTED') {
    throw new Error('WhatsApp is not connected. Link your account first.')
  }

  const chats = await waClient.getChats()
  return chats
    .filter((chat) => chat.isGroup)
    .map((chat) => {
      const participants = (chat as { participants?: unknown[] }).participants
      return {
        wa_group_id: chat.id._serialized,
        name: chat.name ?? 'Unnamed group',
        participant_count: Array.isArray(participants) ? participants.length : null,
        last_activity: chat.timestamp
          ? new Date(chat.timestamp * 1000).toISOString()
          : null,
      }
    })
}

let starting = false

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function initializeWithCleanup() {
  const userDataDir = getSessionUserDataDir()
  const killed = killStaleBrowserProcesses(userDataDir)
  if (killed > 0) {
    console.log(`[WA] Stopped ${killed} stale browser process(es) from a previous run`)
    await sleep(500)
    removeStaleSingletonLocks(userDataDir)
  }

  try {
    await waClient.initialize()
  } catch (err) {
    if (!isBrowserAlreadyRunningError(err)) throw err
    console.warn('[WA] Browser lock detected — retrying after cleanup')
    killStaleBrowserProcesses(userDataDir)
    await sleep(500)
    removeStaleSingletonLocks(userDataDir)
    await waClient.initialize()
  }
}

export function startWhatsAppClient() {
  if (starting) return
  starting = true
  console.log('[WA] Initializing client...')
  initializeWithCleanup().catch((err) => {
    console.error('[WA] Initial connection failed', err)
    starting = false
  })
}

export async function stopWhatsAppClient() {
  stopWaHealthMonitor()
  try {
    await waClient.destroy()
    console.log('[WA] Client stopped')
  } catch (err) {
    console.warn('[WA] Client stop error', err)
  } finally {
    starting = false
  }
}

async function waitUntilConnected(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (_waConnected) return

    try {
      const state = await Promise.race([
        waClient.getState(),
        sleep(5_000).then(() => null as string | null),
      ])
      if (state === 'CONNECTED') return
    } catch {
      // browser may still be initialising
    }

    await sleep(1_000)
  }

  throw new Error('WhatsApp is not connected')
}

async function sendReplyOnce(
  waGroupId: string,
  replyBody: string,
  quotedMsgId?: string,
) {
  await waitUntilConnected()

  const chat = await waClient.getChatById(waGroupId)
  if (!chat) {
    throw new Error(`WhatsApp chat not found: ${waGroupId}`)
  }

  // Simulate human typing: ~40 chars/sec, clamped 1.5–5s, plus random jitter
  const typingMs = Math.min(Math.max(replyBody.length * 25, 1500), 5000)
  const jitter = Math.floor(Math.random() * 800)
  await chat.sendStateTyping()
  await sleep(typingMs + jitter)
  await chat.clearState()

  if (quotedMsgId) {
    const quoted = await waClient.getMessageById(quotedMsgId)
    await chat.sendMessage(replyBody, { quotedMessageId: quoted.id._serialized })
  } else {
    await chat.sendMessage(replyBody)
  }
}

export async function sendReply(
  waGroupId: string,
  replyBody: string,
  quotedMsgId?: string,
) {
  return withWaLock(async () => {
    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await sendReplyOnce(waGroupId, replyBody, quotedMsgId)
        return
      } catch (err) {
        if (!isProtocolOrCdpError(err) || attempt === maxAttempts) throw err

        reportCdpFailure('sendReply')

        console.warn(
          `[WA] sendReply CDP error (attempt ${attempt}/${maxAttempts}), retrying…`,
          err,
        )

        await sleep(2_000 * attempt)
      }
    }
  })
}
