import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import { createClient } from '@supabase/supabase-js';
import type { Reply } from '@wavi/shared';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export const useRepliesStore = defineStore('replies', () => {
  const replies = ref<Reply[]>([]);
  const loading = ref(false);

  async function fetchReplies(filters?: { groupId?: string; flagged?: boolean }) {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (filters?.groupId) params.set('group_id', filters.groupId);
      if (filters?.flagged) params.set('flagged', 'true');
      const qs = params.toString();
      replies.value = await apiFetch<Reply[]>(qs ? `/replies?${qs}` : '/replies');
    } finally {
      loading.value = false;
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

  return { replies, loading, fetchReplies, flagMiss, subscribeRealtime };
});
