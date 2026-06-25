<template>
  <section class="space-y-4">
    <div class="grid grid-cols-2 gap-3 md:grid-cols-2">
      <div class="stat-cell">
        <span class="stat-cell-label">{{ t('usage.live.inFlight') }}</span>
        <span class="stat-cell-value text-secondary">{{ liveInFlight }}</span>
        <p class="mt-1 text-[10px] text-on-surface-variant">
          {{ t('usage.live.split', { processing: liveProcessing, queued: liveQueued, queue: liveQueueDepth }) }}
        </p>
      </div>
      <div class="stat-cell">
        <span class="stat-cell-label">{{ t('usage.live.peakToday') }}</span>
        <span class="stat-cell-value">{{ livePeakToday }}</span>
      </div>
    </div>

    <div class="rounded-xl border p-4" :class="stats?.budget_exceeded ? 'border-error/30 bg-error/[0.06]' : 'border-outline-variant bg-surface-container'">
      <div class="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3" :class="collapsed ? '' : 'mb-4'" @click="collapsed = !collapsed">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]" :class="stats?.budget_exceeded ? 'text-error' : 'text-primary'"> payments </span>
          <h3 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('usage.title') }}</h3>
        </div>
        <div class="flex items-center gap-3" @click.stop>
          <UsagePeriodToggle v-if="!collapsed" v-model="activePeriodId" />
          <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-200" :class="collapsed ? 'rotate-0' : 'rotate-180'"> expand_more </span>
        </div>
      </div>

      <template v-if="!collapsed">
        <div v-if="loading" class="text-[13px] text-on-surface-variant">{{ t('loading.default') }}</div>

        <template v-else-if="stats">
          <div :key="activePeriodId" class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.requests') }}</p>
              <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.requests.toLocaleString() }}</p>
            </div>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.estimatedSpend') }}</p>
              <p class="font-mono text-[15px] font-semibold tabular-nums text-primary">${{ activePeriod.spent_usd_estimate.toFixed(2) }}</p>
            </div>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.inputTokens') }}</p>
              <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.input_tokens.toLocaleString() }}</p>
            </div>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.outputTokens') }}</p>
              <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.output_tokens.toLocaleString() }}</p>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
            <span>
              {{ t('usage.period.avgLatency') }}:
              <span class="font-mono text-on-surface">{{ activePeriod.avg_latency_ms != null ? `${activePeriod.avg_latency_ms}ms` : '—' }}</span>
            </span>
            <span>{{ t('usage.period.weekStartsSunday') }}</span>
          </div>

          <div class="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.breakdown.title') }}</h4>
              <ul class="space-y-2">
                <li
                  v-for="item in activePeriod.breakdown.filter((row) => row.requests > 0)"
                  :key="item.type"
                  class="flex items-center justify-between gap-3 rounded-lg border border-on-surface/[0.05] bg-surface-container-high/40 px-3 py-2"
                >
                  <div class="min-w-0">
                    <p class="text-[12px] font-semibold text-on-surface">{{ t(`usage.breakdown.types.${item.type}`) }}</p>
                    <p class="text-[10px] text-on-surface-variant">
                      {{ t('usage.breakdown.line', { requests: item.requests.toLocaleString(), tokens: (item.input_tokens + item.output_tokens).toLocaleString() }) }}
                    </p>
                  </div>
                  <span class="shrink-0 font-mono text-[12px] font-semibold text-primary">${{ item.spent_usd_estimate.toFixed(2) }}</span>
                </li>
                <li v-if="activePeriod.breakdown.every((row) => row.requests === 0)" class="text-[12px] text-on-surface-variant">
                  {{ t('usage.breakdown.empty') }}
                </li>
              </ul>
            </div>

            <div class="space-y-4">
              <div v-if="activePeriodId === 'month'">
                <h4 class="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.topGroups.title') }}</h4>
                <ul v-if="stats.top_groups.length" class="space-y-2">
                  <li
                    v-for="(group, index) in stats.top_groups"
                    :key="group.group_id"
                    class="flex items-center justify-between gap-3 rounded-lg border border-on-surface/[0.05] bg-surface-container-high/40 px-3 py-2"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-[12px] font-semibold text-on-surface">#{{ index + 1 }} {{ group.group_name }}</p>
                      <p class="text-[10px] text-on-surface-variant">
                        {{ t('usage.topGroups.line', { requests: group.requests.toLocaleString(), tokens: (group.input_tokens + group.output_tokens).toLocaleString() }) }}
                      </p>
                    </div>
                    <span class="shrink-0 font-mono text-[12px] font-semibold text-primary">${{ group.spent_usd_estimate.toFixed(2) }}</span>
                  </li>
                </ul>
                <p v-else class="text-[12px] text-on-surface-variant">{{ t('usage.topGroups.empty') }}</p>
              </div>

              <div v-if="activePeriodId === 'month'" class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-on-surface/[0.05] bg-surface-container-high/40 p-3">
                  <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.extremes.min') }}</p>
                  <template v-if="stats.min_reply">
                    <p class="mt-1 font-mono text-[14px] font-semibold tabular-nums">{{ stats.min_reply.total_tokens.toLocaleString() }}</p>
                    <p class="text-[10px] text-on-surface-variant">${{ stats.min_reply.spent_usd_estimate.toFixed(2) }}</p>
                  </template>
                  <p v-else class="mt-1 text-[12px] text-on-surface-variant">—</p>
                </div>
                <div class="rounded-lg border border-on-surface/[0.05] bg-surface-container-high/40 p-3">
                  <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.extremes.max') }}</p>
                  <template v-if="stats.max_reply">
                    <p class="mt-1 font-mono text-[14px] font-semibold tabular-nums">{{ stats.max_reply.total_tokens.toLocaleString() }}</p>
                    <p class="text-[10px] text-on-surface-variant">${{ stats.max_reply.spent_usd_estimate.toFixed(2) }}</p>
                  </template>
                  <p v-else class="mt-1 text-[12px] text-on-surface-variant">—</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="stats.budget_usd != null" class="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span class="text-on-surface-variant">{{ t('cost.budgetCap', { amount: stats.budget_usd.toFixed(2) }) }}</span>
            <span v-if="stats.budget_exceeded" class="rounded-full bg-error/15 px-2.5 py-0.5 font-semibold text-error">{{ t('cost.budgetExceeded') }}</span>
            <span v-if="stats.auto_paused" class="rounded-full bg-error/15 px-2.5 py-0.5 font-semibold text-error">{{ t('cost.autoPaused') }}</span>
          </div>
        </template>

        <p v-if="loadError" class="mt-3 text-[12px] text-error">{{ loadError }}</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { apiFetch } from '../lib/api';
import { useFlowsStore } from '../stores/flows';
import { useUsagePeriod } from '../composables/useUsagePeriod';
import UsagePeriodToggle from './UsagePeriodToggle.vue';
import type { AgentUsageStats } from '@wavi/shared';

const { t } = useI18n();
const flowsStore = useFlowsStore();
const { total: liveInFlight, flows: liveFlows, queueDepth: liveQueueDepth, peakInflightToday: livePeakToday } = storeToRefs(flowsStore);

const stats = ref<AgentUsageStats | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const collapsed = ref(true);
const { activePeriodId, activePeriod } = useUsagePeriod(stats);

const liveProcessing = computed(() => liveFlows.value.filter((flow) => flow.status === 'processing').length);
const liveQueued = computed(() => liveFlows.value.filter((flow) => flow.status === 'queued').length);

onMounted(async () => {
  flowsStore.startPolling();
  try {
    stats.value = await apiFetch<AgentUsageStats>('/groups/usage');
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('usage.failedLoad');
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  flowsStore.stopPolling();
});
</script>
