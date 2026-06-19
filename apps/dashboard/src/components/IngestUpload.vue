<template>
  <section class="mb-4 rounded-xl border border-outline-variant bg-surface-container p-5">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-primary">upload_file</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('ingest.title') }}</h2>
    </div>
    <p class="mb-4 text-[13px] leading-relaxed text-on-surface-variant">
      {{ t('ingest.body', { ext: '' }) }}
      <code class="rounded-md bg-surface-variant px-1.5 py-0.5 font-mono text-[12px] text-primary">.txt</code>
      file and upload it to build member profiles, relationship maps, and Wavi's group character.
    </p>

    <div
      class="relative rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors"
      :class="dragOver
        ? 'border-primary bg-primary/[0.06]'
        : 'border-outline-variant bg-surface-variant/30 hover:border-primary/40'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".txt"
        class="sr-only"
        :disabled="uploading || streaming"
        @change="onFileSelect"
      />
      <span class="material-symbols-outlined mb-2 text-[32px] text-primary/70">description</span>
      <p class="mb-1 text-[13px] text-on-surface">
        {{ t('ingest.dragDrop') }}
        <button
          type="button"
          class="font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50"
          :disabled="uploading || streaming"
          @click="fileInput?.click()"
        >
          {{ t('ingest.browse') }}
        </button>
      </p>
      <p class="font-mono text-[10px] text-on-surface-variant/60">{{ t('ingest.txtOnly') }}</p>
    </div>

    <div
      v-if="uploadError || streamError"
      class="mt-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error"
    >
      {{ uploadError ?? streamError }}
    </div>

    <div v-if="streaming || progress" class="mt-5">
      <div class="mb-3 flex items-center justify-between gap-3">
        <span class="text-[12px] font-semibold text-on-surface">
          {{ progress ? (t(`stages.${progress.stage}`) ?? progress.stage) : t('ingest.starting') }}
        </span>
        <span class="font-mono text-[11px] tabular-nums text-on-surface-variant">
          {{ stageProgressPercent() }}%
        </span>
      </div>
      <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface-variant">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          :style="{ width: `${stageProgressPercent()}%` }"
        />
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-2">
        <li
          v-for="stage in INGESTION_STAGES.slice(0, -1)"
          :key="stage"
          class="flex items-center gap-1.5 text-[11px]"
          :class="isStageComplete(stage)
            ? 'text-primary'
            : isStageActive(stage)
              ? 'font-semibold text-on-surface'
              : 'text-on-surface-variant/50'"
        >
          <span class="material-symbols-outlined text-[14px]">
            {{ isStageComplete(stage) ? 'check_circle' : isStageActive(stage) ? 'sync' : 'radio_button_unchecked' }}
          </span>
          {{ t(`stages.${stage}`) }}
        </li>
      </ul>
      <p
        v-if="progress && progress.total_messages > 0"
        class="mt-3 font-mono text-[10px] text-on-surface-variant"
      >
        {{ t('ingest.messages', { processed: progress.processed_messages.toLocaleString(), total: progress.total_messages.toLocaleString() }) }}
        <span v-if="progress.chunks_embedded"> · {{ t('ingest.chunks', { count: progress.chunks_embedded }) }}</span>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_BASE } from '../lib/api'
import {
  useIngestionProgress,
  INGESTION_STAGES,
} from '../composables/useIngestionProgress'

const { t } = useI18n()

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ complete: [] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)

const {
  progress,
  streaming,
  streamError,
  startStream,
  stageProgressPercent,
  isStageComplete,
  isStageActive,
} = useIngestionProgress(toRef(props, 'groupId'))

async function uploadFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.txt')) {
    uploadError.value = t('ingest.invalidFile')
    return
  }

  uploading.value = true
  uploadError.value = null

  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await fetch(`${API_BASE}/ingest/${props.groupId}`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? body?.message ?? `Upload failed (${res.status})`)
    }
    startStream(() => emit('complete'))
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : t('ingest.failedUpload')
  } finally {
    uploading.value = false
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) uploadFile(file)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) uploadFile(file)
}
</script>
