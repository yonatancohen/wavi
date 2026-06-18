<template>
  <div class="view">
    <div class="topbar">
      <div>
        <div class="page-title">Connect WhatsApp</div>
        <div class="page-sub">Scan the QR code with your WhatsApp to connect the agent</div>
      </div>
      <div class="badge" :class="connected ? 'badge-on' : 'badge-off'">
        {{ connected ? '● Connected' : '○ Disconnected' }}
      </div>
    </div>

    <div class="content">
      <div class="qr-card">
        <template v-if="connected">
          <div class="connected-state">
            <div class="check">✓</div>
            <div class="connected-title">WhatsApp Connected</div>
            <div class="connected-sub">Phone: +{{ phoneNumber }}</div>
          </div>
        </template>

        <template v-else-if="qrDataUrl">
          <div class="qr-label">Scan with WhatsApp → Linked Devices → Link a Device</div>
          <img :src="qrDataUrl" class="qr-img" alt="WhatsApp QR Code" />
          <div class="qr-sub">QR refreshes automatically · do not share this code</div>
        </template>

        <template v-else>
          <div class="qr-loading">
            <div class="spinner" />
            <div>Generating QR code...</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const qrDataUrl  = ref<string | null>(null)
const connected  = ref(false)
const phoneNumber = ref<string | null>(null)
let eventSource: EventSource | null = null

onMounted(() => {
  const API = import.meta.env.VITE_API_URL ?? '/api'
  eventSource = new EventSource(`${API}/agent/qr`)

  eventSource.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'qr') {
      qrDataUrl.value = msg.data
    } else if (msg.type === 'authenticated') {
      connected.value = true
      qrDataUrl.value = null
      eventSource?.close()
      // Fetch phone number
      fetch(`${API}/agent/status`)
        .then(r => r.json())
        .then(s => { phoneNumber.value = s.phone_number })
    }
  }

  eventSource.onerror = () => {
    // Check if already connected
    fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/agent/status`)
      .then(r => r.json())
      .then(s => {
        if (s.connected) {
          connected.value = true
          phoneNumber.value = s.phone_number
        }
      })
  }
})

onUnmounted(() => eventSource?.close())
</script>

<style scoped>
.view { display: flex; flex-direction: column; height: 100vh; }
.topbar {
  height: 60px; border-bottom: 1px solid var(--border);
  padding: 0 28px; display: flex; align-items: center;
  justify-content: space-between; background: var(--surface);
}
.page-title { font-size: 15px; font-weight: 600; }
.page-sub   { font-size: 12px; color: var(--muted); margin-top: 1px; }
.badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.badge-on  { background: rgba(37,211,102,.12); color: var(--wa); border: 1px solid rgba(37,211,102,.3); }
.badge-off { background: rgba(255,95,95,.12); color: var(--danger); border: 1px solid rgba(255,95,95,.3); }
.content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; }
.qr-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 40px; text-align: center;
  min-width: 320px;
}
.qr-label { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
.qr-img { width: 260px; height: 260px; border-radius: 12px; display: block; margin: 0 auto; }
.qr-sub { font-size: 11px; color: var(--muted); margin-top: 16px; }
.qr-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--muted); }
.spinner {
  width: 32px; height: 32px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.connected-state { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.check { font-size: 48px; color: var(--wa); }
.connected-title { font-size: 18px; font-weight: 600; }
.connected-sub { font-size: 13px; color: var(--muted); }
</style>
