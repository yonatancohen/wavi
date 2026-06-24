import { ref, computed, onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import { apiFetch, openEventSource } from '../lib/api';
import type { IngestionProgress } from '@wavi/shared';

export const INGESTION_STAGES = ['parsing', 'embedding', 'profiling', 'relationships', 'context', 'synthesizing', 'done'] as const;

export type IngestionStage = (typeof INGESTION_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  parsing: 'Parsing',
  embedding: 'Embedding',
  profiling: 'Profiling',
  relationships: 'Relationships',
  context: 'Context',
  synthesizing: 'Synthesizing',
  done: 'Done',
  error: 'Error',
};

export function isActiveIngestionStage(stage: IngestionProgress['stage'] | undefined): boolean {
  return !!stage && stage !== 'done' && stage !== 'error';
}

type UseIngestionProgressOptions = {
  onComplete?: () => void;
};

export function useIngestionProgress(groupId: Ref<string>, options: UseIngestionProgressOptions = {}) {
  const progress = ref<IngestionProgress | null>(null);
  const streaming = ref(false);
  const streamError = ref<string | null>(null);
  let eventSource: EventSource | null = null;

  const showProgress = computed(() => streaming.value || (progress.value != null && isActiveIngestionStage(progress.value.stage)));

  function closeStream() {
    eventSource?.close();
    eventSource = null;
    streaming.value = false;
  }

  async function startStream(onComplete?: () => void, streamOptions?: { preserveProgress?: boolean }) {
    closeStream();
    if (!streamOptions?.preserveProgress) {
      progress.value = null;
    }
    streamError.value = null;
    if (!groupId.value) return;

    streaming.value = true;

    try {
      eventSource = await openEventSource(`/ingest/${groupId.value}/progress`);
    } catch (e) {
      streamError.value = e instanceof Error ? e.message : 'Failed to connect to progress stream';
      streaming.value = false;
      return;
    }

    const complete = onComplete ?? options.onComplete;

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data) as IngestionProgress;
      progress.value = data;

      if (data.stage === 'done') {
        closeStream();
        complete?.();
      } else if (data.stage === 'error') {
        streamError.value = data.error ?? 'Ingestion failed';
        closeStream();
      }
    };

    eventSource.onerror = () => {
      // readyState CONNECTING means the browser is auto-reconnecting — not fatal.
      // Only treat it as a real failure once the browser gives up (CLOSED).
      if (eventSource?.readyState === EventSource.CLOSED) {
        if (streaming.value && progress.value?.stage !== 'done') {
          streamError.value = 'Lost connection to progress stream';
          closeStream();
        }
      }
    };
  }

  async function resumeIfInProgress() {
    if (!groupId.value || streaming.value) return;

    try {
      const { progress: current } = await apiFetch<{ progress: IngestionProgress | null }>(`/ingest/${groupId.value}/progress/status`);
      if (!isActiveIngestionStage(current?.stage)) return;

      progress.value = current;
      await startStream(undefined, { preserveProgress: true });
    } catch {
      // No active job or auth not ready yet — ignore.
    }
  }

  function stageIndex(stage: string): number {
    return INGESTION_STAGES.indexOf(stage as IngestionStage);
  }

  function stageProgressPercent(): number {
    if (!progress.value) return 0;
    const { stage } = progress.value;
    if (stage === 'done') return 100;
    if (stage === 'error') return 0;
    const idx = stageIndex(stage);
    if (idx === -1) return 0;
    return Math.round(((idx + 0.5) / (INGESTION_STAGES.length - 1)) * 100);
  }

  function isStageComplete(stage: IngestionStage): boolean {
    if (!progress.value) return false;
    if (progress.value.stage === 'done') return true;
    if (progress.value.stage === 'error') return false;
    const current = stageIndex(progress.value.stage);
    const target = stageIndex(stage);
    return current > target;
  }

  function isStageActive(stage: IngestionStage): boolean {
    return progress.value?.stage === stage;
  }

  onMounted(() => {
    void resumeIfInProgress();
  });

  watch(groupId, () => {
    closeStream();
    progress.value = null;
    streamError.value = null;
    void resumeIfInProgress();
  });

  onBeforeUnmount(closeStream);

  return {
    progress,
    streaming,
    streamError,
    showProgress,
    startStream,
    closeStream,
    resumeIfInProgress,
    stageProgressPercent,
    isStageComplete,
    isStageActive,
  };
}
