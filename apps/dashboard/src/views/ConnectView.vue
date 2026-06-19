<template>
  <div class="flex min-h-full flex-col bg-background">
    <header class="border-b border-outline-variant bg-surface px-margin-mobile py-5">
      <h1 class="font-sora text-headline-md text-on-surface">Connect WhatsApp</h1>
      <p class="mt-1 text-body-md text-on-surface-variant">
        Scan the QR code to link your WhatsApp account to Wavi
      </p>
    </header>

    <div class="mx-auto w-full max-w-[1000px] flex-1 px-margin-mobile py-8">
      <div v-if="connected" class="mx-auto max-w-md rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
        <img
          src="/wavi-mascot.jpg"
          alt="Wavi mascot"
          class="mx-auto mb-6 h-20 w-20 rounded-2xl object-contain"
        />
        <div class="mb-2 font-sora text-headline-md text-on-surface">WhatsApp connected</div>
        <p class="mb-6 text-body-md text-on-surface-variant">
          {{ phoneNumber ? `Linked to +${phoneNumber}.` : 'Your agent is linked and ready.' }}
          Register groups to start listening and replying.
        </p>
        <RouterLink to="/groups" class="btn btn-primary inline-flex items-center gap-2">
          <span class="material-symbols-outlined text-[20px]">group_add</span>
          Register groups
        </RouterLink>
      </div>

      <template v-else>
        <div class="mb-8 flex items-center gap-5">
          <div class="relative shrink-0">
            <div class="absolute inset-0 animate-neon-pulse rounded-2xl bg-primary opacity-20 blur-xl" />
            <img
              src="/wavi-mascot.jpg"
              alt="Wavi mascot"
              class="relative h-16 w-16 rounded-2xl object-contain ring-2 ring-primary/30"
            />
          </div>
          <div>
            <h2 class="font-sora text-headline-lg-mobile text-on-surface">Link Wavi to WhatsApp</h2>
            <p class="mt-1 text-body-md italic text-on-surface-variant">
              Wavi is waiting to roast your friends…
            </p>
          </div>
        </div>

        <div
          v-if="streamError"
          class="mb-6 rounded-xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error"
        >
          {{ streamError }}
          <button class="ml-3 underline" @click="retry">Retry</button>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <section class="flex min-h-[400px] flex-col rounded-xl border border-outline-variant bg-surface-container p-6 lg:p-8">
            <h3 class="mb-6 font-sora text-headline-md text-primary">How to link</h3>
            <ol class="flex flex-1 flex-col justify-center gap-6">
              <li class="flex items-start gap-4">
                <span class="step-num">1</span>
                <p class="pt-1.5 text-body-md leading-relaxed text-on-surface-variant">
                  Open <span class="font-semibold text-primary">WhatsApp</span> on your phone
                </p>
              </li>
              <li class="flex items-start gap-4">
                <span class="step-num">2</span>
                <p class="pt-1.5 text-body-md leading-relaxed text-on-surface-variant">
                  Tap <span class="font-semibold text-on-surface">Menu</span> or
                  <span class="font-semibold text-on-surface">Settings</span>, then
                  <span class="font-semibold text-primary">Linked Devices</span>
                </p>
              </li>
              <li class="flex items-start gap-4">
                <span class="step-num">3</span>
                <p class="pt-1.5 text-body-md leading-relaxed text-on-surface-variant">
                  Point your phone at the code to <span class="font-semibold text-on-surface">capture it</span>
                </p>
              </li>
            </ol>
          </section>

          <section class="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container p-6 lg:p-8">
            <div class="rounded-2xl bg-white p-5 shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
              <div class="relative h-56 w-56 overflow-hidden rounded-xl sm:h-64 sm:w-64">
                <img
                  v-if="qrDataUrl"
                  :src="qrDataUrl"
                  class="h-full w-full object-contain"
                  alt="WhatsApp QR Code"
                />
                <LoadingState
                  v-else
                  variant="compact"
                  message="Generating QR code…"
                />
                <div
                  v-if="qrDataUrl"
                  class="scan-line pointer-events-none absolute left-0 h-[2px] w-full bg-primary opacity-90 shadow-[0_0_12px_#4ff07f]"
                />
              </div>
            </div>

            <div class="mt-5 flex items-center gap-2.5 text-on-surface-variant">
              <span
                class="h-2.5 w-2.5 rounded-full"
                :class="qrDataUrl ? 'animate-neon-pulse bg-primary' : 'animate-pulse bg-secondary'"
              />
              <p class="text-label-md">
                {{ qrDataUrl ? 'Scan with your phone to connect' : 'Waiting for connection…' }}
              </p>
            </div>
          </section>
        </div>

        <p class="mt-8 text-center text-sm text-on-surface-variant lg:text-left">
          Keep your phone on Wi-Fi for a faster sync. QR refreshes automatically.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { apiFetch, API_BASE } from '../lib/api'
import LoadingState from '../components/LoadingState.vue'

type AgentStatus = { connected: boolean; phone_number: string | null }

const qrDataUrl = ref<string | null>(null)
const connected = ref(false)
const phoneNumber = ref<string | null>(null)
const streamError = ref<string | null>(null)
let eventSource: EventSource | null = null
let qrTimeout: ReturnType<typeof setTimeout> | null = null

function closeStream() {
  eventSource?.close()
  eventSource = null
  if (qrTimeout) {
    clearTimeout(qrTimeout)
    qrTimeout = null
  }
}

function setConnected(status: AgentStatus) {
  connected.value = true
  phoneNumber.value = status.phone_number
  qrDataUrl.value = null
  streamError.value = null
  closeStream()
}

function startQrStream() {
  closeStream()
  streamError.value = null
  qrDataUrl.value = null

  eventSource = new EventSource(`${API_BASE}/agent/qr`)

  qrTimeout = setTimeout(() => {
    if (!qrDataUrl.value && !connected.value) {
      streamError.value =
        'QR is taking too long. Make sure the API is running locally and VITE_API_URL points to it (use /api for local dev).'
    }
  }, 20_000)

  eventSource.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'qr') {
      qrDataUrl.value = msg.data
      streamError.value = null
    } else if (msg.type === 'authenticated') {
      apiFetch<AgentStatus>('/agent/status')
        .then(setConnected)
        .catch(() => setConnected({ connected: true, phone_number: null }))
    }
  }

  eventSource.onerror = () => {
    apiFetch<AgentStatus>('/agent/status')
      .then((s) => {
        if (s.connected) setConnected(s)
        // API is up — SSE reconnects on its own; don't show a false error
      })
      .catch(() => {
        streamError.value =
          'Could not reach the API. Start it with `bun run dev` from the repo root, then retry.'
      })
  }
}

async function loadStatus() {
  try {
    const status = await apiFetch<AgentStatus>('/agent/status')
    if (status.connected) {
      setConnected(status)
      return
    }
    startQrStream()
  } catch {
    streamError.value =
      'Could not reach the API. Start it with `bun run dev` from the repo root, then retry.'
  }
}

function retry() {
  loadStatus()
}

onMounted(loadStatus)

onUnmounted(closeStream)
</script>

<style scoped>
.scan-line {
  animation: scan-line 2.5s ease-in-out infinite;
}

.step-num {
  @apply flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-1 ring-primary/25;
}
</style>
