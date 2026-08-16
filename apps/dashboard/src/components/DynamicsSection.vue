<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-tertiary">hub</span>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('dynamics.title') }}</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="!loading && !error && pairs.length > 0" type="button" class="btn btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-[11px]" @click="toggleExpandAll">
          <span class="material-symbols-outlined text-[16px]">{{ allExpanded ? 'unfold_less' : 'unfold_more' }}</span>
          {{ allExpanded ? t('dynamics.collapseAll') : t('dynamics.expandAll') }}
        </button>
        <span v-if="!loading && !error && pairs.length > 0" class="font-mono text-[11px] text-on-surface-variant">
          {{ t('dynamics.pairCount', { count: pairs.length }) }}
        </span>
      </div>
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

    <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="pair in pairs" :key="pair.id" class="rounded-xl border border-outline-variant bg-surface-variant/20 p-3">
        <!-- Collapsed row -->
        <div v-if="!isExpanded(pair.id)" class="flex items-start justify-between gap-2">
          <button
            type="button"
            class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start transition-colors hover:opacity-90"
            :aria-expanded="false"
            :aria-label="t('dynamics.expandPair', { a: pair.user_a_name, b: pair.user_b_name })"
            @click="toggleExpand(pair.id)"
          >
            <h3 class="font-sora text-[14px] font-semibold text-on-surface">{{ pair.user_a_name }} & {{ pair.user_b_name }}</h3>
            <p class="font-mono text-[10px] text-on-surface-variant/60">
              {{ compactScores(pair) }}
            </p>
          </button>
          <button
            type="button"
            class="icon-btn !min-h-0 !min-w-0 shrink-0 p-1.5 text-error hover:bg-error/10 hover:text-error disabled:opacity-40"
            :aria-label="t('dynamics.remove')"
            :disabled="removingId === pair.id || savingId === pair.id"
            @click="removePair(pair)"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>

        <!-- Expanded card -->
        <div v-else>
          <div class="mb-4 flex items-start justify-between gap-2">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-start gap-1 text-start transition-colors hover:opacity-90"
              :aria-expanded="true"
              :aria-label="t('dynamics.collapsePair', { a: pair.user_a_name, b: pair.user_b_name })"
              @click="toggleExpand(pair.id)"
            >
              <h3 class="font-sora text-[14px] font-semibold text-on-surface">{{ pair.user_a_name }} & {{ pair.user_b_name }}</h3>
              <span class="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/60">expand_less</span>
            </button>
            <button
              type="button"
              class="btn btn-secondary inline-flex shrink-0 items-center gap-1 !min-h-0 border-error/30 px-2.5 py-1 text-[11px] text-error hover:bg-error/[0.08]"
              :disabled="removingId === pair.id"
              @click="removePair(pair)"
            >
              <span class="material-symbols-outlined text-[14px]">delete</span>
              {{ t('dynamics.remove') }}
            </button>
          </div>

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

          <div>
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
                {{ t('dynamics.summary') }}
              </span>
              <button v-if="editingNarrativeId !== pair.id" type="button" class="btn btn-primary inline-flex items-center gap-1.5 !min-h-0 px-3 py-1.5 text-[12px]" @click="startEditNarrative(pair)">
                <span class="material-symbols-outlined text-[16px]">edit</span>
                {{ t('dynamics.editSummary') }}
              </button>
            </div>
            <div v-if="editingNarrativeId === pair.id" class="flex flex-col gap-2">
              <textarea
                v-model="narrativeDraft[pair.id]"
                rows="3"
                class="w-full resize-y rounded-lg border border-primary/40 bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                @keydown.escape="cancelEditNarrative(pair.id)"
              />
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn btn-primary px-2.5 py-1 text-[11px]" :disabled="savingId === pair.id" @click="saveNarrative(pair)">
                  {{ t('members.save') }}
                </button>
                <button type="button" class="btn btn-secondary px-2.5 py-1 text-[11px]" @click="cancelEditNarrative(pair.id)">
                  {{ t('members.cancel') }}
                </button>
              </div>
            </div>
            <p v-else class="text-[13px] leading-relaxed text-on-surface-variant">
              {{ pair.narrative || t('dynamics.noSummaryYet') }}
            </p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import LoadingState from './LoadingState.vue';
import type { RelationshipPair } from '@wavi/shared';
import { useConfirm } from '../composables/useConfirm';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();

const pairs = ref<RelationshipPair[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const savingId = ref<string | null>(null);
const removingId = ref<string | null>(null);
const editingNarrativeId = ref<string | null>(null);
const narrativeDraft = reactive<Record<string, string>>({});
const expandedIds = ref<Set<string>>(new Set());

const allExpanded = computed(() => pairs.value.length > 0 && pairs.value.every((p) => expandedIds.value.has(p.id)));

function isExpanded(pairId: string) {
  return expandedIds.value.has(pairId);
}

function toggleExpand(pairId: string) {
  const next = new Set(expandedIds.value);
  if (next.has(pairId)) next.delete(pairId);
  else next.add(pairId);
  expandedIds.value = next;
}

function expandAll() {
  expandedIds.value = new Set(pairs.value.map((p) => p.id));
}

function collapseAll() {
  if (editingNarrativeId.value) cancelEditNarrative(editingNarrativeId.value);
  expandedIds.value = new Set();
}

function toggleExpandAll() {
  if (allExpanded.value) collapseAll();
  else expandAll();
}

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

function compactScores(pair: RelationshipPair) {
  return scoreBars(pair)
    .map((bar) => `${bar.label} ${bar.percent}%`)
    .join(' · ');
}

function startEditNarrative(pair: RelationshipPair) {
  expandPair(pair.id);
  editingNarrativeId.value = pair.id;
  narrativeDraft[pair.id] = pair.narrative ?? '';
}

function expandPair(pairId: string) {
  if (expandedIds.value.has(pairId)) return;
  expandedIds.value = new Set([...expandedIds.value, pairId]);
}

function cancelEditNarrative(pairId: string) {
  editingNarrativeId.value = null;
  delete narrativeDraft[pairId];
}

async function saveNarrative(pair: RelationshipPair) {
  const narrative = narrativeDraft[pair.id]?.trim() ?? '';
  if (narrative === (pair.narrative ?? '')) {
    cancelEditNarrative(pair.id);
    return;
  }

  savingId.value = pair.id;
  error.value = null;
  try {
    const updated = await apiFetch<RelationshipPair>(`/groups/${props.groupId}/relationships/${pair.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ narrative }),
    });
    pairs.value = pairs.value.map((p) => (p.id === pair.id ? updated : p));
    cancelEditNarrative(pair.id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('dynamics.failedSave');
  } finally {
    savingId.value = null;
  }
}

const { confirm } = useConfirm();

async function removePair(pair: RelationshipPair) {
  const ok = await confirm({
    title: t('dynamics.confirmRemoveTitle'),
    message: t('dynamics.confirmRemove', { a: pair.user_a_name, b: pair.user_b_name }),
    confirmLabel: t('dynamics.remove'),
    variant: 'destructive',
  });
  if (!ok) return;

  const previous = [...pairs.value];
  pairs.value = pairs.value.filter((p) => p.id !== pair.id);
  if (editingNarrativeId.value === pair.id) cancelEditNarrative(pair.id);
  expandedIds.value = new Set([...expandedIds.value].filter((id) => id !== pair.id));
  error.value = null;
  removingId.value = pair.id;

  try {
    await apiFetch(`/groups/${props.groupId}/relationships/${pair.id}`, { method: 'DELETE' });
  } catch (e) {
    pairs.value = previous;
    error.value = e instanceof Error ? e.message : t('dynamics.failedRemove');
  } finally {
    removingId.value = null;
  }
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
