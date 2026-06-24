<template>
  <div class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-on-surface-variant">
    <HelpTooltip :title="t('groupDetail.stats.members')">
      <span class="flex cursor-default items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-on-surface/[0.06] hover:text-on-surface">
        <span class="material-symbols-outlined text-[13px]">group</span>
        {{ group.member_count ?? '—' }}
      </span>
    </HelpTooltip>
    <HelpTooltip :title="t('groupDetail.stats.profiles')">
      <span class="flex cursor-default items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-on-surface/[0.06] hover:text-on-surface">
        <span class="material-symbols-outlined text-[13px]">person</span>
        {{ group.profile_count ?? 0 }}
      </span>
    </HelpTooltip>
    <HelpTooltip :title="t('groupDetail.stats.messagesToday')">
      <span class="flex cursor-default items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-on-surface/[0.06] hover:text-on-surface">
        <span class="material-symbols-outlined text-[13px]">chat</span>
        {{ group.message_count_today }}
      </span>
    </HelpTooltip>
    <HelpTooltip :title="t('groupDetail.stats.repliesToday')">
      <span class="flex cursor-default items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-on-surface/[0.06] hover:text-on-surface">
        <span class="material-symbols-outlined text-[13px]">smart_toy</span>
        {{ group.reply_count_today }}
      </span>
    </HelpTooltip>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';
import HelpTooltip from './HelpTooltip.vue';

defineProps<{ group: GroupWithStats }>();

const { t } = useI18n();
</script>
