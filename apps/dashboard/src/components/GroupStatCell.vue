<template>
  <div class="rounded-xl border border-outline-variant/70 bg-surface-variant/20 px-3 py-2.5" :class="compact ? 'py-2' : 'py-2.5'">
    <div class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
      <span class="material-symbols-outlined text-[14px]">{{ icon }}</span>
      {{ label }}
    </div>
    <div
      class="font-semibold leading-none text-on-surface"
      :class="[valueClass, numeric === false ? 'font-body text-[13px]' : 'font-mono tabular-nums', compact ? 'text-[16px]' : numeric === false ? 'text-[13px]' : 'text-[18px]']"
    >
      {{ value }}
    </div>
    <p v-if="hint" class="mt-1 text-[10px] leading-snug text-on-surface-variant/70">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    icon: string;
    hint?: string;
    valueClass?: string;
    compact?: boolean;
    numeric?: boolean;
  }>(),
  { compact: false, hint: undefined, valueClass: '', numeric: true },
);
</script>
