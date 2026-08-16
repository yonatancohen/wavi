<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-start gap-2">
        <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-secondary">waving_hand</span>
        <div class="min-w-0">
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('welcomeMsg.sectionTitle') }}</h2>
          <p class="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{{ t('welcomeMsg.sectionDesc') }}</p>
        </div>
      </div>
      <button type="button" class="btn btn-secondary shrink-0 flex items-center gap-2" :disabled="!hasCharacter" @click="emit('generate')">
        <span class="material-symbols-outlined text-[16px]">waving_hand</span>
        {{ t('welcomeMsg.generate') }}
      </button>
    </div>
    <p v-if="!hasCharacter" class="mt-2 ps-7 text-[11px] text-on-surface-variant">
      {{ t('welcomeMsg.needsCharacter') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ hasCharacter: boolean }>();
const emit = defineEmits<{ generate: [] }>();

const { t } = useI18n();
</script>
