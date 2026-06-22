import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AgentStatusResponse } from '@wavi/shared'
import { apiFetch } from '../lib/api'
import { resolveAgentHealthTier } from '../lib/agent-health'

const POLL_MS = 10_000
const POLL_CONNECTING_MS = 2_000

export const useAgentStore = defineStore('agent', () => {
  const status = ref<AgentStatusResponse | null>(null)
  const polling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let subscribers = 0
  let currentPollMs = POLL_MS

  const connected = computed(() => status.value?.connected ?? false)
  const connecting = computed(() => status.value?.connecting ?? false)
  const phoneNumber = computed(() => status.value?.phone_number ?? null)
  const health = computed(() => status.value?.health ?? null)
  const healthTier = computed(() => resolveAgentHealthTier(status.value))

  async function refresh() {
    try {
      status.value = await apiFetch<AgentStatusResponse>('/agent/status')
    } catch {
      status.value = null
    }
    // Use faster polling while connecting so the dashboard reflects the
    // connected state within ~2s of the WA socket opening.
    if (polling.value) {
      const targetMs = status.value?.connecting ? POLL_CONNECTING_MS : POLL_MS
      if (targetMs !== currentPollMs) {
        currentPollMs = targetMs
        if (timer) clearInterval(timer)
        timer = setInterval(() => void refresh(), targetMs)
      }
    }
  }

  function applyStatus(next: AgentStatusResponse) {
    status.value = next
  }

  function startPolling() {
    subscribers += 1
    if (polling.value) return
    polling.value = true
    currentPollMs = POLL_MS
    void refresh()
    timer = setInterval(() => void refresh(), POLL_MS)
  }

  function stopPolling() {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers > 0 || !polling.value) return
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    polling.value = false
    currentPollMs = POLL_MS
  }

  return {
    status,
    connected,
    connecting,
    phoneNumber,
    health,
    healthTier,
    refresh,
    applyStatus,
    startPolling,
    stopPolling,
  }
})
