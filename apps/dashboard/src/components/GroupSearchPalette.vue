<template>
  <Teleport to="body">
    <Transition name="palette-backdrop">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[min(20vh,8rem)]"
        role="dialog"
        aria-modal="true"
        :aria-label="t('search.placeholder')"
        @mousedown.self="emit('close')"
      >
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

        <Transition name="palette-modal">
          <div v-if="open" ref="panelRef" class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-outline-variant bg-surface-container shadow-2xl" @keydown="onKeydown">
            <div class="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
              <span class="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
              <input
                ref="inputRef"
                v-model="query"
                type="search"
                class="min-w-0 flex-1 bg-transparent text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/60"
                :placeholder="t('search.placeholder')"
                autocomplete="off"
                spellcheck="false"
              />
              <kbd class="hidden shrink-0 rounded-md border border-outline-variant bg-surface-variant/30 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant sm:inline">
                {{ shortcutHint }}
              </kbd>
            </div>

            <div v-if="loading" class="px-4 py-8 text-center text-[13px] text-on-surface-variant">
              {{ t('groups.loading') }}
            </div>

            <div v-else-if="results.length === 0" class="px-4 py-8 text-center text-[13px] text-on-surface-variant">
              {{ t('search.noResults') }}
            </div>

            <ul v-else ref="listRef" class="max-h-[min(50vh,20rem)] overflow-y-auto py-2" role="listbox">
              <li v-for="(group, index) in results" :key="group.id" role="option" :aria-selected="index === activeIndex">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors"
                  :class="index === activeIndex ? 'bg-primary/10' : 'hover:bg-surface-variant/40'"
                  @click="selectGroup(group.id)"
                  @mouseenter="activeIndex = index"
                >
                  <span class="material-symbols-outlined shrink-0 text-[18px] text-primary">forum</span>
                  <span class="min-w-0 flex-1 truncate font-sora text-[13px] font-medium text-on-surface">
                    {{ group.name }}
                  </span>
                  <span class="badge shrink-0 px-2 py-0.5 text-[10px]" :class="statusBadgeClass(group.status)">
                    {{ statusLabel(group.status, t) }}
                  </span>
                </button>
              </li>
            </ul>

            <div class="flex items-center gap-4 border-t border-outline-variant/60 px-4 py-2.5 text-[10px] text-on-surface-variant/70">
              <span class="flex items-center gap-1">
                <kbd class="rounded border border-outline-variant bg-surface-variant/30 px-1 font-mono">↑↓</kbd>
                {{ t('search.navigate') }}
              </span>
              <span class="flex items-center gap-1">
                <kbd class="rounded border border-outline-variant bg-surface-variant/30 px-1 font-mono">↵</kbd>
                {{ t('search.select') }}
              </span>
              <span class="flex items-center gap-1">
                <kbd class="rounded border border-outline-variant bg-surface-variant/30 px-1 font-mono">esc</kbd>
                {{ t('search.close') }}
              </span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGroupsStore } from '../stores/groups';
import { statusBadgeClass, statusLabel } from '../lib/ui';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const router = useRouter();
const groupsStore = useGroupsStore();
const { groups, loading } = storeToRefs(groupsStore);

const query = ref('');
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLUListElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);

const shortcutHint = computed(() => {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
    return '⌘K';
  }
  return 'Ctrl+K';
});

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  const sorted = [...groups.value].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted;
  return sorted.filter((g) => g.name.toLowerCase().includes(q));
});

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      query.value = '';
      activeIndex.value = 0;
      return;
    }

    if (groups.value.length === 0) {
      try {
        await groupsStore.fetchGroups();
      } catch {
        // Empty results + noResults copy is enough; store.error is not surfaced here.
      }
    }

    await nextTick();
    inputRef.value?.focus();
    activeIndex.value = 0;
  },
);

watch(query, () => {
  activeIndex.value = 0;
});

watch(activeIndex, async (index) => {
  await nextTick();
  const list = listRef.value;
  if (!list) return;
  const item = list.children[index] as HTMLElement | undefined;
  item?.scrollIntoView({ block: 'nearest' });
});

function selectGroup(id: string) {
  emit('close');
  void router.push(`/groups/${id}`);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }

  if (results.value.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % results.value.length;
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length;
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const group = results.value[activeIndex.value];
    if (group) selectGroup(group.id);
  }
}
</script>

<style scoped>
.palette-backdrop-enter-active,
.palette-backdrop-leave-active {
  transition: opacity 150ms ease;
}
.palette-backdrop-enter-from,
.palette-backdrop-leave-to {
  opacity: 0;
}

.palette-modal-enter-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.palette-modal-leave-active {
  transition:
    opacity 100ms ease,
    transform 100ms ease;
}
.palette-modal-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.palette-modal-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
