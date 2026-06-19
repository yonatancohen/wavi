<template>
  <div
    :class="[
      variant === 'inline' && 'inline-flex items-center gap-2.5',
      variant === 'overlay' && 'flex flex-col items-center justify-center px-6 py-14 text-center',
      variant === 'compact' && 'flex h-full w-full flex-col items-center justify-center gap-3',
    ]"
    role="status"
    aria-live="polite"
    :aria-label="message"
  >
    <div
      class="relative shrink-0"
      :class="spinnerSize"
      aria-hidden="true"
    >
      <div class="absolute inset-0 rounded-full border border-outline-variant/40" />
      <div
        class="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-primary motion-reduce:animate-none motion-reduce:border-t-primary/70"
      />
    </div>

    <p
      class="text-on-surface-variant"
      :class="[
        variant === 'inline' ? 'text-sm' : 'text-sm font-medium',
        variant === 'compact' && 'text-[#666]',
      ]"
    >
      {{ message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    message?: string
    variant?: 'inline' | 'overlay' | 'compact'
  }>(),
  {
    message: 'Loading…',
    variant: 'overlay',
  },
)

const spinnerSize = computed(() => {
  switch (props.variant) {
    case 'inline':
      return 'h-4 w-4'
    case 'compact':
      return 'h-8 w-8'
    default:
      return 'h-6 w-6'
  }
})
</script>
