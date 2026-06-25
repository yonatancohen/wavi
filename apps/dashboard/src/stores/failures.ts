import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { FailedReply } from '@wavi/shared';

const PAGE_SIZE = 20;

type FetchFilters = { groupId?: string };

export const useFailuresStore = defineStore('failures', () => {
  const failures = ref<FailedReply[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);
  const todayCount = ref(0);

  let _currentOffset = 0;
  let _lastFilters: FetchFilters = {};

  function buildParams(filters: FetchFilters, offset: number): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.groupId) params.set('group_id', filters.groupId);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return params;
  }

  async function fetchFailures(filters?: FetchFilters) {
    _lastFilters = filters ?? {};
    _currentOffset = 0;
    loading.value = true;
    try {
      const data = await apiFetch<FailedReply[]>(`/replies/failed?${buildParams(_lastFilters, 0)}`);
      failures.value = data;
      hasMore.value = data.length === PAGE_SIZE;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value) return;
    loadingMore.value = true;
    const nextOffset = _currentOffset + PAGE_SIZE;
    try {
      const data = await apiFetch<FailedReply[]>(`/replies/failed?${buildParams(_lastFilters, nextOffset)}`);
      failures.value.push(...data);
      _currentOffset = nextOffset;
      hasMore.value = data.length === PAGE_SIZE;
    } finally {
      loadingMore.value = false;
    }
  }

  // Re-enqueue a failed reply; on success it leaves the failed log.
  async function retry(id: string) {
    await apiFetch(`/replies/failed/${id}/retry`, { method: 'POST' });
    failures.value = failures.value.filter((f) => f.id !== id);
    if (todayCount.value > 0) todayCount.value -= 1;
  }

  // Count of failures since local midnight — drives the dashboard banner.
  async function fetchTodayCount() {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const params = new URLSearchParams({ since: since.toISOString() });
    const { count } = await apiFetch<{ count: number }>(`/replies/failed/count?${params}`);
    todayCount.value = count;
    return count;
  }

  // New failures stream in as the worker records them.
  function subscribeRealtime() {
    return supabase
      .channel('failed_replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'failed_replies' }, (payload) => {
        failures.value.unshift(payload.new as FailedReply);
      })
      .subscribe();
  }

  return { failures, loading, loadingMore, hasMore, todayCount, fetchFailures, fetchTodayCount, retry, loadMore, subscribeRealtime };
});
