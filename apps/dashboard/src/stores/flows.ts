import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import type { ActiveReplyFlows } from '@wavi/shared';

const POLL_MS = 30_000;

export const useFlowsStore = defineStore('flows', () => {
  const total = ref(0);
  const flows = ref<ActiveReplyFlows['flows']>([]);
  const polling = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let subscribers = 0;

  async function refresh() {
    try {
      const data = await apiFetch<ActiveReplyFlows>('/flows/active');
      total.value = data.total;
      flows.value = data.flows;
    } catch {
      total.value = 0;
      flows.value = [];
    }
  }

  function startPolling() {
    subscribers += 1;
    if (polling.value) return;
    polling.value = true;
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  }

  function stopPolling() {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers > 0 || !polling.value) return;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    polling.value = false;
  }

  return { total, flows, refresh, startPolling, stopPolling };
});
