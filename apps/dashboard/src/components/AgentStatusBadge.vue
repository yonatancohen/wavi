<template>
  <div ref="wrapperRef" class="relative inline-flex" @mouseenter="onEnter" @mouseleave="show = false">
    <!-- Badge -->
    <div
      class="flex items-center gap-1.5 rounded-full border cursor-default"
      :class="[
        compact ? 'px-2 py-1' : 'px-2.5 py-1',
        badgeClass,
      ]"
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

    <!-- Tooltip -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      :enter-from-class="showBelow ? 'opacity-0 -translate-y-1 scale-95' : 'opacity-0 translate-y-1 scale-95'"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      :leave-to-class="showBelow ? 'opacity-0 -translate-y-1 scale-95' : 'opacity-0 translate-y-1 scale-95'"
    >
      <div
        v-if="show"
        class="absolute z-50 w-56 rounded-xl border border-outline-variant bg-surface-container-highest shadow-[0_8px_32px_rgba(0,0,0,0.25)] pointer-events-none"
        :class="showBelow ? 'top-full mt-2' : 'bottom-full mb-2'"
        :style="tooltipStyle"
      >
        <!-- Arrow: points toward the badge -->
        <div
          class="absolute h-2.5 w-2.5 rounded-sm border-outline-variant bg-surface-container-highest"
          :class="showBelow
            ? '-top-[5px] rounded-tl-sm border-t border-l'
            : '-bottom-[5px] rounded-br-sm border-b border-r'"
          :style="arrowStyle"
        />

        <div class="p-3">
          <!-- Header row -->
          <div class="mb-2 flex items-center gap-2">
            <div class="h-2 w-2 rounded-full" :class="dotClass" />
            <span class="font-sora text-[12px] font-semibold text-on-surface">{{ tooltipTitle }}</span>
          </div>

          <!-- Body lines -->
          <p class="text-[11px] leading-relaxed text-on-surface-variant">{{ tooltipBody }}</p>

          <!-- Extra detail rows for degraded state -->
          <template v-if="healthTier === 'degraded' && health">
            <div class="mt-2.5 space-y-1.5 border-t border-outline-variant/60 pt-2.5">
              <div
                v-for="row in degradedDetails"
                :key="row.label"
                class="flex items-center justify-between gap-3"
              >
                <span class="text-[10px] text-on-surface-variant">{{ row.label }}</span>
                <span class="font-mono text-[10px] font-semibold" :class="row.color">{{ row.value }}</span>
              </div>
            </div>
          </template>

          <!-- Phone number for healthy -->
          <div
            v-if="healthTier === 'healthy' && phoneNumber"
            class="mt-2.5 border-t border-outline-variant/60 pt-2.5"
          >
            <span class="font-mono text-[10px] text-on-surface-variant">{{ phoneNumber }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useAgentStore } from '../stores/agent'
import { formatStuckDuration, formatRelativeTime } from '../lib/agent-health'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t } = useI18n()
const agentStore = useAgentStore()
const { healthTier, connected, connecting, health, phoneNumber } = storeToRefs(agentStore)

const show = ref(false)
const showBelow = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const TOOLTIP_WIDTH = 224 // w-56 = 14rem = 224px
const VIEWPORT_MARGIN = 8
const ESTIMATED_TOOLTIP_HEIGHT = 150

const tooltipLeft = ref(0)
const arrowLeft = ref(0)

function onEnter() {
  if (wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect()

    // Flip below when not enough space above
    showBelow.value = rect.top < ESTIMATED_TOOLTIP_HEIGHT + VIEWPORT_MARGIN

    const badgeCenterX = rect.left + rect.width / 2
    const idealLeft = badgeCenterX - TOOLTIP_WIDTH / 2
    const clampedLeft = Math.max(
      VIEWPORT_MARGIN,
      Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN),
    )
    tooltipLeft.value = clampedLeft - rect.left
    arrowLeft.value = badgeCenterX - clampedLeft
  }
  show.value = true
}

const tooltipStyle = computed(() => ({
  left: `${tooltipLeft.value}px`,
}))

const arrowStyle = computed(() => ({
  left: `${arrowLeft.value}px`,
  transform: `translateX(-50%) rotate(${showBelow.value ? 225 : 45}deg)`,
}))

const label = computed(() => {
  switch (healthTier.value) {
    case 'healthy':    return t('status.online')
    case 'degraded':   return t('status.degraded')
    case 'connecting': return t('status.connecting')
    default:           return t('status.offline')
  }
})

const tooltipTitle = computed(() => {
  switch (healthTier.value) {
    case 'healthy':    return t('status.tooltip.healthyTitle')
    case 'degraded':   return t('status.tooltip.degradedTitle')
    case 'connecting': return t('status.tooltip.connectingTitle')
    default:           return t('status.tooltip.offlineTitle')
  }
})

const tooltipBody = computed(() => {
  switch (healthTier.value) {
    case 'healthy':    return t('status.tooltip.healthyBody')
    case 'degraded':   return t('status.tooltip.degradedBody')
    case 'connecting': return t('status.tooltip.connectingBody')
    default:           return t('status.tooltip.offlineBody')
  }
})

const degradedDetails = computed(() => {
  const h = health.value
  if (!h) return []
  const rows: Array<{ label: string; value: string; color: string }> = []

  rows.push({
    label: t('status.tooltip.cdpFailures'),
    value: String(h.consecutive_cdp_failures),
    color: h.consecutive_cdp_failures > 0 ? 'text-secondary' : 'text-primary',
  })

  if (h.cdp_op_in_flight && h.cdp_op_stuck_ms > 0) {
    rows.push({
      label: t('status.tooltip.stuckOp'),
      value: formatStuckDuration(h.cdp_op_stuck_ms),
      color: 'text-secondary',
    })
  }

  if (h.restart_in_progress) {
    rows.push({
      label: t('status.tooltip.restart'),
      value: t('status.tooltip.restartActive'),
      color: 'text-secondary',
    })
  } else if (h.last_forced_restart_at) {
    rows.push({
      label: t('status.tooltip.lastRestart'),
      value: formatRelativeTime(h.last_forced_restart_at) + ' ago',
      color: 'text-on-surface-variant',
    })
  }

  return rows
})

const badgeClass = computed(() => {
  switch (healthTier.value) {
    case 'healthy':    return 'border-primary/20 bg-primary/[0.07] text-primary'
    case 'degraded':   return 'border-secondary/30 bg-secondary/[0.10] text-secondary'
    case 'connecting': return 'border-tertiary/30 bg-tertiary/[0.12] text-on-surface'
    default:           return 'border-error/20 bg-error/[0.07] text-error'
  }
})

const dotClass = computed(() => {
  switch (healthTier.value) {
    case 'healthy':    return 'animate-status-pulse bg-primary'
    case 'degraded':   return 'animate-status-pulse bg-secondary'
    case 'connecting': return 'animate-status-pulse bg-tertiary'
    default:           return 'bg-error'
  }
})
</script>
