<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-secondary">article</span>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('character.summaryTitle') }}</h2>
        </div>
        <p class="mt-1.5 text-[12px] leading-relaxed text-on-surface-variant">
          {{ t('character.summaryHint') }}
        </p>
      </div>
      <button type="button" class="btn btn-primary flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto" :disabled="running" @click="run">
        <span class="material-symbols-outlined text-[16px]" :class="{ 'animate-spin': running }">
          {{ running ? 'sync' : 'play_arrow' }}
        </span>
        {{ running ? t('character.summaryBuilding') : t('character.summaryBuild') }}
      </button>
    </div>

    <p v-if="updatedAgo" class="mt-3 text-[11px] text-on-surface-variant">
      {{ t('character.summaryUpdated', { ago: updatedAgo }) }}
    </p>

    <p v-if="summary" class="mt-3 whitespace-pre-wrap rounded-xl border border-outline-variant/70 bg-surface-variant/20 px-4 py-3 text-[13px] leading-relaxed text-on-surface">
      {{ summary }}
    </p>
    <p v-else-if="!loading && !running" class="mt-3 text-[12px] leading-relaxed text-on-surface-variant">
      {{ t('character.summaryEmpty') }}
    </p>

    <p v-if="done" class="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-secondary">
      <span class="material-symbols-outlined text-[16px]">check_circle</span>
      {{ t('character.summaryDone') }}
    </p>
    <p v-if="error" class="mt-3 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[12px] text-error">
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import { formatRelativeTime } from '../lib/ui';
import type { GroupContext } from '@wavi/shared';

const { t, locale } = useI18n();
const props = defineProps<{ groupId: string }>();

const loading = ref(false);
const running = ref(false);
const done = ref(false);
const error = ref<string | null>(null);
const context = ref<Pick<GroupContext, 'summary_text' | 'generated_at'> | null>(null);

const summary = computed(() => context.value?.summary_text?.trim() || '');
const updatedAgo = computed(() => {
  if (!context.value?.generated_at) return '';
  return formatRelativeTime(context.value.generated_at, locale.value);
});

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch<{ context: GroupContext | null }>(`/groups/${props.groupId}/context`);
    context.value = data?.context ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('character.summaryFailed');
  } finally {
    loading.value = false;
  }
}

async function run() {
  running.value = true;
  done.value = false;
  error.value = null;
  try {
    const result = await apiFetch<{ ok: boolean; context?: Pick<GroupContext, 'summary_text' | 'generated_at'> }>(`/groups/${props.groupId}/sync-context`, { method: 'POST' });
    if (result.context) context.value = result.context;
    else await load();
    done.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('character.summaryFailed');
  } finally {
    running.value = false;
  }
}

onMounted(load);
watch(
  () => props.groupId,
  () => {
    done.value = false;
    error.value = null;
    void load();
  },
);
</script>
