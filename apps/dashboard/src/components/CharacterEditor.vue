<template>
  <section v-if="localConfig" class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-tertiary">psychology</span>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">
          {{ t('character.title') }}
        </h2>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="isDirty" class="text-[11px] font-medium text-secondary">{{ t('character.unsaved') }}</span>
        <button class="btn btn-primary flex items-center gap-2" :disabled="!isDirty || saving" @click="save">
          <span class="material-symbols-outlined text-[16px]">save</span>
          {{ saving ? t('character.saving') : t('character.save') }}
        </button>
      </div>
    </div>

    <div v-if="saveError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ saveError }}
    </div>

    <div class="mb-4">
      <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {{ t('character.voice') }}
      </label>
      <p class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2.5 text-[13px] leading-relaxed text-on-surface-variant">
        {{ localConfig.voice }}
      </p>
    </div>

    <div class="mb-4">
      <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {{ t('character.opinions') }}
      </label>
      <div class="space-y-2">
        <textarea
          v-for="(_, idx) in localConfig.opinions"
          :key="idx"
          v-model="localConfig.opinions[idx]"
          rows="2"
          class="w-full resize-y rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
        />
      </div>
    </div>

    <div class="mb-4">
      <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {{ t('character.signature') }}
      </label>
      <textarea
        v-model="localConfig.signature_behavior"
        rows="2"
        class="w-full resize-y rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
      />
    </div>

    <div>
      <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {{ t('character.sliders') }}
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="slider in sliders" :key="slider.key">
          <div class="mb-1 flex items-center justify-between text-[12px]">
            <span class="text-on-surface">{{ t(`character.slider.${slider.key}`) }}</span>
            <span class="font-mono tabular-nums text-on-surface-variant">
              {{ localConfig.sliders[slider.key] }}
            </span>
          </div>
          <input v-model.number="localConfig.sliders[slider.key]" type="range" min="0" max="100" class="w-full accent-primary" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import type { GroupWithStats, CharacterConfig, PersonalitySliders } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();
const emit = defineEmits<{ updated: [group: GroupWithStats] }>();

const store = useGroupsStore();
const saving = ref(false);
const saveError = ref<string | null>(null);

const sliders: { key: keyof PersonalitySliders; label: string }[] = [
  { key: 'formality', label: 'formality' },
  { key: 'humor', label: 'humor' },
  { key: 'verbosity', label: 'verbosity' },
  { key: 'assertiveness', label: 'assertiveness' },
  { key: 'empathy', label: 'empathy' },
];

function cloneConfig(config: CharacterConfig): CharacterConfig {
  return JSON.parse(JSON.stringify(config));
}

const localConfig = ref<CharacterConfig | null>(props.group.character_config ? cloneConfig(props.group.character_config) : null);

watch(
  () => props.group.character_config,
  (config) => {
    localConfig.value = config ? cloneConfig(config) : null;
  },
);

const isDirty = computed(() => {
  if (!localConfig.value || !props.group.character_config) return false;
  return JSON.stringify(localConfig.value) !== JSON.stringify(props.group.character_config);
});

async function save() {
  if (!localConfig.value || !isDirty.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    const updated = await store.updateCharacter(props.group.id, localConfig.value);
    localConfig.value = updated.character_config ? cloneConfig(updated.character_config) : null;
    emit('updated', updated);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('character.failedSave');
  } finally {
    saving.value = false;
  }
}
</script>
