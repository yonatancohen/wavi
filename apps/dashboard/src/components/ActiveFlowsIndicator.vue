<template>
  <div v-if="total > 0" class="rounded-xl border border-secondary/25 bg-secondary/[0.06]" :class="compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'">
    <div class="flex items-center gap-2" :class="compact ? '' : 'mb-2'">
      <div class="relative flex h-2 w-2 shrink-0 items-center justify-center">
        <div class="absolute h-2 w-2 animate-status-pulse rounded-full bg-secondary" />
        <div class="h-1.5 w-1.5 rounded-full bg-secondary" />
      </div>
      <p class="font-mono font-semibold uppercase tracking-widest text-secondary" :class="compact ? 'text-[9px]' : 'text-[10px]'">
        {{ t('flows.activeCount', total) }}
      </p>
    </div>

    <ul v-if="!compact" class="space-y-1.5">
      <li v-for="flow in flows" :key="flow.id" class="rounded-lg border border-on-surface/[0.05] bg-surface-container-high/40 px-2.5 py-2">
        <div class="mb-0.5 flex items-center justify-between gap-2">
          <span class="truncate text-[11px] font-semibold text-on-surface">
            {{ flow.sender_name }}
          </span>
          <span
            class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            :class="flow.status === 'processing' ? 'bg-secondary/15 text-secondary' : 'bg-on-surface/[0.06] text-on-surface-variant'"
          >
            {{ flow.status === 'processing' ? t('flows.processing') : t('flows.queued') }}
          </span>
        </div>
        <p class="truncate text-[10px] text-on-surface-variant">
          {{ flow.group_name }}
        </p>
        <p v-if="flow.message_preview" class="mt-0.5 truncate text-[11px] italic text-on-surface-variant/80">"{{ flow.message_preview }}"</p>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ReplyFlow } from '@wavi/shared';

defineProps<{
  total: number;
  flows: ReplyFlow[];
  compact?: boolean;
}>();

const { t } = useI18n();
</script>
