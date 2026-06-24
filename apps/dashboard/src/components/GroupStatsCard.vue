<template>
  <section v-if="variant === 'card'" class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-primary">groups</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('groupDetail.overview.title') }}</h2>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <StatCell :label="t('groupDetail.stats.members')" :value="memberDisplay" :hint="memberHint" icon="group" />
      <StatCell :label="t('groupDetail.stats.profiles')" :value="String(group.profile_count)" icon="person" value-class="text-tertiary" />
    </div>
  </section>

  <div v-else class="grid grid-cols-2 gap-2">
    <StatCell :label="t('groupDetail.stats.members')" :value="memberDisplay" :hint="memberHint" icon="group" compact />
    <StatCell :label="t('groupDetail.stats.profiles')" :value="String(group.profile_count)" icon="person" value-class="text-tertiary" compact />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';
import StatCell from './GroupStatCell.vue';

const props = withDefaults(
  defineProps<{
    group: GroupWithStats;
    variant?: 'card' | 'inline';
  }>(),
  { variant: 'card' },
);

const { t } = useI18n();

const memberDisplay = computed(() => {
  if (props.group.member_count != null) return String(props.group.member_count);
  if (props.group.is_draft) return '—';
  return '—';
});

const memberHint = computed(() => {
  if (props.group.member_count != null) return undefined;
  if (props.group.is_draft) return t('groupDetail.overview.membersDraft');
  return t('groupDetail.overview.membersUnavailable');
});
</script>
