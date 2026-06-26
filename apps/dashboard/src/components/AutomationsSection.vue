<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-tertiary">bolt</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">
        {{ t('automations.title') }}
      </h2>
    </div>
    <p class="mb-5 text-[13px] leading-relaxed text-on-surface-variant">
      {{ t('automations.hint') }}
    </p>

    <div v-if="loadError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ loadError }}
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-[13px] text-on-surface-variant">
      <span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
      {{ t('automations.loading') }}
    </div>

    <div v-else class="space-y-4">
      <!-- Silence Nudge -->
      <div class="rounded-xl border border-outline-variant bg-surface p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-on-surface">{{ t('automations.silenceTitle') }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-on-surface-variant">{{ t('automations.silenceHint') }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="silenceNudge.enabled"
            class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
            :class="silenceNudge.enabled ? 'bg-primary' : 'bg-outline-variant'"
            :disabled="silenceNudge.saving"
            @click="toggleAutomation('silence_nudge')"
          >
            <span class="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="silenceNudge.enabled ? 'translate-x-5' : 'translate-x-0.5'" />
          </button>
        </div>

        <div v-if="silenceNudge.enabled" class="mt-3 space-y-3">
          <div>
            <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              {{ t('automations.silenceThreshold') }}
            </label>
            <select
              v-model="silenceNudge.threshold_hours"
              class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
              :disabled="silenceNudge.saving"
              @change="saveAutomation('silence_nudge')"
            >
              <option v-for="h in [4, 8, 12, 24, 48, 72]" :key="h" :value="h">{{ t('automations.hours', { n: h }) }}</option>
            </select>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5 text-[12px]"
              :disabled="silenceNudge.triggering || !group.status?.startsWith('active')"
              @click="triggerNow('silence_nudge')"
            >
              <span v-if="silenceNudge.triggering" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
              <span v-else class="material-symbols-outlined text-[14px]">send</span>
              {{ t('automations.triggerNow') }}
            </button>
            <span v-if="silenceNudge.last_fired_at" class="text-[11px] text-on-surface-variant">
              {{ t('automations.lastSent', { time: formatTime(silenceNudge.last_fired_at) }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Daily Digest -->
      <div class="rounded-xl border border-outline-variant bg-surface p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-on-surface">{{ t('automations.digestTitle') }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-on-surface-variant">{{ t('automations.digestHint') }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="dailyDigest.enabled"
            class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
            :class="dailyDigest.enabled ? 'bg-primary' : 'bg-outline-variant'"
            :disabled="dailyDigest.saving"
            @click="toggleAutomation('daily_digest')"
          >
            <span class="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="dailyDigest.enabled ? 'translate-x-5' : 'translate-x-0.5'" />
          </button>
        </div>

        <div v-if="dailyDigest.enabled" class="mt-3 space-y-3">
          <div class="flex flex-wrap gap-3">
            <div>
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.time') }}
              </label>
              <input
                v-model="dailyDigest.time"
                type="time"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="dailyDigest.saving"
                @change="saveAutomation('daily_digest')"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.frequency') }}
              </label>
              <select
                v-model="dailyDigest.frequency"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="dailyDigest.saving"
                @change="saveAutomation('daily_digest')"
              >
                <option value="daily">{{ t('automations.daily') }}</option>
                <option value="weekly">{{ t('automations.weekly') }}</option>
              </select>
            </div>
            <div v-if="dailyDigest.frequency === 'weekly'">
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.weekday') }}
              </label>
              <select
                v-model="dailyDigest.weekday"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="dailyDigest.saving"
                @change="saveAutomation('daily_digest')"
              >
                <option v-for="(day, idx) in weekdays" :key="idx" :value="idx">{{ day }}</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5 text-[12px]"
              :disabled="dailyDigest.triggering || !group.status?.startsWith('active')"
              @click="triggerNow('daily_digest')"
            >
              <span v-if="dailyDigest.triggering" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
              <span v-else class="material-symbols-outlined text-[14px]">send</span>
              {{ t('automations.triggerNow') }}
            </button>
            <span v-if="dailyDigest.last_fired_at" class="text-[11px] text-on-surface-variant">
              {{ t('automations.lastSent', { time: formatTime(dailyDigest.last_fired_at) }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Scheduled Post -->
      <div class="rounded-xl border border-outline-variant bg-surface p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-on-surface">{{ t('automations.scheduledTitle') }}</p>
            <p class="mt-1 text-[12px] leading-relaxed text-on-surface-variant">{{ t('automations.scheduledHint') }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="scheduledPost.enabled"
            class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
            :class="scheduledPost.enabled ? 'bg-primary' : 'bg-outline-variant'"
            :disabled="scheduledPost.saving"
            @click="toggleAutomation('scheduled_post')"
          >
            <span class="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="scheduledPost.enabled ? 'translate-x-5' : 'translate-x-0.5'" />
          </button>
        </div>

        <div v-if="scheduledPost.enabled" class="mt-3 space-y-3">
          <div class="flex flex-wrap gap-3">
            <div>
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.time') }}
              </label>
              <input
                v-model="scheduledPost.time"
                type="time"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="scheduledPost.saving"
                @change="saveAutomation('scheduled_post')"
              />
            </div>
            <div>
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.frequency') }}
              </label>
              <select
                v-model="scheduledPost.frequency"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="scheduledPost.saving"
                @change="saveAutomation('scheduled_post')"
              >
                <option value="daily">{{ t('automations.daily') }}</option>
                <option value="weekly">{{ t('automations.weekly') }}</option>
              </select>
            </div>
            <div v-if="scheduledPost.frequency === 'weekly'">
              <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                {{ t('automations.weekday') }}
              </label>
              <select
                v-model="scheduledPost.weekday"
                class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
                :disabled="scheduledPost.saving"
                @change="saveAutomation('scheduled_post')"
              >
                <option v-for="(day, idx) in weekdays" :key="idx" :value="idx">{{ day }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              {{ t('automations.template') }}
            </label>
            <textarea
              v-model="scheduledPost.template"
              rows="2"
              class="w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
              :placeholder="t('automations.templatePlaceholder')"
              :disabled="scheduledPost.saving"
              @blur="saveAutomation('scheduled_post')"
            />
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5 text-[12px]"
              :disabled="scheduledPost.triggering || !group.status?.startsWith('active')"
              @click="triggerNow('scheduled_post')"
            >
              <span v-if="scheduledPost.triggering" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
              <span v-else class="material-symbols-outlined text-[14px]">send</span>
              {{ t('automations.triggerNow') }}
            </button>
            <span v-if="scheduledPost.last_fired_at" class="text-[11px] text-on-surface-variant">
              {{ t('automations.lastSent', { time: formatTime(scheduledPost.last_fired_at) }) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <transition name="fade">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-[13px] shadow-lg"
        :class="toast.type === 'error' ? 'bg-error text-white' : 'bg-on-surface text-surface'"
      >
        {{ toast.message }}
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import type { GroupAutomation, GroupWithStats } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();

const loading = ref(true);
const loadError = ref<string | null>(null);

interface SilenceState {
  id: string | null;
  enabled: boolean;
  threshold_hours: number;
  last_fired_at: string | null;
  saving: boolean;
  triggering: boolean;
}

interface DigestState {
  id: string | null;
  enabled: boolean;
  time: string;
  frequency: 'daily' | 'weekly';
  weekday: number;
  last_fired_at: string | null;
  saving: boolean;
  triggering: boolean;
}

interface ScheduledState {
  id: string | null;
  enabled: boolean;
  time: string;
  frequency: 'daily' | 'weekly';
  weekday: number;
  template: string;
  last_fired_at: string | null;
  saving: boolean;
  triggering: boolean;
}

const silenceNudge = reactive<SilenceState>({ id: null, enabled: false, threshold_hours: 24, last_fired_at: null, saving: false, triggering: false });
const dailyDigest = reactive<DigestState>({ id: null, enabled: false, time: '09:00', frequency: 'daily', weekday: 0, last_fired_at: null, saving: false, triggering: false });
const scheduledPost = reactive<ScheduledState>({ id: null, enabled: false, time: '10:00', frequency: 'weekly', weekday: 1, template: '', last_fired_at: null, saving: false, triggering: false });

const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null);

const weekdays = [
  t('automations.weekdays.sun'),
  t('automations.weekdays.mon'),
  t('automations.weekdays.tue'),
  t('automations.weekdays.wed'),
  t('automations.weekdays.thu'),
  t('automations.weekdays.fri'),
  t('automations.weekdays.sat'),
];

function applyAutomation(a: GroupAutomation) {
  if (a.type === 'silence_nudge') {
    silenceNudge.id = a.id;
    silenceNudge.enabled = a.enabled;
    silenceNudge.last_fired_at = a.last_fired_at;
    const cfg = a.config as { threshold_hours?: number };
    silenceNudge.threshold_hours = cfg.threshold_hours ?? 24;
  } else if (a.type === 'daily_digest') {
    dailyDigest.id = a.id;
    dailyDigest.enabled = a.enabled;
    dailyDigest.last_fired_at = a.last_fired_at;
    const cfg = a.config as { time?: string; frequency?: 'daily' | 'weekly'; weekday?: number };
    dailyDigest.time = cfg.time ?? '09:00';
    dailyDigest.frequency = cfg.frequency ?? 'daily';
    dailyDigest.weekday = cfg.weekday ?? 0;
  } else if (a.type === 'scheduled_post') {
    scheduledPost.id = a.id;
    scheduledPost.enabled = a.enabled;
    scheduledPost.last_fired_at = a.last_fired_at;
    const cfg = a.config as { time?: string; frequency?: 'daily' | 'weekly'; weekday?: number; template?: string };
    scheduledPost.time = cfg.time ?? '10:00';
    scheduledPost.frequency = cfg.frequency ?? 'weekly';
    scheduledPost.weekday = cfg.weekday ?? 1;
    scheduledPost.template = cfg.template ?? '';
  }
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = (await apiFetch<GroupAutomation[]>(`/automations?group_id=${props.group.id}`)) ?? [];
    data.forEach(applyAutomation);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('automations.failedLoad');
  } finally {
    loading.value = false;
  }
}

function buildConfig(type: 'silence_nudge' | 'daily_digest' | 'scheduled_post') {
  if (type === 'silence_nudge') return { threshold_hours: silenceNudge.threshold_hours };
  if (type === 'daily_digest') return { time: dailyDigest.time, frequency: dailyDigest.frequency, weekday: dailyDigest.weekday };
  return { time: scheduledPost.time, frequency: scheduledPost.frequency, weekday: scheduledPost.weekday, template: scheduledPost.template || undefined };
}

function stateFor(type: 'silence_nudge' | 'daily_digest' | 'scheduled_post') {
  if (type === 'silence_nudge') return silenceNudge;
  if (type === 'daily_digest') return dailyDigest;
  return scheduledPost;
}

async function toggleAutomation(type: 'silence_nudge' | 'daily_digest' | 'scheduled_post') {
  const state = stateFor(type);
  const next = !state.enabled;
  state.enabled = next;
  state.saving = true;
  try {
    const config = buildConfig(type);
    let result: GroupAutomation;
    if (!state.id) {
      result = await apiFetch<GroupAutomation>('/automations', { method: 'POST', body: JSON.stringify({ group_id: props.group.id, type, enabled: next, config }) });
    } else {
      result = await apiFetch<GroupAutomation>(`/automations/${state.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: next, config }) });
    }
    applyAutomation(result);
  } catch (e) {
    state.enabled = !next;
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    state.saving = false;
  }
}

async function saveAutomation(type: 'silence_nudge' | 'daily_digest' | 'scheduled_post') {
  const state = stateFor(type);
  state.saving = true;
  try {
    const config = buildConfig(type);
    let result: GroupAutomation;
    if (!state.id) {
      result = await apiFetch<GroupAutomation>('/automations', { method: 'POST', body: JSON.stringify({ group_id: props.group.id, type, enabled: state.enabled, config }) });
    } else {
      result = await apiFetch<GroupAutomation>(`/automations/${state.id}`, { method: 'PATCH', body: JSON.stringify({ config }) });
    }
    applyAutomation(result);
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    state.saving = false;
  }
}

async function triggerNow(type: 'silence_nudge' | 'daily_digest' | 'scheduled_post') {
  const state = stateFor(type);
  if (!state.id) {
    showToast(t('automations.failedSave'), 'error');
    return;
  }
  state.triggering = true;
  try {
    const result = await apiFetch<{ ok: boolean; body: string }>(`/automations/${state.id}/trigger`, { method: 'POST' });
    showToast(result.body.slice(0, 80), 'success');
    state.last_fired_at = new Date().toISOString();
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.triggerFailed'), 'error');
  } finally {
    state.triggering = false;
  }
}

function showToast(message: string, type: 'success' | 'error') {
  toast.value = { message, type };
  setTimeout(() => {
    toast.value = null;
  }, 4000);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
