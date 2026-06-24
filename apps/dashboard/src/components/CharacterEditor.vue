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

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {{ t('character.replyModel') }}
          </label>
          <select
            v-model="localConfig.reply_model"
            class="w-full max-w-xs rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
          >
            <option :value="DEFAULT_REPLY_MODEL">{{ t('character.modelHaiku') }}</option>
            <option value="claude-sonnet-4-6">{{ t('character.modelSonnet') }}</option>
          </select>
          <p class="mt-1.5 text-[11px] text-on-surface-variant">{{ t('character.replyModelHint') }}</p>
        </div>

        <div>
          <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {{ t('character.voice') }}
          </label>
          <p class="mb-2 text-[11px] leading-relaxed text-on-surface-variant/80">
            {{ t('character.voiceHint') }}
          </p>
          <p class="rounded-xl border border-outline-variant bg-surface-variant/20 px-3 py-2.5 text-[13px] leading-relaxed text-on-surface-variant">
            {{ localConfig.voice }}
          </p>
        </div>

        <div>
          <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {{ t('character.signature') }}
          </label>
          <p class="mb-2 text-[11px] leading-relaxed text-on-surface-variant/80">
            {{ t('character.signatureHint') }}
          </p>
          <textarea
            v-model="localConfig.signature_behavior"
            rows="2"
            :placeholder="t('character.signaturePlaceholder')"
            class="w-full resize-none rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
          />
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {{ t('character.opinions') }}
          </label>
          <p class="mb-2 text-[11px] leading-relaxed text-on-surface-variant/80">
            {{ t('character.opinionsHint') }}
          </p>
          <div class="space-y-2">
            <div v-for="(_, idx) in localConfig.opinions" :key="idx" class="flex items-start gap-2">
              <textarea
                v-model="localConfig.opinions[idx]"
                rows="2"
                :placeholder="t('character.opinionPlaceholder')"
                class="min-w-0 flex-1 resize-none rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50"
              />
              <button type="button" class="icon-btn mt-1.5 shrink-0 !min-h-0 p-1.5 text-on-surface-variant/60 hover:text-error" :title="t('character.removeOpinion')" @click="removeOpinion(idx)">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
          <button v-if="localConfig.opinions.length < MAX_OPINIONS" type="button" class="btn btn-secondary mt-2 inline-flex items-center gap-1.5 !min-h-0 px-3 py-1.5 text-[11px]" @click="addOpinion">
            <span class="material-symbols-outlined text-[16px]">add</span>
            {{ t('character.addOpinion') }}
          </button>
        </div>

        <div>
          <label class="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            {{ t('character.sliders') }}
          </label>
          <p class="mb-3 text-[11px] leading-relaxed text-on-surface-variant/80">
            {{ t('character.slidersHint') }}
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div v-for="slider in sliders" :key="slider.key">
              <div class="mb-1 flex items-center justify-between gap-2 text-[12px]">
                <span class="text-on-surface">{{ t(`character.slider.${slider.key}`) }}</span>
                <span class="shrink-0 font-mono tabular-nums text-on-surface-variant">
                  {{ localConfig.sliders[slider.key] }}
                </span>
              </div>
              <p class="mb-1.5 text-[10px] leading-snug text-on-surface-variant/75">
                {{ t(`character.sliderDesc.${slider.key}`) }}
              </p>
              <input v-model.number="localConfig.sliders[slider.key]" type="range" min="0" max="100" class="w-full accent-primary" />
            </div>
            <div class="sm:col-span-2">
              <div class="mb-1 flex items-center justify-between gap-2 text-[12px]">
                <span class="text-on-surface">{{ t('character.slider.emoji_usage') }}</span>
                <span class="shrink-0 font-medium text-on-surface-variant">
                  {{ t(`character.emojiUsage.${localConfig.sliders.emoji_usage}`) }}
                </span>
              </div>
              <p class="mb-1.5 text-[10px] leading-snug text-on-surface-variant/75">
                {{ t('character.sliderDesc.emoji_usage') }}
              </p>
              <input :value="emojiUsageIndex" type="range" min="0" :max="EMOJI_USAGE_LEVELS.length - 1" step="1" class="w-full accent-primary" @input="onEmojiUsageInput" />
              <div class="mt-1 flex justify-between text-[10px] text-on-surface-variant/70">
                <span v-for="level in EMOJI_USAGE_LEVELS" :key="level">
                  {{ t(`character.emojiUsage.${level}`) }}
                </span>
              </div>
            </div>
          </div>
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
import { DEFAULT_REPLY_MODEL, EMOJI_USAGE_LEVELS, normalizePersonalitySliders } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();
const emit = defineEmits<{ updated: [group: GroupWithStats] }>();

const store = useGroupsStore();
const saving = ref(false);
const saveError = ref<string | null>(null);
const MAX_OPINIONS = 3;

const sliders: { key: Exclude<keyof PersonalitySliders, 'emoji_usage'>; label: string }[] = [
  { key: 'formality', label: 'formality' },
  { key: 'humor', label: 'humor' },
  { key: 'verbosity', label: 'verbosity' },
  { key: 'assertiveness', label: 'assertiveness' },
  { key: 'empathy', label: 'empathy' },
];

function cloneConfig(config: CharacterConfig): CharacterConfig {
  const cloned = JSON.parse(JSON.stringify(config)) as CharacterConfig;
  if (!cloned.reply_model) cloned.reply_model = DEFAULT_REPLY_MODEL;
  cloned.sliders = normalizePersonalitySliders(cloned.sliders);
  return cloned;
}

const emojiUsageIndex = computed(() => EMOJI_USAGE_LEVELS.indexOf(localConfig.value?.sliders.emoji_usage ?? 'medium'));

function onEmojiUsageInput(event: Event) {
  if (!localConfig.value) return;
  const index = Number((event.target as HTMLInputElement).value);
  localConfig.value.sliders.emoji_usage = EMOJI_USAGE_LEVELS[index] ?? 'medium';
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

function addOpinion() {
  if (!localConfig.value || localConfig.value.opinions.length >= MAX_OPINIONS) return;
  localConfig.value.opinions.push('');
}

function removeOpinion(index: number) {
  if (!localConfig.value) return;
  localConfig.value.opinions.splice(index, 1);
}

async function save() {
  if (!localConfig.value || !isDirty.value) return;
  saving.value = true;
  saveError.value = null;
  const payload: CharacterConfig = {
    ...localConfig.value,
    opinions: localConfig.value.opinions.map((o) => o.trim()).filter(Boolean),
  };
  try {
    const updated = await store.updateCharacter(props.group.id, payload);
    localConfig.value = updated.character_config ? cloneConfig(updated.character_config) : null;
    emit('updated', updated);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('character.failedSave');
  } finally {
    saving.value = false;
  }
}
</script>
