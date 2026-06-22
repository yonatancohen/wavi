<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
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
      class="w-full max-w-xs rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
      :disabled="saving"
      @change="saveLanguage"
    >
      <option value="he">{{ t('groupSettings.languageHe') }}</option>
      <option value="en">{{ t('groupSettings.languageEn') }}</option>
      <option value="auto">{{ t('groupSettings.languageAuto') }}</option>
    </select>
    <p v-if="saving" class="mt-2 text-[11px] text-on-surface-variant">{{ t('groupSettings.saving') }}</p>
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
const saving = ref(false);
const saveError = ref<string | null>(null);

watch(
  () => props.group.language_mode,
  (mode) => {
    languageMode.value = mode ?? 'he';
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
</script>
