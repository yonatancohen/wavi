<template>
  <Teleport to="body">
    <div class="mobile-sheet-backdrop" @click="emit('close')" />
    <div
      class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-outline-variant bg-surface-container shadow-2xl lg:inset-auto lg:left-1/2 lg:top-1/2 lg:max-h-[80vh] lg:w-full lg:max-w-xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl"
      role="dialog"
      :aria-label="t('welcomeMsg.title')"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-outline-variant px-5 py-4">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-secondary">waving_hand</span>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('welcomeMsg.title') }}</h2>
        </div>
        <button type="button" class="icon-btn" :aria-label="t('nav.close')" @click="emit('close')">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <!-- Mode toggle -->
      <div class="flex shrink-0 gap-1 border-b border-outline-variant bg-surface-variant/10 px-5 py-2.5">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          class="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
          :class="mode === m.value ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:text-on-surface'"
          @click="switchMode(m.value)"
        >
          {{ t(m.label) }}
        </button>
      </div>

      <!-- Body -->
      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <!-- Generating state -->
        <div v-if="loading" class="flex flex-col items-center gap-3 py-10 text-center">
          <span class="material-symbols-outlined animate-spin text-[32px] text-secondary">autorenew</span>
          <p class="text-[13px] text-on-surface-variant">{{ t('welcomeMsg.generating') }}</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
          {{ error }}
        </div>

        <!-- Message preview -->
        <div v-else-if="message">
          <p class="mb-3 text-[11px] text-on-surface-variant">{{ t('welcomeMsg.hint') }}</p>
          <div class="min-h-[8rem] rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-on-surface">
            {{ message }}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="!loading" class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-5 py-4">
        <button type="button" class="btn btn-secondary flex items-center gap-2" @click="generate">
          <span class="material-symbols-outlined text-[16px]">refresh</span>
          {{ t('welcomeMsg.regenerate') }}
        </button>
        <button v-if="message" type="button" class="btn btn-primary flex items-center gap-2" @click="copy">
          <span class="material-symbols-outlined text-[16px]">{{ copied ? 'check' : 'content_copy' }}</span>
          {{ copied ? t('welcomeMsg.copied') : t('welcomeMsg.copy') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ close: [] }>();

type Mode = 'preview' | 'full';

const MODES: { value: Mode; label: string }[] = [
  { value: 'preview', label: 'welcomeMsg.modePreview' },
  { value: 'full', label: 'welcomeMsg.modeFull' },
];

const mode = ref<Mode>('preview');
const loading = ref(false);
const error = ref<string | null>(null);
const message = ref<string | null>(null);
const copied = ref(false);

async function generate() {
  loading.value = true;
  error.value = null;
  try {
    const res = await apiFetch<{ message: string }>(`/groups/${props.groupId}/welcome-message`, {
      method: 'POST',
      body: JSON.stringify({ mode: mode.value }),
    });
    message.value = res.message;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('welcomeMsg.error');
  } finally {
    loading.value = false;
  }
}

function switchMode(m: Mode) {
  if (mode.value === m) return;
  mode.value = m;
  message.value = null;
  generate();
}

async function copy() {
  if (!message.value) return;
  await navigator.clipboard.writeText(message.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

onMounted(generate);
</script>
