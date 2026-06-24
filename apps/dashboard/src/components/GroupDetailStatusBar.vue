<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <span v-if="group.is_draft" class="badge shrink-0 px-2.5 py-1" :class="draftBadgeClass()">
        {{ draftLabel(t) }}
      </span>
      <span class="badge shrink-0 px-2.5 py-1" :class="statusBadgeClass(group.status)">
        {{ statusLabel(group.status, t) }}
      </span>
    </div>
    <ActionButtons :group="group" :saving="saving" @go-live="emit('goLive')" @pause="emit('pause')" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';
import { draftBadgeClass, draftLabel, statusBadgeClass, statusLabel } from '../lib/ui';
import ActionButtons from './GroupDetailActionButtons.vue';

defineProps<{
  group: GroupWithStats;
  saving: boolean;
}>();

const emit = defineEmits<{
  goLive: [];
  pause: [];
}>();

const { t } = useI18n();
</script>
