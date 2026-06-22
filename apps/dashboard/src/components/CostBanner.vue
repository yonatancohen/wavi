<template>
  <section class="rounded-xl border p-4" :class="stats?.budget_exceeded ? 'border-error/30 bg-error/[0.06]' : 'border-outline-variant bg-surface-container'">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px]" :class="stats?.budget_exceeded ? 'text-error' : 'text-primary'">payments</span>
        <h3 class="font-sora text-[15px] font-semibold text-on-surface">
          {{ t('cost.title') }}
        </h3>
      </div>
      <span v-if="stats" class="font-mono text-[10px] text-on-surface-variant">{{ stats.month }}</span>
    </div>

    <div v-if="loading" class="text-[13px] text-on-surface-variant">{{ t('loading.default') }}</div>

    <template v-else-if="stats">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('cost.inputTokens') }}</p>
          <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ stats.total_input_tokens.toLocaleString() }}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('cost.outputTokens') }}</p>
          <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ stats.total_output_tokens.toLocaleString() }}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('cost.replies') }}</p>
          <p class="font-mono text-[15px] font-semibold tabular-nums text-on-surface">{{ stats.total_replies.toLocaleString() }}</p>
        </div>
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('cost.estimatedSpend') }}</p>
          <p class="font-mono text-[15px] font-semibold tabular-nums text-primary">${{ stats.spent_usd_estimate.toFixed(2) }}</p>
        </div>
      </div>

      <div v-if="stats.budget_usd != null" class="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span class="text-on-surface-variant">{{ t('cost.budgetCap', { amount: stats.budget_usd.toFixed(2) }) }}</span>
        <span v-if="stats.budget_exceeded" class="rounded-full bg-error/15 px-2.5 py-0.5 font-semibold text-error">
          {{ t('cost.budgetExceeded') }}
        </span>
        <span v-if="stats.auto_paused" class="rounded-full bg-error/15 px-2.5 py-0.5 font-semibold text-error">
          {{ t('cost.autoPaused') }}
        </span>
      </div>

      <div v-if="stats.test_chat.replies > 0" class="mt-4 rounded-lg border border-outline-variant/60 bg-surface-variant/20 px-3 py-2.5">
        <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('cost.testChatTitle') }}</p>
        <p class="mt-1 text-[12px] text-on-surface-variant">
          {{
            t('cost.testChatSummary', {
              replies: stats.test_chat.replies.toLocaleString(),
              tokens: (stats.test_chat.input_tokens + stats.test_chat.output_tokens).toLocaleString(),
              amount: stats.test_chat.spent_usd_estimate.toFixed(2),
            })
          }}
        </p>
      </div>

      <p v-if="loadError" class="mt-3 text-[12px] text-error">{{ loadError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import type { CostStats } from '@wavi/shared';

const { t } = useI18n();

const stats = ref<CostStats | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    stats.value = await apiFetch<CostStats>('/groups/cost');
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('cost.failedLoad');
  } finally {
    loading.value = false;
  }
});
</script>
