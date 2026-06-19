<template>
  <div class="flex h-screen flex-col">
    <div class="flex h-[60px] items-center justify-between border-b border-border bg-surface px-7">
      <div>
        <div class="text-[15px] font-semibold">Connect WhatsApp</div>
        <div class="mt-px text-xs text-muted">Scan the QR code with your WhatsApp to connect the agent</div>
      </div>
      <div
        class="rounded-full px-3 py-1 text-xs font-semibold"
        :class="connected
          ? 'border border-wa/30 bg-wa/10 text-wa'
          : 'border border-danger/30 bg-danger/10 text-danger'"
      >
        {{ connected ? '● Connected' : '○ Disconnected' }}
      </div>
    </div>

    <div class="flex flex-1 items-center justify-center p-10">
      <div class="min-w-[320px] rounded-2xl border border-border bg-surface p-10 text-center">
        <template v-if="connected">
          <div class="flex flex-col items-center gap-3">
            <div class="text-5xl text-wa">✓</div>
            <div class="text-lg font-semibold">WhatsApp Connected</div>
            <div class="text-[13px] text-muted">Phone: +{{ phoneNumber }}</div>
          </div>
        </template>

        <template v-else-if="qrDataUrl">
          <div class="mb-5 text-[13px] text-muted">Scan with WhatsApp → Linked Devices → Link a Device</div>
          <img :src="qrDataUrl" class="mx-auto block h-[260px] w-[260px] rounded-xl" alt="WhatsApp QR Code" />
          <div class="mt-4 text-[11px] text-muted">QR refreshes automatically · do not share this code</div>
        </template>

        <template v-else>
          <div class="flex flex-col items-center gap-4 text-muted">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
            <div>Generating QR code...</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { apiFetch } from '../lib/api'

type AgentStatus = { connected: boolean; phone_number: string | null }

const qrDataUrl = ref<string | null>(null)
const connected = ref(false)
const phoneNumber = ref<string | null>(null)
let eventSource: EventSource | null = null

function setConnected(status: AgentStatus) {
  connected.value = true
  phoneNumber.value = status.phone_number
  qrDataUrl.value = null
  eventSource?.close()
  eventSource = null
}

function startQrStream() {
  const API = import.meta.env.VITE_API_URL ?? '/api'
  eventSource = new EventSource(`${API}/agent/qr`)

  eventSource.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'qr') {
      qrDataUrl.value = msg.data
    } else if (msg.type === 'authenticated') {
      apiFetch<AgentStatus>('/agent/status').then(setConnected).catch(() => setConnected({ connected: true, phone_number: null }))
    }
  }

  eventSource.onerror = () => {
    apiFetch<AgentStatus>('/agent/status')
      .then(s => { if (s.connected) setConnected(s) })
      .catch(() => {})
  }
}

onMounted(async () => {
  try {
    const status = await apiFetch<AgentStatus>('/agent/status')
    if (status.connected) {
      setConnected(status)
      return
    }
  } catch {}

  startQrStream()
})

onUnmounted(() => eventSource?.close())
</script>
