<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="page-header hidden lg:block">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('testChat.title') }}
      </h1>
      <p class="mt-0.5 text-[12px] text-on-surface-variant">
        {{ t('testChat.subtitle') }}
      </p>
    </header>

    <div class="page-content flex min-h-0 flex-1 flex-col py-7">
      <TestChatPanel class="min-h-0 flex-1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TestChatPanel from '../components/TestChatPanel.vue';

const { t } = useI18n();
</script>
