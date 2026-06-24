import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Reply } from '@wavi/shared';

const PAGE_SIZE = 20;

type FetchFilters = { groupId?: string; flagged?: boolean };

export const useRepliesStore = defineStore('replies', () => {
  const replies = ref<Reply[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);

  let _currentOffset = 0;
  let _lastFilters: FetchFilters = {};

  function buildParams(filters: FetchFilters, offset: number): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.groupId) params.set('group_id', filters.groupId);
    if (filters.flagged) params.set('flagged', 'true');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return params;
  }

  async function fetchReplies(filters?: FetchFilters) {
    _lastFilters = filters ?? {};
    _currentOffset = 0;
    loading.value = true;
    try {
      const data = await apiFetch<Reply[]>(`/replies?${buildParams(_lastFilters, 0)}`);
      replies.value = data;
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
      const data = await apiFetch<Reply[]>(`/replies?${buildParams(_lastFilters, nextOffset)}`);
      replies.value.push(...data);
      _currentOffset = nextOffset;
      hasMore.value = data.length === PAGE_SIZE;
    } finally {
      loadingMore.value = false;
    }
  }

  async function flagMiss(replyId: string, flagged: boolean) {
    await apiFetch(`/replies/${replyId}/flag`, {
      method: 'PATCH',
      body: JSON.stringify({ flagged_miss: flagged }),
    });
    const reply = replies.value.find((r) => r.id === replyId);
    if (reply) reply.flagged_miss = flagged;
  }

  // Subscribe to realtime new replies
  function subscribeRealtime() {
    return supabase
      .channel('replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' }, (payload) => {
        replies.value.unshift(payload.new as Reply);
      })
      .subscribe();
  }

  return { replies, loading, loadingMore, hasMore, fetchReplies, loadMore, flagMiss, subscribeRealtime };
});
