<template>
  <section class="flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-tertiary">tune</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">
        {{ t('groupSettings.title') }}
      </h2>
    </div>
    <p class="mb-4 text-[13px] leading-relaxed text-on-surface-variant">
      {{ t('groupSettings.languageHint') }}
    </p>

    <div v-if="saveError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ saveError }}
    </div>

    <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
      {{ t('groupSettings.language') }}
    </label>
    <select
      v-model="languageMode"
      class="mb-6 w-full max-w-xs rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
      :disabled="saving"
      @change="saveLanguage"
    >
      <option value="he">{{ t('groupSettings.languageHe') }}</option>
      <option value="en">{{ t('groupSettings.languageEn') }}</option>
      <option value="auto">{{ t('groupSettings.languageAuto') }}</option>
    </select>

    <div class="mb-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.webSearch') }}</p>
          <p class="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
            {{ t('groupSettings.webSearchHint') }}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="webSearchEnabled"
          class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
          :class="webSearchEnabled ? 'bg-primary' : 'bg-outline-variant'"
          :disabled="savingWebSearch"
          @click="toggleWebSearch"
        >
          <span class="absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="webSearchEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
        </button>
      </div>
      <p v-if="savingWebSearch" class="mt-2 text-[11px] text-on-surface-variant">{{ t('groupSettings.saving') }}</p>
    </div>

    <div class="mb-6 border-t border-outline-variant pt-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.imageGeneration') }}</p>
          <p class="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
            {{ t('groupSettings.imageGenerationHint') }}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="imageGenerationEnabled"
          class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
          :class="imageGenerationEnabled ? 'bg-primary' : 'bg-outline-variant'"
          :disabled="savingImage"
          @click="toggleImageGeneration"
        >
          <span class="absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="imageGenerationEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
        </button>
      </div>
      <p v-if="savingImage" class="mt-2 text-[11px] text-on-surface-variant">{{ t('groupSettings.saving') }}</p>
    </div>

    <div class="mt-auto border-t border-outline-variant pt-5">
      <RebuildIntelligence embedded :group-id="group.id" @complete="emit('rebuildComplete')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import RebuildIntelligence from './RebuildIntelligence.vue';
import type { GroupWithStats, LanguageMode } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();
const emit = defineEmits<{ updated: [group: GroupWithStats]; rebuildComplete: [] }>();

const store = useGroupsStore();
const languageMode = ref<LanguageMode>(props.group.language_mode ?? 'he');
const webSearchEnabled = ref(props.group.web_search_enabled ?? false);
const imageGenerationEnabled = ref(props.group.image_generation_enabled ?? false);
const saving = ref(false);
const savingWebSearch = ref(false);
const savingImage = ref(false);
const saveError = ref<string | null>(null);

watch(
  () => props.group.language_mode,
  (mode) => {
    languageMode.value = mode ?? 'he';
  },
);

watch(
  () => props.group.web_search_enabled,
  (enabled) => {
    webSearchEnabled.value = enabled ?? false;
  },
);

watch(
  () => props.group.image_generation_enabled,
  (enabled) => {
    imageGenerationEnabled.value = enabled ?? false;
  },
);

async function saveLanguage() {
  if (languageMode.value === props.group.language_mode) return;
  saving.value = true;
  saveError.value = null;
  try {
    const updated = await store.patchGroup(props.group.id, { language_mode: languageMode.value });
    emit('updated', updated);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('groupSettings.failedSave');
    languageMode.value = props.group.language_mode ?? 'he';
  } finally {
    saving.value = false;
  }
}

async function toggleWebSearch() {
  const next = !webSearchEnabled.value;
  webSearchEnabled.value = next;
  savingWebSearch.value = true;
  saveError.value = null;
  try {
    const updated = await store.patchGroup(props.group.id, { web_search_enabled: next });
    emit('updated', updated);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('groupSettings.failedSave');
    webSearchEnabled.value = props.group.web_search_enabled ?? false;
  } finally {
    savingWebSearch.value = false;
  }
}

async function toggleImageGeneration() {
  const next = !imageGenerationEnabled.value;
  imageGenerationEnabled.value = next;
  savingImage.value = true;
  saveError.value = null;
  try {
    const updated = await store.patchGroup(props.group.id, { image_generation_enabled: next });
    emit('updated', updated);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('groupSettings.failedSave');
    imageGenerationEnabled.value = props.group.image_generation_enabled ?? false;
  } finally {
    savingImage.value = false;
  }
}
</script>
