<template>
  <div class="flex min-h-full flex-col bg-background">
    <header class="page-header flex min-h-14 flex-wrap items-center justify-between gap-3">
      <div class="hidden min-w-0 lg:block">
        <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
          {{ t('reminders.title') }}
        </h1>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">
          {{ t('reminders.subtitle') }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span v-if="!loading && reminders.length > 0" class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
          <span class="material-symbols-outlined text-[13px]">alarm</span>
          {{ t('reminders.count', { n: reminders.length }) }}
        </span>
        <button class="btn btn-secondary flex items-center gap-1.5" :disabled="loading" @click="reload">
          <span class="material-symbols-outlined text-[15px]" :class="{ 'animate-spin': loading }">refresh</span>
          {{ t('reminders.refresh') }}
        </button>
      </div>
    </header>

    <div class="page-content py-7">
      <!-- Error -->
      <div v-if="error" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
        {{ error }}
      </div>

      <!-- Loading skeletons -->
      <div v-if="loading" class="flex flex-col gap-2">
        <div v-for="i in 4" :key="i" class="h-[76px] animate-pulse rounded-xl bg-surface-container" />
      </div>

      <!-- Empty state -->
      <div v-else-if="reminders.length === 0" class="mx-auto mt-16 max-w-[460px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-2xl text-primary">alarm_off</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-[17px] font-semibold text-on-surface">
          {{ t('reminders.empty.title') }}
        </h2>
        <p class="text-[13px] leading-relaxed text-on-surface-variant">
          {{ t('reminders.empty.body') }}
        </p>
      </div>

      <!-- Reminder list -->
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="reminder in reminders"
          :key="reminder.id"
          class="relative overflow-hidden rounded-xl border border-on-surface/[0.07] bg-surface-container transition-colors"
          :class="editingId === reminder.id ? 'border-primary/40' : 'hover:border-primary/20'"
        >
          <!-- Accent strip -->
          <div class="absolute start-0 top-0 h-full w-[3px] bg-primary/60" />

          <!-- ── Read mode ─────────────────────────────────────── -->
          <div v-if="editingId !== reminder.id" class="flex items-start gap-4 p-4">
            <!-- Clock block -->
            <div class="flex shrink-0 flex-col items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 ps-4 text-center">
              <span class="material-symbols-outlined text-[18px] text-primary">alarm</span>
              <span class="mt-0.5 font-mono text-[10px] font-semibold leading-tight text-primary">
                {{ absoluteTime(reminder.fire_at) }}
              </span>
              <span class="font-mono text-[9px] text-primary/60">
                {{ relativeTime(reminder.fire_at) }}
              </span>
            </div>

            <!-- Content -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-semibold text-on-surface">
                {{ reminder.reminder_text }}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span class="flex items-center gap-1 text-[11px] text-on-surface-variant">
                  <span class="material-symbols-outlined text-[12px]">person</span>
                  {{ reminder.sender_name || reminder.sender_wa_id }}
                </span>
                <span v-if="reminder.group_name" class="flex items-center gap-1 text-[11px] text-on-surface-variant">
                  <span class="material-symbols-outlined text-[12px]">forum</span>
                  {{ reminder.group_name }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex shrink-0 items-center gap-0.5">
              <button class="icon-btn text-on-surface-variant hover:text-primary" :title="t('reminders.edit')" @click="startEdit(reminder)">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button class="icon-btn text-on-surface-variant hover:text-error" :disabled="cancelling === reminder.id" :title="t('reminders.cancel')" @click="handleCancel(reminder.id)">
                <span v-if="cancelling === reminder.id" class="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                <span v-else class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          <!-- ── Edit mode ──────────────────────────────────────── -->
          <div v-else class="flex flex-col gap-3 p-4 ps-7">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {{ t('reminders.editing') }}
            </p>

            <!-- Text -->
            <div>
              <label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('reminders.fieldText') }}
              </label>
              <input
                v-model="editText"
                type="text"
                class="w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :placeholder="t('reminders.fieldTextPlaceholder')"
              />
            </div>

            <!-- Time -->
            <div>
              <label class="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('reminders.fieldTime') }}
              </label>
              <input
                v-model="editTime"
                type="datetime-local"
                class="w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
              />
            </div>

            <p v-if="editError" class="text-[12px] text-error">{{ editError }}</p>

            <!-- Save / cancel -->
            <div class="flex gap-2">
              <button class="btn btn-primary flex items-center gap-1.5" :disabled="saving" @click="saveEdit(reminder.id)">
                <span v-if="saving" class="material-symbols-outlined animate-spin text-[14px]">refresh</span>
                {{ saving ? t('reminders.saving') : t('reminders.save') }}
              </button>
              <button class="btn btn-secondary" :disabled="saving" @click="cancelEdit">
                {{ t('reminders.cancelEdit') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useRemindersStore } from '../stores/reminders';
import type { ScheduledReminder } from '@wavi/shared';

const { t, locale } = useI18n();
const store = useRemindersStore();
const { reminders, loading, cancelling, error } = storeToRefs(store);

const GROUP_TZ = import.meta.env.VITE_GROUP_TIMEZONE ?? 'Asia/Jerusalem';

// ── Edit state ────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const editText = ref('');
const editTime = ref('');
const editError = ref<string | null>(null);
const saving = ref(false);

function toDatetimeLocalValue(iso: string): string {
  // Convert UTC ISO to local YYYY-MM-DDTHH:MM for datetime-local input.
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function startEdit(reminder: ScheduledReminder) {
  editingId.value = reminder.id;
  editText.value = reminder.reminder_text;
  editTime.value = toDatetimeLocalValue(reminder.fire_at);
  editError.value = null;
}

function cancelEdit() {
  editingId.value = null;
  editError.value = null;
}

async function saveEdit(id: string) {
  editError.value = null;
  const text = editText.value.trim();
  if (!text) {
    editError.value = t('reminders.errorTextRequired');
    return;
  }
  const fireAt = new Date(editTime.value).toISOString();
  if (new Date(fireAt) <= new Date()) {
    editError.value = t('reminders.errorFuture');
    return;
  }

  saving.value = true;
  try {
    await store.updateReminder(id, { reminder_text: text, fire_at: fireAt });
    editingId.value = null;
  } catch (e) {
    editError.value = e instanceof Error ? e.message : t('reminders.errorSave');
  } finally {
    saving.value = false;
  }
}

// ── Time helpers ──────────────────────────────────────────────
function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(locale.value === 'he' ? 'he-IL' : 'en-US', {
    timeZone: GROUP_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return locale.value === 'he' ? 'עכשיו' : 'now';

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return locale.value === 'he' ? `${mins}ד'` : `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return locale.value === 'he' ? (remMins > 0 ? `${hours}ש' ${remMins}ד'` : `${hours}ש'`) : remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return locale.value === 'he' ? `${days} ימים` : `${days}d`;
}

async function reload() {
  cancelEdit();
  await store.fetchReminders();
}

async function handleCancel(id: string) {
  if (editingId.value === id) cancelEdit();
  await store.cancelReminder(id);
}

onMounted(() => store.fetchReminders());
</script>
