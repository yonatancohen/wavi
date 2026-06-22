<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-secondary">autorenew</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">
        {{ t('rebuild.title') }}
      </h2>
    </div>
    <p class="mb-4 text-[13px] leading-relaxed text-on-surface-variant">
      {{ t('rebuild.body') }}
    </p>

    <button type="button" class="btn btn-secondary flex items-center gap-2" :disabled="rebuilding || streaming" @click="startRebuild">
      <span class="material-symbols-outlined text-[16px]" :class="{ 'animate-spin': rebuilding || streaming }">autorenew</span>
      {{ rebuilding || streaming ? t('rebuild.running') : t('rebuild.button') }}
    </button>

    <div v-if="rebuildError || streamError" class="mt-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ rebuildError ?? streamError }}
    </div>

    <div v-if="streaming || progress" class="mt-5">
      <div class="mb-3 flex items-center justify-between gap-3">
        <span class="text-[12px] font-semibold text-on-surface">
          {{ progress ? (t(`stages.${progress.stage}`) ?? progress.stage) : t('rebuild.starting') }}
        </span>
        <span class="font-mono text-[11px] tabular-nums text-on-surface-variant">{{ stageProgressPercent() }}%</span>
      </div>
      <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface-variant">
        <div class="h-full rounded-full bg-secondary transition-all duration-500" :style="{ width: `${stageProgressPercent()}%` }" />
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-2">
        <li
          v-for="stage in INGESTION_STAGES.slice(0, -1)"
          :key="stage"
          class="flex items-center gap-1.5 text-[11px]"
          :class="isStageComplete(stage) ? 'text-secondary' : isStageActive(stage) ? 'font-semibold text-on-surface' : 'text-on-surface-variant/50'"
        >
          <span class="material-symbols-outlined text-[14px]">
            {{ isStageComplete(stage) ? 'check_circle' : isStageActive(stage) ? 'sync' : 'radio_button_unchecked' }}
          </span>
          {{ t(`stages.${stage}`) }}
        </li>
      </ul>
      <p v-if="progress && progress.total_messages > 0" class="mt-3 font-mono text-[10px] text-on-surface-variant">
        {{
          t('ingest.messages', {
            processed: progress.processed_messages.toLocaleString(),
            total: progress.total_messages.toLocaleString(),
          })
        }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import { useIngestionProgress, INGESTION_STAGES } from '../composables/useIngestionProgress';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ complete: [] }>();

const store = useGroupsStore();
const rebuilding = ref(false);
const rebuildError = ref<string | null>(null);

const { progress, streaming, streamError, startStream, stageProgressPercent, isStageComplete, isStageActive } = useIngestionProgress(toRef(props, 'groupId'));

async function startRebuild() {
  rebuilding.value = true;
  rebuildError.value = null;
  try {
    await store.rebuildGroup(props.groupId);
    startStream(() => emit('complete'));
  } catch (e) {
    rebuildError.value = e instanceof Error ? e.message : t('rebuild.failed');
  } finally {
    rebuilding.value = false;
  }
}
</script>
