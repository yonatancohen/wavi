<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header hidden lg:block">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
        {{ t('testChat.title') }}
      </h1>
      <p class="mt-0.5 text-[12px] text-on-surface-variant">
        {{ t('testChat.subtitle') }}
      </p>
    </header>

    <div class="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-margin-mobile py-7 lg:px-margin-desktop">
      <TestChatPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TestChatPanel from '../components/TestChatPanel.vue';

const { t } = useI18n();
</script>
