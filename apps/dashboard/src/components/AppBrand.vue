<template>
  <div class="flex flex-col gap-3 border-b border-outline-variant px-5 py-5">
    <div class="flex items-center gap-3">
      <img src="/wavi-mascot.jpg" alt="Wavi mascot" class="h-9 w-9 rounded-lg object-contain ring-1 ring-outline-variant/30" />
      <div>
        <h2 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">Wavi</h2>
        <p class="text-[11px] text-on-surface-variant">{{ t('brand.tagline') }}</p>
      </div>
    </div>

    <AgentStatusBadge />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AgentStatusBadge from './AgentStatusBadge.vue';

const { t } = useI18n();
</script>
