<template>
  <component :is="embedded ? 'div' : 'section'" :class="embedded ? undefined : 'rounded-xl border border-outline-variant bg-surface-container p-4'">
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-2">
        <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-secondary">autorenew</span>
        <div>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">
            {{ t('rebuild.title') }}
          </h2>
          <p class="mt-0.5 text-[12px] leading-snug text-on-surface-variant">
            {{ t('rebuild.body') }}
          </p>
        </div>
      </div>
      <button type="button" class="btn btn-secondary shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px]" :disabled="rebuilding || streaming" @click="onRebuildClick">
        <span class="material-symbols-outlined text-[16px]" :class="{ 'animate-spin': rebuilding || streaming }">autorenew</span>
        {{ rebuilding || streaming ? t('rebuild.running') : t('rebuild.button') }}
      </button>
    </div>

    <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-outline-variant/60 bg-surface-variant/10 px-3 py-2">
      <input v-model="fullReset" type="checkbox" class="mt-0.5" :disabled="rebuilding || streaming" />
      <span class="text-[11px] leading-relaxed text-on-surface-variant">{{ t('rebuild.fullResetHint') }}</span>
    </label>

    <div v-if="rebuildError || streamError" class="mt-3 rounded-xl border border-error/25 bg-error/[0.07] px-3 py-2.5 text-[12px] text-error">
      {{ rebuildError ?? streamError }}
    </div>

    <div v-if="showProgress" class="mt-4 border-t border-outline-variant/50 pt-4">
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="text-[11px] font-semibold text-on-surface">
          {{ progress ? (t(`stages.${progress.stage}`) ?? progress.stage) : t('rebuild.starting') }}
        </span>
        <span class="font-mono text-[10px] tabular-nums text-on-surface-variant">{{ stageProgressPercent() }}%</span>
      </div>
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-variant">
        <div class="h-full rounded-full bg-secondary transition-all duration-500" :style="{ width: `${stageProgressPercent()}%` }" />
      </div>
      <ul class="flex flex-wrap gap-x-3 gap-y-1.5">
        <li
          v-for="stage in INGESTION_STAGES.slice(0, -1)"
          :key="stage"
          class="flex items-center gap-1 text-[10px]"
          :class="isStageComplete(stage) ? 'text-secondary' : isStageActive(stage) ? 'font-semibold text-on-surface' : 'text-on-surface-variant/50'"
        >
          <span class="material-symbols-outlined text-[12px]">
            {{ isStageComplete(stage) ? 'check_circle' : isStageActive(stage) ? 'sync' : 'radio_button_unchecked' }}
          </span>
          {{ t(`stages.${stage}`) }}
        </li>
      </ul>
      <p v-if="progress && progress.total_messages > 0" class="mt-2 font-mono text-[10px] text-on-surface-variant">
        {{
          t('ingest.messages', {
            processed: progress.processed_messages.toLocaleString(),
            total: progress.total_messages.toLocaleString(),
          })
        }}
      </p>
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import { useIngestionProgress, INGESTION_STAGES } from '../composables/useIngestionProgress';
import { useConfirm } from '../composables/useConfirm';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    groupId: string;
    embedded?: boolean;
  }>(),
  { embedded: false },
);
const emit = defineEmits<{ complete: [] }>();

const store = useGroupsStore();
const rebuilding = ref(false);
const rebuildError = ref<string | null>(null);
const fullReset = ref(false);
const { confirm } = useConfirm();

const { progress, streaming, streamError, showProgress, startStream, stageProgressPercent, isStageComplete, isStageActive } = useIngestionProgress(toRef(props, 'groupId'), {
  onComplete: () => emit('complete'),
});

async function onRebuildClick() {
  const ok = await confirm({
    title: t('rebuild.confirmTitle'),
    message: t('rebuild.confirm'),
    confirmLabel: t('rebuild.button'),
  });
  if (!ok) return;
  void startRebuild();
}

async function startRebuild() {
  rebuilding.value = true;
  rebuildError.value = null;
  try {
    await store.rebuildGroup(props.groupId, fullReset.value);
    await startStream(() => emit('complete'));
  } catch (e) {
    rebuildError.value = e instanceof Error ? e.message : t('rebuild.failed');
  } finally {
    rebuilding.value = false;
  }
}
</script>
