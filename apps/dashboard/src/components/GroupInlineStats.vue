<template>
  <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-on-surface-variant">
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[13px]">group</span>
      {{ group.member_count ?? '—' }}
    </span>
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[13px]">person</span>
      {{ group.profile_count ?? 0 }}
    </span>
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[13px]">chat</span>
      {{ group.message_count_today }}
    </span>
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[13px]">smart_toy</span>
      {{ group.reply_count_today }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { GroupWithStats } from '@wavi/shared';

defineProps<{ group: GroupWithStats }>();
</script>
