<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header hidden lg:block">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('activity.title') }}
      </h1>
      <p class="mt-0.5 text-[12px] text-on-surface-variant">
        {{ t('activity.subtitle') }}
      </p>
    </header>

    <!-- Sticky filter bar -->
    <div
      v-if="!loading && !error"
      class="sticky top-0 z-[5] flex flex-wrap items-center gap-3 border-b border-outline-variant px-margin-mobile py-2.5 lg:top-14 lg:px-margin-desktop"
      style="background-color: color-mix(in srgb, rgb(var(--color-surface)) 95%, transparent); backdrop-filter: blur(8px)"
    >
      <select
        v-model="selectedGroupId"
        class="h-9 rounded-xl border border-outline-variant bg-surface-variant/20 px-3 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
      >
        <option value="">{{ t('activity.allGroups') }}</option>
        <option v-for="group in groups" :key="group.id" :value="group.id">
          {{ group.name }}
        </option>
      </select>

      <label class="flex cursor-pointer items-center gap-2">
        <input v-model="flaggedOnly" type="checkbox" class="rounded border-outline-variant" />
        <span class="text-[13px] text-on-surface-variant">{{ t('activity.flaggedOnly') }}</span>
      </label>
      <HelpTooltip :title="t('activity.flaggedOnlyTooltipTitle')" :body="t('activity.flaggedOnlyTooltipBody')">
        <button type="button" class="icon-btn !min-h-0 p-0.5 text-on-surface-variant/60" :aria-label="t('activity.flaggedOnlyTooltipTitle')">
          <span class="material-symbols-outlined text-[16px]">help</span>
        </button>
      </HelpTooltip>

      <button v-if="hasActiveFilters" type="button" class="btn btn-secondary !min-h-0 px-3 py-2 text-[12px]" @click="clearFilters">
        {{ t('activity.clearFilters') }}
      </button>
    </div>

    <div class="page-content py-7">
      <ActiveFlowsIndicator v-if="activeFlowTotal > 0" class="mb-5" :total="activeFlowTotal" :flows="activeFlows" />

      <LoadingSkeletons v-if="loading" variant="activity-list" :count="4" />

      <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
        {{ error }}
      </div>

      <div v-else-if="items.length === 0 && !hasActiveFilters" class="mx-auto mt-16 max-w-[520px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-2xl text-primary">history</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-[18px] font-semibold text-on-surface">
          {{ t('activity.empty.title') }}
        </h2>
        <p class="mb-6 text-[13px] leading-relaxed text-on-surface-variant">
          {{ t('activity.empty.body') }}
        </p>
        <RouterLink to="/groups" class="btn btn-primary">{{ t('activity.empty.cta') }}</RouterLink>
      </div>

      <div v-else-if="items.length === 0 && hasActiveFilters" class="rounded-xl border border-outline-variant bg-surface-container px-6 py-10 text-center">
        <p class="mb-4 text-[13px] text-on-surface-variant">
          {{ t('activity.emptyFiltered') }}
        </p>
        <button type="button" class="btn btn-secondary !min-h-0 px-4 py-2 text-[12px]" @click="clearFilters">
          {{ t('activity.clearFilters') }}
        </button>
      </div>

      <div v-else class="rounded-xl border border-outline-variant bg-surface-container">
        <div class="border-b border-outline-variant px-5 py-3">
          <span class="font-mono text-[11px] text-on-surface-variant">
            {{ t('activity.count', items.length) }}
          </span>
        </div>

        <div class="divide-y divide-on-surface/[0.04]">
          <div v-for="item in items" :key="item.id" class="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-on-surface/[0.02]">
            <!-- Icon -->
            <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" :class="item.flagged ? 'bg-error/15' : 'bg-primary/15'">
              <span class="material-symbols-outlined text-[15px]" :class="item.flagged ? 'text-error' : 'text-primary'">{{ item.flagged ? 'flag' : 'smart_toy' }}</span>
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <div class="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-[13px] font-semibold text-primary">{{ item.groupName }}</h3>
                  <span v-if="item.flagged" class="rounded-full border border-error/20 bg-error/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error">
                    {{ t('activity.flagged') }}
                  </span>
                </div>
                <span class="log-timestamp">{{ item.time }}</span>
              </div>

              <p v-if="item.trigger" class="mb-1.5 text-[12px] text-on-surface-variant">
                {{ t('activity.triggeredBy') }}
                <span class="text-on-surface">{{ item.trigger }}</span>
                <span v-if="item.triggerMessage" class="italic"> — "{{ item.triggerMessage }}"</span>
              </p>

              <p class="text-[13px] leading-relaxed text-on-surface">{{ item.body }}</p>

              <div v-if="item.imageUrl" class="mt-2.5 overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-variant/10">
                <img :src="item.imageUrl" :alt="t('activity.replyImageAlt')" class="max-h-40 w-auto max-w-full object-contain" loading="lazy" />
              </div>

              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div class="flex gap-4 font-mono text-[10px] text-on-surface-variant/60">
                  <span>{{ item.latency }}ms</span>
                  <span>{{ item.tokens }} tok</span>
                </div>
                <HelpTooltip
                  :title="item.flagged ? t('activity.revertFlagTooltipTitle') : t('activity.flagAsMissTooltipTitle')"
                  :body="item.flagged ? t('activity.revertFlagTooltipBody') : t('activity.flagAsMissTooltipBody')"
                >
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                    :class="item.flagged ? 'border-outline-variant text-on-surface-variant hover:bg-on-surface/[0.04]' : 'border-error/30 text-error hover:bg-error/[0.08]'"
                    :disabled="flaggingId === item.id"
                    @click="toggleFlag(item)"
                  >
                    <span class="material-symbols-outlined text-[14px]">{{ item.flagged ? 'undo' : 'flag' }}</span>
                    {{ flaggingId === item.id ? t('activity.flagging') : item.flagged ? t('activity.revertFlag') : t('activity.flagAsMiss') }}
                  </button>
                </HelpTooltip>
              </div>
            </div>
          </div>
        </div>

        <!-- load-more sentinel + inline skeleton rows -->
        <template v-if="store.hasMore">
          <div v-if="store.loadingMore" class="divide-y divide-on-surface/[0.04]">
            <div v-for="i in 3" :key="i" class="flex items-start gap-4 px-5 py-4 opacity-60">
              <div class="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-lg bg-on-surface/10" />
              <div class="min-w-0 flex-1 space-y-2 pt-1">
                <div class="h-3 w-1/3 animate-pulse rounded bg-on-surface/10" />
                <div class="h-3 w-full animate-pulse rounded bg-on-surface/10" />
                <div class="h-3 w-4/5 animate-pulse rounded bg-on-surface/10" />
              </div>
            </div>
          </div>
          <div ref="sentinel" class="h-1" aria-hidden="true" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useRepliesStore } from '../stores/replies';
import { useGroupsStore } from '../stores/groups';
import { useFlowsStore } from '../stores/flows';
import { formatRelativeTime } from '../lib/ui';
import LoadingSkeletons from '../components/LoadingSkeletons.vue';
import ActiveFlowsIndicator from '../components/ActiveFlowsIndicator.vue';
import HelpTooltip from '../components/HelpTooltip.vue';
import type { Reply } from '@wavi/shared';

const { t, locale } = useI18n();

type ReplyRow = Reply & {
  messages?: { sender_name?: string; body?: string } | null;
  groups?: { name?: string } | null;
};

const store = useRepliesStore();
const groupsStore = useGroupsStore();
const flowsStore = useFlowsStore();
const { groups } = storeToRefs(groupsStore);
const { total: activeFlowTotal, flows: activeFlows } = storeToRefs(flowsStore);
const error = ref<string | null>(null);
const selectedGroupId = ref('');
const flaggedOnly = ref(false);
const flaggingId = ref<string | null>(null);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const loading = computed(() => store.loading);
const hasActiveFilters = computed(() => selectedGroupId.value !== '' || flaggedOnly.value);

const items = computed(() =>
  store.replies.map((reply) => {
    const row = reply as ReplyRow;
    const groupName = row.group_name ?? row.groups?.name ?? 'Unknown group';
    const trigger = row.triggered_by_name ?? row.messages?.sender_name;
    const triggerMessage = row.triggered_by_message ?? row.messages?.body;

    return {
      id: reply.id,
      groupName,
      body: reply.body,
      imageUrl: reply.image_url ?? null,
      trigger,
      triggerMessage: triggerMessage && triggerMessage.length > 120 ? `${triggerMessage.slice(0, 120)}…` : triggerMessage,
      time: formatRelativeTime(reply.created_at, locale.value),
      latency: reply.latency_ms,
      tokens: reply.prompt_tokens + reply.completion_tokens,
      flagged: reply.flagged_miss,
    };
  }),
);

function attachObserver() {
  observer?.disconnect();
  if (!sentinel.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) store.loadMore();
    },
    { rootMargin: '300px' },
  );
  observer.observe(sentinel.value);
}

async function toggleFlag(item: { id: string; flagged: boolean }) {
  flaggingId.value = item.id;
  error.value = null;
  try {
    await store.flagMiss(item.id, !item.flagged);
    if (flaggedOnly.value && item.flagged) {
      await loadActivity();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('activity.failedFlag');
  } finally {
    flaggingId.value = null;
  }
}

async function loadActivity() {
  error.value = null;
  try {
    await store.fetchReplies({
      groupId: selectedGroupId.value || undefined,
      flagged: flaggedOnly.value || undefined,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('activity.failedLoad');
  }
}

function clearFilters() {
  selectedGroupId.value = '';
  flaggedOnly.value = false;
}

// Re-attach observer whenever sentinel mounts/unmounts (toggled by hasMore)
watch(sentinel, (el) => {
  if (el) attachObserver();
  else observer?.disconnect();
});

watch([selectedGroupId, flaggedOnly], loadActivity);

onMounted(async () => {
  if (groups.value.length === 0) {
    await groupsStore.fetchGroups();
  }
  await loadActivity();
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>
