<template>
  <div
    class="flex items-center gap-1.5 rounded-full border"
    :class="[
      compact ? 'px-2 py-1' : 'px-2.5 py-1',
      badgeClass,
    ]"
    :title="tooltip"
  >
    <div
      class="rounded-full"
      :class="[
        compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
        dotClass,
      ]"
    />
    <span
      class="font-mono font-semibold uppercase tracking-widest"
      :class="compact ? 'text-[9px]' : 'text-[10px]'"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useAgentStore } from '../stores/agent'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t } = useI18n()
const agentStore = useAgentStore()
const { healthTier, connected, connecting, health } = storeToRefs(agentStore)

const label = computed(() => {
  switch (healthTier.value) {
    case 'healthy':
      return t('status.online')
    case 'degraded':
      return t('status.degraded')
    case 'connecting':
      return t('status.connecting')
    default:
      return t('status.offline')
  }
})

const tooltip = computed(() => {
  if (healthTier.value === 'degraded' && health.value) {
    const parts = [t('status.degradedHint')]
    if (health.value.restart_in_progress) {
      parts.push(t('status.health.restarting'))
    }
    if (health.value.consecutive_cdp_failures > 0) {
      parts.push(t('status.health.cdpFailures', { count: health.value.consecutive_cdp_failures }))
    }
    return parts.join(' · ')
  }
  if (connecting.value) return t('status.connectingHint')
  if (connected.value) return t('status.connected')
  return t('status.offline')
})

const badgeClass = computed(() => {
  switch (healthTier.value) {
    case 'healthy':
      return 'border-primary/20 bg-primary/[0.07] text-primary'
    case 'degraded':
      return 'border-secondary/30 bg-secondary/[0.10] text-secondary'
    case 'connecting':
      return 'border-tertiary/30 bg-tertiary/[0.12] text-on-surface'
    default:
      return 'border-error/20 bg-error/[0.07] text-error'
  }
})

const dotClass = computed(() => {
  switch (healthTier.value) {
    case 'healthy':
      return 'animate-status-pulse bg-primary'
    case 'degraded':
      return 'animate-status-pulse bg-secondary'
    case 'connecting':
      return 'animate-status-pulse bg-tertiary'
    default:
      return 'bg-error'
  }
})
</script>
