<template>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
    <StatCell :label="t('groupDetail.stats.members')" :value="memberDisplay" :hint="memberHint" icon="group" />
    <StatCell :label="t('groupDetail.stats.profiles')" :value="profileDisplay" icon="person" value-class="text-tertiary" />
    <StatCell :label="t('groupDetail.stats.messagesToday')" :value="String(group.message_count_today)" icon="chat" value-class="text-primary" />
    <StatCell :label="t('groupDetail.stats.repliesToday')" :value="String(group.reply_count_today)" icon="smart_toy" value-class="text-secondary" />
    <StatCell :label="t('groupDetail.stats.status')" :value="statusLabel(group.status, t)" icon="toggle_on" :value-class="statusValueClass" :numeric="false" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';
import { statusLabel } from '../lib/ui';
import StatCell from './GroupStatCell.vue';

const props = defineProps<{
  group: GroupWithStats;
}>();

const { t } = useI18n();

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
</script>
