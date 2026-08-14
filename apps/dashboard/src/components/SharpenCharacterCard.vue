<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-tertiary">auto_fix_high</span>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('character.sharpenTitle') }}</h2>
        </div>
        <p class="mt-1.5 text-[12px] leading-relaxed text-on-surface-variant">
          {{ t('character.sharpenHint') }}
        </p>
      </div>
      <button type="button" class="btn btn-primary flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto" :disabled="running" @click="run">
        <span class="material-symbols-outlined text-[16px]" :class="{ 'animate-spin': running }">
          {{ running ? 'sync' : 'play_arrow' }}
        </span>
        {{ running ? t('character.sharpening') : t('character.sharpen') }}
      </button>
    </div>

    <p v-if="done" class="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-secondary">
      <span class="material-symbols-outlined text-[16px]">check_circle</span>
      {{ t('character.sharpenDone') }}
    </p>
    <p v-if="warning" class="mt-3 rounded-xl border border-tertiary/25 bg-tertiary/[0.07] px-4 py-3 text-[12px] leading-relaxed text-on-surface">
      {{ warning }}
    </p>
    <p v-if="error" class="mt-3 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[12px] text-error">
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import { useGroupsStore } from '../stores/groups';
import type { GroupWithStats } from '@wavi/shared';

const { t } = useI18n();
const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ updated: [group: GroupWithStats] }>();
const store = useGroupsStore();

const running = ref(false);
const done = ref(false);
const error = ref<string | null>(null);
const warning = ref<string | null>(null);

async function run() {
  running.value = true;
  done.value = false;
  error.value = null;
  warning.value = null;
  try {
    const result = await apiFetch<{ ok: boolean; warning?: string }>(`/groups/${props.groupId}/sharpen-character`, {
      method: 'POST',
    });
    warning.value = result.warning ?? null;
    const updated = await store.fetchGroup(props.groupId);
    emit('updated', updated);
    done.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('character.sharpenFailed');
  } finally {
    running.value = false;
  }
}
</script>
