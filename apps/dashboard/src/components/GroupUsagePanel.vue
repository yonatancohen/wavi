<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-5">
    <div class="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none" :class="collapsed ? '' : 'mb-4'" @click="collapsed = !collapsed">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-primary">monitoring</span>
        <h3 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('usage.groupTitle') }}</h3>
      </div>
      <div class="flex items-center gap-3" @click.stop>
        <UsagePeriodToggle v-if="!collapsed" v-model="activePeriodId" />
        <span class="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-200" :class="collapsed ? 'rotate-0' : 'rotate-180'">expand_more</span>
      </div>
    </div>

    <template v-if="!collapsed">
      <div v-if="loading" class="text-[13px] text-on-surface-variant">{{ t('loading.default') }}</div>

      <template v-else-if="stats">
        <div :key="activePeriodId" class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.requests') }}</p>
            <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.requests.toLocaleString() }}</p>
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.inputTokens') }}</p>
            <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.input_tokens.toLocaleString() }}</p>
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.outputTokens') }}</p>
            <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ activePeriod.output_tokens.toLocaleString() }}</p>
          </div>
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('usage.period.estimatedSpend') }}</p>
            <p class="font-mono text-[15px] font-semibold tabular-nums text-primary">${{ activePeriod.spent_usd_estimate.toFixed(2) }}</p>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
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

          <div class="grid grid-cols-2 gap-3">
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
            <p class="col-span-2 text-[10px] text-on-surface-variant/70">{{ t('usage.extremes.allTimeNote') }}</p>
          </div>
        </div>
      </template>

      <p v-if="loadError" class="text-[12px] text-error">{{ loadError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import { useUsagePeriod } from '../composables/useUsagePeriod';
import UsagePeriodToggle from './UsagePeriodToggle.vue';
import type { GroupUsageStats } from '@wavi/shared';

const props = defineProps<{
  groupId: string;
}>();

const { t } = useI18n();
const stats = ref<GroupUsageStats | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const collapsed = ref(true);
const { activePeriodId, activePeriod } = useUsagePeriod(stats);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    stats.value = await apiFetch<GroupUsageStats>(`/groups/${props.groupId}/usage`);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('usage.failedLoad');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.groupId, load);
</script>
