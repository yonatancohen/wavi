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

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col gap-2">
        <div v-for="i in 4" :key="i" class="h-[76px] animate-pulse rounded-xl bg-surface-container" />
      </div>

      <!-- Empty -->
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

      <!-- List -->
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="reminder in reminders"
          :key="reminder.id"
          class="group relative flex items-start gap-4 overflow-hidden rounded-xl border border-on-surface/[0.07] bg-surface-container p-4 transition-colors hover:border-primary/20"
        >
          <!-- Fire-time accent strip -->
          <div class="absolute start-0 top-0 h-full w-[3px] bg-primary/60" />

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

          <!-- Cancel -->
          <button class="icon-btn shrink-0 text-on-surface-variant hover:text-error" :disabled="cancelling === reminder.id" :title="t('reminders.cancel')" @click="handleCancel(reminder.id)">
            <span v-if="cancelling === reminder.id" class="material-symbols-outlined animate-spin text-[18px]">refresh</span>
            <span v-else class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useRemindersStore } from '../stores/reminders';

const { t, locale } = useI18n();
const store = useRemindersStore();
const { reminders, loading, cancelling, error } = storeToRefs(store);

const GROUP_TZ = import.meta.env.VITE_GROUP_TIMEZONE ?? 'Asia/Jerusalem';

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
  await store.fetchReminders();
}

async function handleCancel(id: string) {
  await store.cancelReminder(id);
}

onMounted(() => store.fetchReminders());
</script>
