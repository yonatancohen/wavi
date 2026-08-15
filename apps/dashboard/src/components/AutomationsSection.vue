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
      <!-- Scheduled Posts first so the add form is visible on mobile -->
      <div class="rounded-xl border border-outline-variant bg-surface p-4">
        <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-on-surface">{{ t('automations.scheduledTitle') }}</p>
            <p class="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">{{ t('automations.scheduledHint') }}</p>
          </div>
          <button type="button" class="btn btn-primary flex w-full shrink-0 items-center justify-center gap-1 text-[12px] sm:w-auto" @click="addingPost = !addingPost">
            <span class="material-symbols-outlined text-[14px]">{{ addingPost ? 'close' : 'add' }}</span>
            {{ addingPost ? t('common.cancel') : t('automations.addSchedule') }}
          </button>
        </div>

        <div v-if="scheduledPosts.length" class="mb-3 space-y-3">
          <div v-for="post in scheduledPosts" :key="post.id" class="rounded-xl border border-outline-variant/60 bg-surface-variant/10 p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13px] font-medium text-on-surface">{{ post.label }}</p>
                <p class="text-[11px] text-on-surface-variant">
                  {{ post.frequency === 'weekly' ? weekdays[post.weekday] : t('automations.daily') }} · {{ post.time }}
                  <span v-if="post.last_fired_at"> · {{ t('automations.lastSent', { time: formatTime(post.last_fired_at) }) }}</span>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="btn btn-secondary flex items-center gap-1 text-[11px]"
                  :disabled="post.triggering || !group?.status?.startsWith('active')"
                  @click="triggerScheduledPost(post)"
                >
                  <span v-if="post.triggering" class="material-symbols-outlined animate-spin text-[13px]">progress_activity</span>
                  <span v-else class="material-symbols-outlined text-[13px]">send</span>
                </button>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="post.enabled"
                  class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                  :class="post.enabled ? 'bg-primary' : 'bg-outline-variant'"
                  :disabled="post.saving"
                  @click="toggleScheduledPost(post)"
                >
                  <span class="absolute left-0 top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-transform" :class="post.enabled ? 'translate-x-4' : 'translate-x-0.5'" />
                </button>
                <button type="button" class="text-on-surface-variant transition-colors hover:text-error" :disabled="post.deleting" @click="deleteScheduledPost(post)">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>

            <details class="mt-2">
              <summary class="cursor-pointer text-[11px] text-on-surface-variant hover:text-on-surface">{{ t('automations.editSchedule') }}</summary>
              <div class="mt-2 space-y-2">
                <input
                  v-model="post.label"
                  type="text"
                  class="w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
                  :placeholder="t('automations.labelPlaceholder')"
                  @blur="saveScheduledPost(post)"
                />
                <div class="flex flex-wrap gap-2">
                  <input
                    v-model="post.time"
                    type="time"
                    class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
                    @change="saveScheduledPost(post)"
                  />
                  <select
                    v-model="post.frequency"
                    class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
                    @change="saveScheduledPost(post)"
                  >
                    <option value="daily">{{ t('automations.daily') }}</option>
                    <option value="weekly">{{ t('automations.weekly') }}</option>
                  </select>
                  <select
                    v-if="post.frequency === 'weekly'"
                    v-model="post.weekday"
                    class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
                    @change="saveScheduledPost(post)"
                  >
                    <option v-for="(day, idx) in weekdays" :key="idx" :value="idx">{{ day }}</option>
                  </select>
                </div>
                <textarea
                  v-model="post.template"
                  rows="2"
                  class="w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
                  :placeholder="t('automations.templatePlaceholder')"
                  @blur="saveScheduledPost(post)"
                />
              </div>
            </details>
          </div>
        </div>

        <div v-if="addingPost" class="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p class="mb-2 text-[12px] font-medium text-on-surface">{{ t('automations.newSchedule') }}</p>
          <button type="button" class="btn btn-secondary mb-2 w-full justify-center px-3 py-1.5 text-[11px] sm:w-auto" @click="applyMorningPreset">
            {{ t('automations.morningPreset') }}
          </button>
          <div class="space-y-2">
            <input
              v-model="newPost.label"
              type="text"
              class="w-full rounded-xl border border-outline-variant bg-surface px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
              :placeholder="t('automations.labelPlaceholder')"
            />
            <div class="flex flex-wrap gap-2">
              <input v-model="newPost.time" type="time" class="rounded-xl border border-outline-variant bg-surface px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50" />
              <select v-model="newPost.frequency" class="rounded-xl border border-outline-variant bg-surface px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50">
                <option value="daily">{{ t('automations.daily') }}</option>
                <option value="weekly">{{ t('automations.weekly') }}</option>
              </select>
              <select
                v-if="newPost.frequency === 'weekly'"
                v-model="newPost.weekday"
                class="rounded-xl border border-outline-variant bg-surface px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
              >
                <option v-for="(day, idx) in weekdays" :key="idx" :value="idx">{{ day }}</option>
              </select>
            </div>
            <textarea
              v-model="newPost.template"
              rows="3"
              class="w-full rounded-xl border border-outline-variant bg-surface px-3 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary/50"
              :placeholder="t('automations.templatePlaceholder')"
            />
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-primary flex items-center gap-1.5 text-[12px]" :disabled="savingNew" @click="addScheduledPost">
                <span v-if="savingNew" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                {{ t('automations.saveSchedule') }}
              </button>
              <button type="button" class="btn btn-secondary text-[12px]" @click="addingPost = false">
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="!scheduledPosts.length && !addingPost" class="text-[12px] text-on-surface-variant">
          {{ t('automations.noSchedules') }}
        </p>
      </div>

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
            @click="toggleSingletonAutomation('silence_nudge')"
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
              @change="saveSingletonAutomation('silence_nudge')"
            >
              <option v-for="h in [4, 8, 12, 24, 48, 72]" :key="h" :value="h">{{ t('automations.hours', { n: h }) }}</option>
            </select>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5 text-[12px]"
              :disabled="silenceNudge.previewing || !group?.status?.startsWith('active')"
              @click="previewSilenceNudge"
            >
              <span v-if="silenceNudge.previewing" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
              <span v-else class="material-symbols-outlined text-[14px]">visibility</span>
              {{ silenceNudge.draft ? t('automations.regeneratePreview') : t('automations.previewNudge') }}
            </button>
            <span v-if="silenceNudge.last_fired_at" class="text-[11px] text-on-surface-variant">
              {{ t('automations.lastSent', { time: formatTime(silenceNudge.last_fired_at) }) }}
            </span>
          </div>

          <div v-if="silenceNudge.draft !== null" class="space-y-3 rounded-xl border border-outline-variant/70 bg-surface-variant/15 p-3">
            <p class="text-[11px] text-on-surface-variant">{{ t('automations.previewHint') }}</p>
            <textarea
              v-model="silenceNudge.draft"
              rows="4"
              class="w-full resize-y rounded-xl border border-outline-variant bg-surface px-3 py-2 text-[13px] leading-relaxed text-on-surface outline-none focus:border-primary/50"
            />
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="btn btn-primary flex items-center gap-1.5 text-[12px]"
                :disabled="silenceNudge.sending || !silenceNudge.draft.trim() || !group?.status?.startsWith('active')"
                @click="sendSilenceNudge"
              >
                <span v-if="silenceNudge.sending" class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                <span v-else class="material-symbols-outlined text-[14px]">send</span>
                {{ t('automations.sendNudge') }}
              </button>
              <button type="button" class="btn btn-secondary text-[12px]" :disabled="silenceNudge.sending" @click="silenceNudge.draft = null">
                {{ t('common.cancel') }}
              </button>
            </div>
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
            @click="toggleSingletonAutomation('daily_digest')"
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
                @change="saveSingletonAutomation('daily_digest')"
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
                @change="saveSingletonAutomation('daily_digest')"
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
                @change="saveSingletonAutomation('daily_digest')"
              >
                <option v-for="(day, idx) in weekdays" :key="idx" :value="idx">{{ day }}</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="btn btn-secondary flex items-center gap-1.5 text-[12px]"
              :disabled="dailyDigest.triggering || !group?.status?.startsWith('active')"
              @click="triggerDailyDigest"
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
  previewing: boolean;
  sending: boolean;
  draft: string | null;
  draftTokens: { input_tokens: number; output_tokens: number } | null;
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

interface ScheduledPostItem {
  id: string;
  label: string;
  enabled: boolean;
  time: string;
  frequency: 'daily' | 'weekly';
  weekday: number;
  template: string;
  last_fired_at: string | null;
  saving: boolean;
  triggering: boolean;
  deleting: boolean;
}

const silenceNudge = reactive<SilenceState>({
  id: null,
  enabled: false,
  threshold_hours: 24,
  last_fired_at: null,
  saving: false,
  previewing: false,
  sending: false,
  draft: null,
  draftTokens: null,
});
const dailyDigest = reactive<DigestState>({ id: null, enabled: false, time: '09:00', frequency: 'daily', weekday: 0, last_fired_at: null, saving: false, triggering: false });
const scheduledPosts = ref<ScheduledPostItem[]>([]);
const addingPost = ref(true);
const newPost = reactive({
  label: t('automations.morningLabel'),
  time: '09:00',
  frequency: 'daily' as 'daily' | 'weekly',
  weekday: 5,
  template: t('automations.morningTemplate'),
});
const savingNew = ref(false);

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
  const cfg = a.config && typeof a.config === 'object' ? a.config : {};
  if (a.type === 'silence_nudge') {
    silenceNudge.id = a.id;
    silenceNudge.enabled = a.enabled;
    silenceNudge.last_fired_at = a.last_fired_at;
    silenceNudge.threshold_hours = (cfg as { threshold_hours?: number }).threshold_hours ?? 24;
  } else if (a.type === 'daily_digest') {
    dailyDigest.id = a.id;
    dailyDigest.enabled = a.enabled;
    dailyDigest.last_fired_at = a.last_fired_at;
    const digest = cfg as { time?: string; frequency?: 'daily' | 'weekly'; weekday?: number };
    dailyDigest.time = digest.time ?? '09:00';
    dailyDigest.frequency = digest.frequency ?? 'daily';
    dailyDigest.weekday = digest.weekday ?? 0;
  } else if (a.type === 'scheduled_post') {
    const post = cfg as { time?: string; frequency?: 'daily' | 'weekly'; weekday?: number; template?: string };
    const existing = scheduledPosts.value.find((p) => p.id === a.id);
    if (existing) {
      existing.enabled = a.enabled;
      existing.last_fired_at = a.last_fired_at;
    } else {
      scheduledPosts.value.push({
        id: a.id,
        label: a.label ?? post.template ?? t('automations.scheduledTitle'),
        enabled: a.enabled,
        time: post.time ?? '09:00',
        frequency: post.frequency ?? 'daily',
        weekday: post.weekday ?? 5,
        template: post.template ?? '',
        last_fired_at: a.last_fired_at,
        saving: false,
        triggering: false,
        deleting: false,
      });
    }
  }
}

async function load() {
  loading.value = true;
  loadError.value = null;
  scheduledPosts.value = [];
  try {
    const raw = await apiFetch<GroupAutomation[] | null>(`/automations?group_id=${props.group.id}`);
    const data = Array.isArray(raw) ? raw : [];
    for (const item of data) {
      try {
        applyAutomation(item);
      } catch {
        // skip malformed rows
      }
    }
    addingPost.value = scheduledPosts.value.length === 0;
  } catch (e) {
    console.error('[AutomationsSection] load failed:', e);
    loadError.value = e instanceof Error ? e.message : t('automations.failedLoad');
  } finally {
    loading.value = false;
  }
}

async function toggleSingletonAutomation(type: 'silence_nudge' | 'daily_digest') {
  const state = type === 'silence_nudge' ? silenceNudge : dailyDigest;
  const next = !state.enabled;
  state.enabled = next;
  state.saving = true;
  try {
    const config = type === 'silence_nudge' ? { threshold_hours: silenceNudge.threshold_hours } : { time: dailyDigest.time, frequency: dailyDigest.frequency, weekday: dailyDigest.weekday };
    let result: GroupAutomation;
    if (!state.id) {
      result = await apiFetch<GroupAutomation>('/automations', { method: 'POST', body: JSON.stringify({ group_id: props.group.id, type, enabled: next, config }) });
    } else {
      result = await apiFetch<GroupAutomation>(`/automations/${state.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) });
    }
    applyAutomation(result);
  } catch (e) {
    state.enabled = !next;
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    state.saving = false;
  }
}

async function saveSingletonAutomation(type: 'silence_nudge' | 'daily_digest') {
  const state = type === 'silence_nudge' ? silenceNudge : dailyDigest;
  state.saving = true;
  try {
    const config = type === 'silence_nudge' ? { threshold_hours: silenceNudge.threshold_hours } : { time: dailyDigest.time, frequency: dailyDigest.frequency, weekday: dailyDigest.weekday };
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

async function previewSilenceNudge() {
  if (!silenceNudge.id) {
    showToast(t('automations.failedSave'), 'error');
    return;
  }
  silenceNudge.previewing = true;
  try {
    const result = await apiFetch<{ ok: boolean; body: string; input_tokens?: number; output_tokens?: number }>(`/automations/${silenceNudge.id}/preview`, {
      method: 'POST',
    });
    silenceNudge.draft = result.body;
    silenceNudge.draftTokens = { input_tokens: result.input_tokens ?? 0, output_tokens: result.output_tokens ?? 0 };
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.previewFailed'), 'error');
  } finally {
    silenceNudge.previewing = false;
  }
}

async function sendSilenceNudge() {
  if (!silenceNudge.id || !silenceNudge.draft?.trim()) return;
  silenceNudge.sending = true;
  try {
    const result = await apiFetch<{ ok: boolean; body: string }>(`/automations/${silenceNudge.id}/send`, {
      method: 'POST',
      body: JSON.stringify({
        message: silenceNudge.draft,
        input_tokens: silenceNudge.draftTokens?.input_tokens,
        output_tokens: silenceNudge.draftTokens?.output_tokens,
      }),
    });
    showToast(t('automations.triggerSuccess', { preview: result.body.slice(0, 80) }), 'success');
    silenceNudge.last_fired_at = new Date().toISOString();
    silenceNudge.draft = null;
    silenceNudge.draftTokens = null;
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.triggerFailed'), 'error');
  } finally {
    silenceNudge.sending = false;
  }
}

async function triggerDailyDigest() {
  const state = dailyDigest;
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

async function toggleScheduledPost(post: ScheduledPostItem) {
  const next = !post.enabled;
  post.enabled = next;
  post.saving = true;
  try {
    await apiFetch<GroupAutomation>(`/automations/${post.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: next }) });
  } catch (e) {
    post.enabled = !next;
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    post.saving = false;
  }
}

async function saveScheduledPost(post: ScheduledPostItem) {
  post.saving = true;
  try {
    const config = { time: post.time, frequency: post.frequency, weekday: post.weekday, template: post.template || undefined };
    await apiFetch<GroupAutomation>(`/automations/${post.id}`, { method: 'PATCH', body: JSON.stringify({ config, label: post.label || undefined }) });
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    post.saving = false;
  }
}

async function triggerScheduledPost(post: ScheduledPostItem) {
  post.triggering = true;
  try {
    const result = await apiFetch<{ ok: boolean; body: string }>(`/automations/${post.id}/trigger`, { method: 'POST' });
    showToast(result.body.slice(0, 80), 'success');
    post.last_fired_at = new Date().toISOString();
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.triggerFailed'), 'error');
  } finally {
    post.triggering = false;
  }
}

async function deleteScheduledPost(post: ScheduledPostItem) {
  post.deleting = true;
  try {
    await apiFetch(`/automations/${post.id}`, { method: 'DELETE' });
    scheduledPosts.value = scheduledPosts.value.filter((p) => p.id !== post.id);
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
    post.deleting = false;
  }
}

async function addScheduledPost() {
  savingNew.value = true;
  try {
    const config = { time: newPost.time, frequency: newPost.frequency, weekday: newPost.weekday, template: newPost.template || undefined };
    const result = await apiFetch<GroupAutomation>('/automations', {
      method: 'POST',
      body: JSON.stringify({ group_id: props.group.id, type: 'scheduled_post', label: newPost.label || undefined, enabled: true, config }),
    });
    applyAutomation(result);
    addingPost.value = false;
    resetNewPost();
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('automations.failedSave'), 'error');
  } finally {
    savingNew.value = false;
  }
}

function resetNewPost() {
  newPost.label = '';
  newPost.time = '09:00';
  newPost.frequency = 'daily';
  newPost.weekday = 5;
  newPost.template = '';
}

function applyMorningPreset() {
  newPost.label = t('automations.morningLabel');
  newPost.time = '09:00';
  newPost.frequency = 'daily';
  newPost.template = t('automations.morningTemplate');
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
