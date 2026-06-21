<template>
  <div class="flex flex-col gap-3 border-b border-outline-variant px-5 py-5">
    <div class="flex items-center gap-3">
      <img
        src="/wavi-mascot.jpg"
        alt="Wavi mascot"
        class="h-9 w-9 rounded-lg object-contain ring-1 ring-outline-variant/30"
      />
      <div>
        <h2 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">Wavi</h2>
        <p class="text-[11px] text-on-surface-variant">{{ t('brand.tagline') }}</p>
      </div>
    </div>

    <div
      class="flex w-fit items-center gap-2 rounded-full border px-2.5 py-1"
      :class="connected
        ? 'border-primary/20 bg-primary/[0.07]'
        : 'border-error/20 bg-error/[0.07]'"
    >
      <div
        class="h-1.5 w-1.5 rounded-full"
        :class="connected ? 'animate-status-pulse bg-primary' : 'bg-error'"
      />
      <span
        class="font-mono text-[10px] font-semibold uppercase tracking-widest"
        :class="connected ? 'text-primary' : 'text-error'"
      >
        {{ connected ? t('status.connected') : t('status.offline') }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ connected: boolean }>()

const { t } = useI18n()
</script>
