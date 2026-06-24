<template>
  <section class="border-b border-outline-variant bg-surface/95">
    <div class="flex items-center gap-2 px-margin-mobile py-3 lg:hidden">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-start"
        :aria-expanded="detailsExpanded"
        :aria-label="detailsExpanded ? t('groupDetail.overview.collapse') : t('groupDetail.overview.expand')"
        @click="detailsExpanded = !detailsExpanded"
      >
        <div class="min-w-0 flex-1">
          <p class="font-sora text-[13px] font-semibold text-on-surface">{{ t('groupDetail.overview.title') }}</p>
          <p class="mt-0.5 truncate font-mono text-[11px] text-on-surface-variant">{{ collapsedSummary }}</p>
        </div>
        <span class="material-symbols-outlined shrink-0 text-[20px] text-on-surface-variant">
          {{ detailsExpanded ? 'expand_less' : 'expand_more' }}
        </span>
      </button>
      <ActionButtons :group="group" :saving="saving" @go-live="emit('goLive')" @pause="emit('pause')" />
    </div>

    <div class="px-margin-mobile pb-4 lg:px-margin-desktop lg:pb-5" :class="{ 'hidden lg:block': !detailsExpanded }">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="group.is_draft" class="badge shrink-0 px-2.5 py-1" :class="draftBadgeClass()">
            {{ draftLabel(t) }}
          </span>
          <span class="badge shrink-0 px-2.5 py-1" :class="statusBadgeClass(group.status)">
            {{ statusLabel(group.status, t) }}
          </span>
        </div>
        <ActionButtons class="hidden lg:flex" :group="group" :saving="saving" @go-live="emit('goLive')" @pause="emit('pause')" />
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCell :label="t('groupDetail.stats.members')" :value="memberDisplay" :hint="memberHint" icon="group" />
        <StatCell :label="t('groupDetail.stats.profiles')" :value="profileDisplay" icon="person" value-class="text-tertiary" />
        <StatCell :label="t('groupDetail.stats.messagesToday')" :value="String(group.message_count_today)" icon="chat" value-class="text-primary" />
        <StatCell :label="t('groupDetail.stats.repliesToday')" :value="String(group.reply_count_today)" icon="smart_toy" value-class="text-secondary" />
        <StatCell :label="t('groupDetail.stats.status')" :value="statusLabel(group.status, t)" icon="toggle_on" :value-class="statusValueClass" :numeric="false" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';
import { draftBadgeClass, draftLabel, statusBadgeClass, statusLabel } from '../lib/ui';
import StatCell from './GroupStatCell.vue';
import ActionButtons from './GroupDetailActionButtons.vue';

const props = defineProps<{
  group: GroupWithStats;
  saving: boolean;
}>();

const emit = defineEmits<{
  goLive: [];
  pause: [];
}>();

const { t } = useI18n();
const detailsExpanded = ref(false);

const memberDisplay = computed(() => {
  if (props.group.member_count != null) return String(props.group.member_count);
  return '—';
});

const memberHint = computed(() => {
  if (props.group.member_count != null) return undefined;
  if (props.group.is_draft) return t('groupDetail.overview.membersDraft');
  return t('groupDetail.overview.membersUnavailable');
});

const profileDisplay = computed(() => String(props.group.profile_count ?? 0));

const statusValueClass = computed(() => {
  if (props.group.status === 'active') return 'text-primary';
  if (props.group.status === 'paused') return 'text-error';
  return 'text-secondary';
});

const collapsedSummary = computed(() => {
  const parts = [t('groupDetail.overview.summaryProfiles', { count: props.group.profile_count ?? 0 })];
  if (props.group.member_count != null) {
    parts.push(t('groupDetail.overview.summaryMembers', { count: props.group.member_count }));
  }
  parts.push(statusLabel(props.group.status, t));
  return parts.join(' · ');
});
</script>
