<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-tertiary">hub</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('dynamics.title') }}</h2>
    </div>

    <LoadingState v-if="loading" variant="compact" :message="t('loading.relationships')" />

    <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ error }}
    </div>

    <div v-else-if="pairs.length === 0" class="rounded-xl border border-dashed border-outline-variant bg-surface-variant/20 px-6 py-8 text-center">
      <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">link_off</span>
      <p class="text-[13px] text-on-surface-variant">
        {{ t('dynamics.empty') }}
      </p>
    </div>

    <div v-else class="grid gap-3">
      <article v-for="pair in pairs" :key="pair.id" class="rounded-xl border border-outline-variant bg-surface-variant/20 p-4">
        <h3 class="mb-4 font-sora text-[14px] font-semibold text-on-surface">{{ pair.user_a_name }} & {{ pair.user_b_name }}</h3>

        <div class="mb-4 space-y-2.5">
          <div v-for="bar in scoreBars(pair)" :key="bar.label">
            <div class="mb-1 flex items-center justify-between text-[11px]">
              <span class="font-medium text-on-surface-variant">{{ bar.label }}</span>
              <span class="font-mono tabular-nums text-on-surface">{{ bar.percent }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-surface-variant">
              <div class="h-full rounded-full transition-all" :class="bar.colorClass" :style="{ width: `${bar.percent}%` }" />
            </div>
          </div>
        </div>

        <p class="text-[13px] leading-relaxed text-on-surface-variant">{{ pair.narrative }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import LoadingState from './LoadingState.vue';
import type { RelationshipPair } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();

const pairs = ref<RelationshipPair[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

function scoreBars(pair: RelationshipPair) {
  return [
    {
      label: t('dynamics.bars.interaction'),
      percent: Math.round(pair.interaction_score * 100),
      colorClass: 'bg-primary',
    },
    {
      label: t('dynamics.bars.solidarity'),
      percent: Math.round(pair.solidarity_score * 100),
      colorClass: 'bg-secondary',
    },
    {
      label: t('dynamics.bars.conflict'),
      percent: Math.round(pair.conflict_score * 100),
      colorClass: 'bg-error/80',
    },
  ];
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    pairs.value = await apiFetch<RelationshipPair[]>(`/groups/${props.groupId}/relationships`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('dynamics.failedLoad');
    pairs.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.groupId, load);
onMounted(load);

defineExpose({ reload: load });
</script>
