import { ref, onBeforeUnmount, watch, type Ref } from 'vue';
import { API_BASE } from '../lib/api';
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

export function useIngestionProgress(groupId: Ref<string>) {
  const progress = ref<IngestionProgress | null>(null);
  const streaming = ref(false);
  const streamError = ref<string | null>(null);
  let eventSource: EventSource | null = null;

  function closeStream() {
    eventSource?.close();
    eventSource = null;
    streaming.value = false;
  }

  function startStream(onComplete?: () => void) {
    closeStream();
    progress.value = null;
    streamError.value = null;
    if (!groupId.value) return;

    streaming.value = true;
    eventSource = new EventSource(`${API_BASE}/ingest/${groupId.value}/progress`);

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data) as IngestionProgress;
      progress.value = data;

      if (data.stage === 'done') {
        closeStream();
        onComplete?.();
      } else if (data.stage === 'error') {
        streamError.value = data.error ?? 'Ingestion failed';
        closeStream();
      }
    };

    eventSource.onerror = () => {
      if (streaming.value && progress.value?.stage !== 'done') {
        streamError.value = streamError.value ?? 'Lost connection to progress stream';
        closeStream();
      }
    };
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

  watch(groupId, closeStream);
  onBeforeUnmount(closeStream);

  return {
    progress,
    streaming,
    streamError,
    startStream,
    closeStream,
    stageProgressPercent,
    isStageComplete,
    isStageActive,
  };
}
