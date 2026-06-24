<template>
  <div class="flex min-h-full flex-col bg-background">
    <header class="page-header hidden lg:block">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('connect.title') }}
      </h1>
      <p class="mt-0.5 text-[12px] text-on-surface-variant">
        {{ t('connect.subtitle') }}
      </p>
    </header>

    <div class="page-content py-8">
      <div v-if="connected" class="mx-auto max-w-md rounded-xl border border-primary/20 bg-surface-container p-10 text-center shadow-wavi-ring">
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-2xl bg-primary opacity-20 blur-xl" />
          <img src="/wavi-mascot.jpg" alt="Wavi mascot" class="relative h-16 w-16 rounded-2xl object-contain ring-1 ring-primary/30" />
        </div>
        <div class="mb-2 font-sora text-[18px] font-semibold text-on-surface">
          {{ t('connect.connected.title') }}
        </div>
        <p class="mb-6 text-[13px] leading-relaxed text-on-surface-variant">
          {{ phoneNumber ? t('connect.connected.bodyPhone', { phone: phoneNumber }) : t('connect.connected.body') }}
          {{ t('groups.subtitle') }}
        </p>
        <RouterLink to="/groups" class="btn btn-primary inline-flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">group_add</span>
          {{ t('connect.connected.registerGroups') }}
        </RouterLink>
      </div>

      <template v-else>
        <div class="mb-8 flex items-center gap-5">
          <div class="relative shrink-0">
            <div class="absolute inset-0 animate-neon-pulse rounded-2xl bg-primary opacity-20 blur-xl" />
            <img src="/wavi-mascot.jpg" alt="Wavi mascot" class="relative h-16 w-16 rounded-2xl object-contain ring-2 ring-primary/30" />
          </div>
          <div>
            <h2 class="font-sora text-[20px] font-bold tracking-tight text-on-surface">
              {{ t('connect.linking.title') }}
            </h2>
            <p class="mt-1 text-[13px] italic text-on-surface-variant">
              {{ t('connect.linking.tagline') }}
            </p>
          </div>
        </div>

        <div v-if="streamError" class="mb-6 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
          {{ streamError }}
          <button class="ms-3 underline" @click="retry">{{ t('connect.retry') }}</button>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <section class="flex min-h-[380px] flex-col rounded-xl border border-outline-variant bg-surface-container p-6">
            <h3 class="mb-6 font-sora text-[15px] font-semibold text-primary">
              {{ t('connect.steps.title') }}
            </h3>
            <ol class="flex flex-1 flex-col justify-center gap-5">
              <li class="flex items-start gap-4">
                <span class="step-num">1</span>
                <p class="pt-1 text-[13px] leading-relaxed text-on-surface-variant">Open <span class="font-semibold text-primary">WhatsApp</span> on your phone</p>
              </li>
              <li class="flex items-start gap-4">
                <span class="step-num">2</span>
                <p class="pt-1 text-[13px] leading-relaxed text-on-surface-variant">
                  Tap <span class="font-semibold text-on-surface">Menu</span> or <span class="font-semibold text-on-surface">Settings</span>, then
                  <span class="font-semibold text-primary">Linked Devices</span>
                </p>
              </li>
              <li class="flex items-start gap-4">
                <span class="step-num">3</span>
                <p class="pt-1 text-[13px] leading-relaxed text-on-surface-variant">
                  Point your phone at the code to
                  <span class="font-semibold text-on-surface">capture it</span>
                </p>
              </li>
            </ol>
          </section>

          <section class="flex min-h-[380px] flex-col items-center justify-center rounded-xl border border-outline-variant bg-surface-container p-6">
            <!-- QR always has white bg for scanning contrast in both themes -->
            <div class="rounded-2xl bg-white p-5 shadow-[0_8px_40px_rgba(0,0,0,0.35)]">
              <div class="relative h-56 w-56 overflow-hidden rounded-xl sm:h-64 sm:w-64">
                <LoadingState v-if="processing" variant="compact" :message="t('connect.status.linking')" />
                <template v-else>
                  <img v-if="qrDataUrl" :src="qrDataUrl" class="h-full w-full object-contain" alt="WhatsApp QR Code" />
                  <LoadingState v-else variant="compact" :message="t('connect.status.generating')" />
                  <div v-if="qrDataUrl" class="scan-line pointer-events-none absolute start-0 h-[2px] w-full bg-primary opacity-90 shadow-[0_0_12px_#4ff07f]" />
                </template>
              </div>
            </div>

            <div class="mt-4 flex items-center gap-2 text-on-surface-variant">
              <span class="h-2 w-2 rounded-full" :class="statusDotClass" />
              <p class="font-mono text-[11px]">
                {{ statusMessage }}
              </p>
            </div>
          </section>
        </div>

        <p class="mt-6 text-center text-[12px] text-on-surface-variant lg:text-start">
          {{ t('connect.hint') }}
        </p>

        <div class="mt-8 rounded-xl border border-outline-variant/60 bg-surface-container p-5">
          <p class="mb-1 font-sora text-[13px] font-semibold text-on-surface">
            {{ t('connect.troubleshoot.title') }}
          </p>
          <p class="mb-4 text-[12px] leading-relaxed text-on-surface-variant">
            {{ t('connect.troubleshoot.body') }}
          </p>
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-4 py-2 text-[13px] font-medium text-on-surface transition-all hover:border-primary/40 hover:text-primary active:scale-95 disabled:opacity-50"
            :disabled="restarting"
            @click="restartBrowser"
          >
            <span class="material-symbols-outlined text-[16px]" :class="restarting ? 'animate-spin' : ''">refresh</span>
            {{ restarting ? t('connect.troubleshoot.restarting') : t('connect.troubleshoot.restart') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiFetch, openEventSource } from '../lib/api';
import type { AgentStatusResponse } from '@wavi/shared';
import { useAgentStore } from '../stores/agent';
import LoadingState from '../components/LoadingState.vue';

const { t } = useI18n();
const agentStore = useAgentStore();

const qrDataUrl = ref<string | null>(null);
const processing = ref(false);
const connected = ref(false);
const phoneNumber = ref<string | null>(null);
const streamError = ref<string | null>(null);
const restarting = ref(false);

const statusMessage = computed(() => {
  if (processing.value) return t('connect.status.scanned');
  if (qrDataUrl.value) return t('connect.status.scan');
  return t('connect.status.waiting');
});

const statusDotClass = computed(() => {
  if (processing.value) return 'animate-pulse bg-secondary';
  if (qrDataUrl.value) return 'animate-neon-pulse bg-primary';
  return 'animate-pulse bg-secondary';
});
let eventSource: EventSource | null = null;
let qrTimeout: ReturnType<typeof setTimeout> | null = null;
let statusPoll: ReturnType<typeof setInterval> | null = null;

function stopStatusPoll() {
  if (statusPoll) {
    clearInterval(statusPoll);
    statusPoll = null;
  }
}

function startStatusPoll() {
  stopStatusPoll();
  processing.value = true;
  streamError.value = null;
  statusPoll = setInterval(async () => {
    try {
      const status = await apiFetch<AgentStatusResponse>('/agent/status');
      if (status.connected) {
        setConnected(status);
      } else if (!status.connecting) {
        processing.value = false;
        stopStatusPoll();
        if (!connected.value && !qrDataUrl.value) startQrStream();
      }
    } catch {
      // keep polling
    }
  }, 2000);
}

function closeStream() {
  eventSource?.close();
  eventSource = null;
  if (qrTimeout) {
    clearTimeout(qrTimeout);
    qrTimeout = null;
  }
}

function setConnected(status: Pick<AgentStatusResponse, 'connected' | 'phone_number'>) {
  connected.value = true;
  processing.value = false;
  phoneNumber.value = status.phone_number;
  qrDataUrl.value = null;
  streamError.value = null;
  stopStatusPoll();
  closeStream();
  void agentStore.refresh();
}

function startQrStream() {
  closeStream();
  streamError.value = null;
  processing.value = false;
  qrDataUrl.value = null;

  void openEventSource('/agent/qr')
    .then((source) => {
      eventSource = source;
      attachQrHandlers(source);
    })
    .catch(() => {
      streamError.value = t('connect.errors.apiDown');
    });
}

function attachQrHandlers(source: EventSource) {
  qrTimeout = setTimeout(() => {
    if (!qrDataUrl.value && !connected.value && !processing.value) {
      streamError.value = t('connect.errors.timeout');
    }
  }, 90_000);

  source.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'qr') {
      qrDataUrl.value = msg.data;
      streamError.value = null;
    } else if (msg.type === 'authenticated') {
      processing.value = true;
      streamError.value = null;
      startStatusPoll();
    } else if (msg.type === 'ready') {
      setConnected({ connected: true, phone_number: msg.phone_number ?? null });
    }
  };

  source.onerror = () => {
    apiFetch<AgentStatusResponse>('/agent/status')
      .then((s) => {
        if (s.connected) setConnected(s);
      })
      .catch(() => {
        streamError.value = t('connect.errors.apiDown');
      });
  };
}

async function loadStatus() {
  try {
    const status = await apiFetch<AgentStatusResponse>('/agent/status');
    if (status.connected) {
      setConnected(status);
      return;
    }
    if (status.connecting) {
      startStatusPoll();
      return;
    }
    startQrStream();
  } catch {
    streamError.value = t('connect.errors.apiDown');
  }
}

function retry() {
  loadStatus();
}

async function restartBrowser() {
  if (restarting.value) return;
  restarting.value = true;
  streamError.value = null;
  closeStream();
  stopStatusPoll();
  qrDataUrl.value = null;
  processing.value = false;
  try {
    await apiFetch('/agent/restart', { method: 'POST' });
    // Give the server ~3s to kill the old browser, then start polling for QR
    await new Promise((r) => setTimeout(r, 3000));
    startQrStream();
  } catch {
    streamError.value = t('connect.errors.restartFailed');
  } finally {
    restarting.value = false;
  }
}

onMounted(loadStatus);

onUnmounted(() => {
  closeStream();
  stopStatusPoll();
});
</script>

<style scoped>
.scan-line {
  animation: scan-line 2.5s ease-in-out infinite;
}

.step-num {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-bold text-primary;
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
</style>
