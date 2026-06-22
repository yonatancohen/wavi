<template>
  <div class="flex flex-col rounded-xl border border-outline-variant bg-surface-container p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-primary">monitor_heart</span>
        <h3 class="font-sora text-[15px] font-semibold text-on-surface">
          {{ t('dashboard.health.title') }}
        </h3>
      </div>
      <AgentStatusBadge />
    </div>

    <div v-if="!connected && !connecting" class="rounded-lg border border-outline-variant/60 bg-surface-container-high/40 p-4">
      <p class="text-[13px] text-on-surface-variant">{{ t('dashboard.health.offline') }}</p>
      <RouterLink to="/connect" class="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-primary no-underline hover:underline">
        {{ t('dashboard.health.goConnect') }}
        <span class="material-symbols-outlined text-[14px] [dir=rtl]:scale-x-[-1]">arrow_forward</span>
      </RouterLink>
    </div>

    <dl v-else class="flex flex-1 flex-col gap-2.5">
      <div v-for="row in rows" :key="row.key" class="flex items-start justify-between gap-3 rounded-lg border border-on-surface/[0.05] bg-surface-container-high/35 px-3 py-2.5">
        <dt class="text-[11px] font-medium text-on-surface-variant">{{ row.label }}</dt>
        <dd class="text-end font-mono text-[11px] font-semibold" :class="row.toneClass">
          {{ row.value }}
        </dd>
      </div>
    </dl>

    <p v-if="healthTier === 'degraded'" class="mt-3 text-[11px] leading-relaxed text-on-surface-variant">
      {{ t('dashboard.health.degradedNote') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useAgentStore } from '../stores/agent';
import { formatRelativeTime, formatStuckDuration } from '../lib/agent-health';
import AgentStatusBadge from './AgentStatusBadge.vue';

const { t } = useI18n();
const agentStore = useAgentStore();
const { status, connected, connecting, health, healthTier, phoneNumber } = storeToRefs(agentStore);

const rows = computed(() => {
  const h = health.value;
  const items: Array<{ key: string; label: string; value: string; toneClass: string }> = [];

  items.push({
    key: 'session',
    label: t('dashboard.health.session'),
    value: status.value?.state ?? '—',
    toneClass: connected.value ? 'text-primary' : 'text-on-surface',
  });

  if (phoneNumber.value) {
    items.push({
      key: 'phone',
      label: t('dashboard.health.phone'),
      value: phoneNumber.value,
      toneClass: 'text-on-surface',
    });
  }

  if (!h) return items;

  items.push({
    key: 'cdp_failures',
    label: t('dashboard.health.cdpFailures'),
    value: String(h.consecutive_cdp_failures),
    toneClass: h.consecutive_cdp_failures > 0 ? 'text-secondary' : 'text-primary',
  });

  items.push({
    key: 'cdp_op',
    label: t('dashboard.health.cdpOp'),
    value: h.cdp_op_in_flight
      ? h.cdp_op_stuck_ms > 0
        ? t('dashboard.health.cdpOpStuck', { duration: formatStuckDuration(h.cdp_op_stuck_ms) })
        : t('dashboard.health.cdpOpActive')
      : t('dashboard.health.cdpOpIdle'),
    toneClass: h.cdp_op_stuck_ms >= 10_000 ? 'text-secondary' : 'text-on-surface',
  });

  items.push({
    key: 'restart',
    label: t('dashboard.health.restart'),
    value: h.restart_in_progress
      ? t('dashboard.health.restarting')
      : h.last_forced_restart_at
        ? t('dashboard.health.lastRestart', {
            ago: formatRelativeTime(h.last_forced_restart_at) ?? '—',
          })
        : t('dashboard.health.noRestart'),
    toneClass: h.restart_in_progress ? 'text-secondary' : 'text-on-surface-variant',
  });

  return items;
});
</script>
