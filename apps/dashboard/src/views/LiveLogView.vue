<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header flex min-h-14 items-center justify-between gap-4">
      <div class="hidden min-w-0 lg:block">
        <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
          {{ t('liveLog.title') }}
        </h1>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">
          {{ t('liveLog.subtitle') }}
        </p>
      </div>
      <button type="button" class="btn btn-secondary ms-auto flex shrink-0 items-center gap-2" :disabled="loading" @click="refresh">
        <span class="material-symbols-outlined text-[16px]" :class="loading ? 'animate-spin' : ''">refresh</span>
        {{ t('liveLog.refresh') }}
      </button>
    </header>

    <div class="page-content py-7">
      <div class="mb-5 rounded-xl border border-outline-variant bg-surface-container p-4">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="status.iconBg">
            <span class="material-symbols-outlined text-[18px]" :class="status.iconColor">{{ status.icon }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <h2 class="text-[13px] font-semibold text-on-surface">{{ status.title }}</h2>
              <span class="rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide" :class="statusToneClass">
                {{ t(`liveLog.tone.${status.tone}`) }}
              </span>
            </div>
            <p class="text-[12px] leading-relaxed text-on-surface-variant">{{ status.body }}</p>
          </div>
        </div>

        <ActiveFlowsIndicator v-if="activeFlowTotal > 0" class="mt-4" :total="activeFlowTotal" :flows="activeFlows" />
      </div>

      <LoadingSkeletons v-if="loading && entries.length === 0" variant="activity-list" :count="5" />

      <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
        {{ error }}
      </div>

      <div v-else-if="entries.length === 0" class="mx-auto mt-12 max-w-[520px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-2xl text-primary">terminal</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-[18px] font-semibold text-on-surface">
          {{ t('liveLog.empty.title') }}
        </h2>
        <p class="text-[13px] leading-relaxed text-on-surface-variant">
          {{ t('liveLog.empty.body') }}
        </p>
      </div>

      <div v-else class="rounded-xl border border-outline-variant bg-surface-container">
        <div class="flex items-center justify-between border-b border-outline-variant px-5 py-3">
          <span class="font-mono text-[11px] text-on-surface-variant">
            {{ t('liveLog.count', entries.length) }}
          </span>
          <span class="flex items-center gap-1.5 font-mono text-[10px] text-primary">
            <span class="h-1.5 w-1.5 animate-status-pulse rounded-full bg-primary" />
            {{ t('liveLog.live') }}
          </span>
        </div>

        <div class="divide-y divide-on-surface/[0.04]">
          <div v-for="entry in entries" :key="entry.id" class="log-row px-5">
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="entry.iconBg">
              <span class="material-symbols-outlined text-[15px]" :class="entry.iconColor">{{ entry.icon }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-[13px] font-semibold text-on-surface">{{ entry.title }}</h3>
                  <span class="rounded-full border border-outline-variant/80 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    {{ entry.kind === 'flow' ? t('liveLog.kindFlow') : t('liveLog.kindReply') }}
                  </span>
                </div>
                <span class="log-timestamp">{{ entry.timeLabel }}</span>
              </div>
              <p class="text-[13px] leading-relaxed text-on-surface">{{ entry.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useLiveLog } from '../composables/useLiveLog';
import { useFlowsStore } from '../stores/flows';
import LoadingSkeletons from '../components/LoadingSkeletons.vue';
import ActiveFlowsIndicator from '../components/ActiveFlowsIndicator.vue';

const REFRESH_MS = 30_000;

const { t } = useI18n();
const { status, entries, activeFlowTotal, loading, refresh } = useLiveLog();
const flowsStore = useFlowsStore();
const { flows: activeFlows } = storeToRefs(flowsStore);
const error = ref<string | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const statusToneClass = computed(() => {
  const map = {
    healthy: 'bg-primary/10 text-primary border border-primary/20',
    degraded: 'bg-secondary/10 text-secondary border border-secondary/20',
    connecting: 'bg-tertiary/10 text-tertiary border border-tertiary/20',
    offline: 'bg-error/10 text-error border border-error/20',
  };
  return map[status.value.tone];
});

async function loadLog() {
  error.value = null;
  try {
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('liveLog.failedLoad');
  }
}

onMounted(() => {
  void loadLog();
  refreshTimer = setInterval(() => void loadLog(), REFRESH_MS);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>
