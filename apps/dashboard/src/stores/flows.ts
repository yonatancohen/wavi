import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import type { ActiveReplyFlows } from '@wavi/shared';

const POLL_MS_ACTIVE = 30_000;
const POLL_MS_IDLE = 120_000;

export const useFlowsStore = defineStore('flows', () => {
  const total = ref(0);
  const flows = ref<ActiveReplyFlows['flows']>([]);
  const queueDepth = ref(0);
  const peakInflightToday = ref(0);
  const polling = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let subscribers = 0;
  let currentPollMs = POLL_MS_IDLE;

  function schedulePolling(intervalMs: number) {
    if (!polling.value) return;
    if (intervalMs === currentPollMs && timer) return;
    currentPollMs = intervalMs;
    if (timer) clearInterval(timer);
    timer = setInterval(() => void refresh(), intervalMs);
  }

  async function refresh() {
    try {
      const data = await apiFetch<ActiveReplyFlows>('/flows/active');
      total.value = data.total;
      flows.value = data.flows;
      queueDepth.value = data.queue_depth ?? 0;
      peakInflightToday.value = data.peak_inflight_today ?? 0;
    } catch {
      total.value = 0;
      flows.value = [];
      queueDepth.value = 0;
      peakInflightToday.value = 0;
    }

    schedulePolling(total.value > 0 ? POLL_MS_ACTIVE : POLL_MS_IDLE);
  }

  function startPolling() {
    subscribers += 1;
    if (polling.value) return;
    polling.value = true;
    currentPollMs = POLL_MS_IDLE;
    void refresh();
    timer = setInterval(() => void refresh(), currentPollMs);
  }

  function stopPolling() {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers > 0 || !polling.value) return;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    polling.value = false;
    currentPollMs = POLL_MS_IDLE;
  }

  return { total, flows, queueDepth, peakInflightToday, refresh, startPolling, stopPolling };
});
