import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import type { ScheduledReminder } from '@wavi/shared';

export const useRemindersStore = defineStore('reminders', () => {
  const reminders = ref<ScheduledReminder[]>([]);
  const loading = ref(false);
  const cancelling = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function fetchReminders(groupId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const qs = groupId ? `?group_id=${groupId}` : '';
      reminders.value = await apiFetch<ScheduledReminder[]>(`/reminders${qs}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load reminders';
    } finally {
      loading.value = false;
    }
  }

  async function cancelReminder(id: string) {
    cancelling.value = id;
    try {
      await apiFetch(`/reminders/${id}`, { method: 'DELETE' });
      reminders.value = reminders.value.filter((r) => r.id !== id);
    } finally {
      cancelling.value = null;
    }
  }

  async function updateReminder(id: string, patch: { reminder_text?: string; fire_at?: string }) {
    const updated = await apiFetch<ScheduledReminder>(`/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const idx = reminders.value.findIndex((r) => r.id === id);
    if (idx !== -1) reminders.value[idx] = updated;
    return updated;
  }

  return { reminders, loading, cancelling, error, fetchReminders, cancelReminder, updateReminder };
});
