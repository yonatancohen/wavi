<template>
  <section class="flex h-full min-h-0 flex-col rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-tertiary">tune</span>
      <div>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">
          {{ t('groupSettings.title') }}
        </h2>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">{{ t('groupSettings.languageHint') }}</p>
      </div>
    </div>

    <div v-if="saveError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ saveError }}
    </div>

    <div class="flex flex-1 flex-col divide-y divide-outline-variant/60 rounded-xl border border-outline-variant/60 bg-surface-variant/10">
      <!-- Group name -->
      <div class="p-3.5">
        <label class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          {{ t('groupSettings.groupName') }}
        </label>
        <p class="text-[14px] font-semibold text-on-surface">{{ group.name }}</p>
        <p class="mt-1 text-[11px] leading-relaxed text-on-surface-variant">
          {{ group.is_draft ? t('groupSettings.groupNameDraftHint') : t('groupSettings.groupNameHint') }}
        </p>
        <div class="mt-2.5 flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]" :disabled="group.is_draft || syncingName" @click="syncNameFromWhatsApp">
            <span class="material-symbols-outlined text-[16px]" :class="{ 'animate-spin': syncingName }">sync</span>
            {{ syncingName ? t('groupSettings.syncingName') : t('groupSettings.syncName') }}
          </button>
          <span v-if="nameSyncMessage" class="text-[11px] font-medium text-secondary">{{ nameSyncMessage }}</span>
        </div>
      </div>

      <!-- Reply language -->
      <div class="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <label class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.language') }}</label>
        <select
          v-model="languageMode"
          class="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50 sm:max-w-[11rem]"
          :disabled="saving"
          @change="saveLanguage"
        >
          <option value="he">{{ t('groupSettings.languageHe') }}</option>
          <option value="en">{{ t('groupSettings.languageEn') }}</option>
          <option value="auto">{{ t('groupSettings.languageAuto') }}</option>
        </select>
      </div>

      <!-- Web search -->
      <div class="flex items-start justify-between gap-4 p-3.5">
        <div class="min-w-0">
          <p class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.webSearch') }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
            {{ t('groupSettings.webSearchHint') }}
          </p>
          <p v-if="savingWebSearch" class="mt-1 text-[10px] text-on-surface-variant">{{ t('groupSettings.saving') }}</p>
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
          <span class="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="webSearchEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
        </button>
      </div>

      <!-- Image generation -->
      <div class="flex items-start justify-between gap-4 p-3.5">
        <div class="min-w-0">
          <p class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.imageGeneration') }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
            {{ t('groupSettings.imageGenerationHint') }}
          </p>
          <p v-if="savingImage" class="mt-1 text-[10px] text-on-surface-variant">{{ t('groupSettings.saving') }}</p>
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
          <span class="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="imageGenerationEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import type { GroupWithStats, LanguageMode } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();
const emit = defineEmits<{ updated: [group: GroupWithStats] }>();

const store = useGroupsStore();
const languageMode = ref<LanguageMode>(props.group.language_mode ?? 'he');
const webSearchEnabled = ref(props.group.web_search_enabled ?? false);
const imageGenerationEnabled = ref(props.group.image_generation_enabled ?? false);
const saving = ref(false);
const savingWebSearch = ref(false);
const savingImage = ref(false);
const syncingName = ref(false);
const nameSyncMessage = ref<string | null>(null);
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

watch(
  () => props.group.name,
  () => {
    nameSyncMessage.value = null;
  },
);

async function syncNameFromWhatsApp() {
  if (props.group.is_draft || syncingName.value) return;
  syncingName.value = true;
  saveError.value = null;
  nameSyncMessage.value = null;
  try {
    const result = await store.syncGroupName(props.group.id);
    emit('updated', result.group);
    nameSyncMessage.value = result.name_updated ? t('groupSettings.nameSynced', { name: result.group.name }) : t('groupSettings.nameAlreadyCurrent');
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('groupSettings.failedSyncName');
  } finally {
    syncingName.value = false;
  }
}

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
