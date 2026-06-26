<template>
  <div class="space-y-6">
    <!-- Full rebuild -->
    <RebuildIntelligence :group-id="groupId" @complete="emit('complete')" />

    <!-- Individual operations -->
    <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
      <div class="mb-4 flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-tertiary">sync_alt</span>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('sync.title') }}</h2>
      </div>
      <p class="mb-5 text-[13px] leading-relaxed text-on-surface-variant">
        {{ t('sync.subtitle') }}
      </p>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        <article v-for="op in OPS" :key="op.key" class="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-variant/20 p-4">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined mt-0.5 shrink-0 text-[20px]" :class="op.iconColor">{{ op.icon }}</span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-on-surface">{{ t(`sync.ops.${op.key}.title`) }}</p>
              <p class="mt-0.5 text-[11px] leading-snug text-on-surface-variant">{{ t(`sync.ops.${op.key}.desc`) }}</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-secondary inline-flex items-center gap-1.5 !min-h-0 px-3 py-1.5 text-[12px]" :disabled="states[op.key].running || anyRunning" @click="run(op)">
              <span class="material-symbols-outlined text-[14px]" :class="{ 'animate-spin': states[op.key].running }">
                {{ states[op.key].running ? 'sync' : 'play_arrow' }}
              </span>
              {{ states[op.key].running ? t('sync.running') : t('sync.run') }}
            </button>

            <span v-if="states[op.key].done" class="flex items-center gap-1 text-[11px] font-medium text-secondary">
              <span class="material-symbols-outlined text-[14px]">check_circle</span>
              {{ t('sync.done') }}
            </span>
          </div>

          <p v-if="states[op.key].error" class="rounded-lg border border-error/25 bg-error/[0.07] px-3 py-2 text-[11px] text-error">
            {{ states[op.key].error }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import RebuildIntelligence from './RebuildIntelligence.vue';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();
const emit = defineEmits<{ complete: [] }>();

interface Op {
  key: string;
  icon: string;
  iconColor: string;
  endpoint: string;
}

const OPS: Op[] = [
  {
    key: 'dynamics',
    icon: 'hub',
    iconColor: 'text-tertiary',
    endpoint: 'sync-dynamics',
  },
  {
    key: 'profiles',
    icon: 'group',
    iconColor: 'text-primary',
    endpoint: 'sync-profiles',
  },
  {
    key: 'context',
    icon: 'article',
    iconColor: 'text-secondary',
    endpoint: 'sync-context',
  },
  {
    key: 'character',
    icon: 'psychology',
    iconColor: 'text-tertiary',
    endpoint: 'sync-character',
  },
];

interface OpState {
  running: boolean;
  done: boolean;
  error: string | null;
}

const states = reactive<Record<string, OpState>>(Object.fromEntries(OPS.map((op) => [op.key, { running: false, done: false, error: null }])));

const anyRunning = computed(() => OPS.some((op) => states[op.key].running));

async function run(op: Op) {
  const s = states[op.key];
  s.running = true;
  s.done = false;
  s.error = null;
  try {
    await apiFetch(`/groups/${props.groupId}/${op.endpoint}`, { method: 'POST' });
    s.done = true;
    emit('complete');
  } catch (e) {
    s.error = e instanceof Error ? e.message : t('sync.failed');
  } finally {
    s.running = false;
  }
}
</script>
