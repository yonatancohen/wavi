<template>
  <div class="flex flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container-high/50 p-1" role="tablist" :aria-label="t('usage.periodToggle')">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
      :class="modelValue === tab.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'"
      :aria-selected="modelValue === tab.id"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UsagePeriodId } from '../composables/useUsagePeriod';

defineProps<{
  modelValue: UsagePeriodId;
}>();

const emit = defineEmits<{
  'update:modelValue': [id: UsagePeriodId];
}>();

const { t } = useI18n();

const tabs = computed(() => [
  { id: 'today' as const, label: t('usage.periods.today') },
  { id: 'week' as const, label: t('usage.periods.week') },
  { id: 'month' as const, label: t('usage.periods.month') },
  { id: 'all_time' as const, label: t('usage.periods.allTime') },
]);
</script>
