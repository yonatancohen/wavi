<template>
  <section class="flex h-full min-h-0 flex-col rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-2">
        <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-primary">upload_file</span>
        <div>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('ingest.title') }}</h2>
          <p class="mt-0.5 text-[12px] leading-snug text-on-surface-variant">
            {{ t('ingest.body', { ext: '.txt' }) }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="relative flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors sm:px-4"
      :class="dragOver ? 'border-primary bg-primary/[0.06]' : 'border-outline-variant bg-surface-variant/20 hover:border-primary/40'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input ref="fileInput" type="file" accept=".txt" class="sr-only" :disabled="uploading || streaming" @change="onFileSelect" />
      <span class="material-symbols-outlined shrink-0 text-[22px] text-primary/70">description</span>
      <div class="min-w-0 flex-1 text-start">
        <p class="text-[12px] text-on-surface">
          <button type="button" class="font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50" :disabled="uploading || streaming" @click="fileInput?.click()">
            {{ t('ingest.browse') }}
          </button>
          <span class="text-on-surface-variant"> · {{ t('ingest.dragDropShort') }}</span>
        </p>
        <p v-if="primaryFile" class="mt-0.5 truncate font-mono text-[10px] text-primary">{{ primaryFile.name }}</p>
        <p v-else class="mt-0.5 font-mono text-[10px] text-on-surface-variant/60">{{ t('ingest.txtOnly') }}</p>
      </div>
      <button type="button" class="btn btn-primary shrink-0 px-3 py-1.5 text-[11px]" :disabled="!primaryFile || uploading || streaming" @click="startUpload">
        {{ uploading ? t('ingest.starting') : t('ingest.upload') }}
      </button>
    </div>

    <details class="group mt-3 rounded-lg border border-outline-variant/60 bg-surface-variant/10">
      <summary class="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-on-surface-variant transition-colors hover:text-on-surface [&::-webkit-details-marker]:hidden">
        <span class="inline-flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
          {{ t('ingest.options') }}
        </span>
      </summary>
      <div class="space-y-2 border-t border-outline-variant/50 px-3 pb-3 pt-2">
        <label class="flex cursor-pointer items-start gap-2">
          <input v-model="includeSupplemental" type="checkbox" class="mt-0.5" :disabled="uploading || streaming" />
          <span class="text-[11px] leading-relaxed text-on-surface-variant">{{ t('ingest.supplementalHint') }}</span>
        </label>
        <div v-if="includeSupplemental" class="ps-5">
          <input ref="supplementalInput" type="file" accept=".txt" class="sr-only" :disabled="uploading || streaming" @change="onSupplementalSelect" />
          <button type="button" class="btn btn-secondary px-2.5 py-1 text-[10px]" :disabled="uploading || streaming" @click="supplementalInput?.click()">
            {{ t('ingest.supplementalBrowse') }}
          </button>
          <p v-if="supplementalFile" class="mt-1 font-mono text-[10px] text-on-surface-variant">{{ supplementalFile.name }}</p>
        </div>
        <label class="flex cursor-pointer items-start gap-2">
          <input v-model="fullReset" type="checkbox" class="mt-0.5" :disabled="uploading || streaming" />
          <span class="text-[11px] leading-relaxed text-on-surface-variant">{{ t('ingest.fullResetHint') }}</span>
        </label>
      </div>
    </details>

    <div v-if="uploadError || streamError" class="mt-3 rounded-xl border border-error/25 bg-error/[0.07] px-3 py-2.5 text-[12px] text-error">
      {{ uploadError ?? streamError }}
    </div>

    <div v-if="showProgress" class="mt-3 shrink-0 border-t border-outline-variant/50 pt-4">
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="text-[11px] font-semibold text-on-surface">
          {{ progress ? (t(`stages.${progress.stage}`) ?? progress.stage) : t('ingest.starting') }}
        </span>
        <span class="font-mono text-[10px] tabular-nums text-on-surface-variant">{{ stageProgressPercent() }}%</span>
      </div>
      <div class="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-variant">
        <div class="h-full rounded-full bg-primary transition-all duration-500" :style="{ width: `${stageProgressPercent()}%` }" />
      </div>
      <ul class="flex flex-wrap gap-x-3 gap-y-1.5">
        <li
          v-for="stage in INGESTION_STAGES.slice(0, -1)"
          :key="stage"
          class="flex items-center gap-1 text-[10px]"
          :class="isStageComplete(stage) ? 'text-primary' : isStageActive(stage) ? 'font-semibold text-on-surface' : 'text-on-surface-variant/50'"
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
        <span v-if="progress.chunks_embedded"> · {{ t('ingest.chunks', { count: progress.chunks_embedded }) }}</span>
      </p>
    </div>

    <div class="min-h-0 flex-1" aria-hidden="true" />
  </section>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import { useIngestionProgress, INGESTION_STAGES } from '../composables/useIngestionProgress';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();

const fileInput = ref<HTMLInputElement | null>(null);
const supplementalInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const primaryFile = ref<File | null>(null);
const supplementalFile = ref<File | null>(null);
const includeSupplemental = ref(false);
const fullReset = ref(false);

const emit = defineEmits<{ complete: [] }>();

const { progress, streaming, streamError, showProgress, startStream, stageProgressPercent, isStageComplete, isStageActive } = useIngestionProgress(toRef(props, 'groupId'), {
  onComplete: () => emit('complete'),
});

async function uploadFiles() {
  if (!primaryFile.value) return;

  uploading.value = true;
  uploadError.value = null;

  const formData = new FormData();
  formData.append('file', primaryFile.value);
  if (includeSupplemental.value && supplementalFile.value) {
    formData.append('supplemental', supplementalFile.value);
  }
  if (fullReset.value) {
    formData.append('full_reset', 'true');
  }

  try {
    await apiFetch<{ ok: boolean; message: string }>(`/ingest/${props.groupId}`, {
      method: 'POST',
      body: formData,
    });
    await startStream(() => emit('complete'));
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : t('ingest.failedUpload');
  } finally {
    uploading.value = false;
  }
}

function pickPrimary(file: File) {
  if (!file.name.toLowerCase().endsWith('.txt')) {
    uploadError.value = t('ingest.invalidFile');
    return;
  }
  primaryFile.value = file;
  uploadError.value = null;
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) pickPrimary(file);
  input.value = '';
}

function onSupplementalSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) supplementalFile.value = file;
  input.value = '';
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) pickPrimary(file);
}

function startUpload() {
  uploadFiles();
}
</script>
