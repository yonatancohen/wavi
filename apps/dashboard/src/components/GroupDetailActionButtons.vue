<template>
  <div class="flex shrink-0 items-center gap-2">
    <button
      v-if="group.status !== 'active'"
      type="button"
      class="btn btn-primary flex items-center gap-1.5 px-3 py-2 text-[12px]"
      :disabled="saving || group.is_draft"
      :title="group.is_draft ? t('groupDetail.setup.linkBeforeLive') : undefined"
      @click="emit('goLive')"
    >
      <span class="material-symbols-outlined text-[16px]">play_arrow</span>
      {{ saving ? t('groupDetail.setup.saving') : t('groupDetail.setup.goLive') }}
    </button>
    <button v-if="group.status === 'active'" type="button" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="emit('pause')">
      <span class="material-symbols-outlined text-[16px]">pause</span>
      {{ t('groupDetail.setup.pause') }}
    </button>
    <button v-if="group.status === 'paused'" type="button" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="emit('goLive')">
      <span class="material-symbols-outlined text-[16px]">play_arrow</span>
      {{ t('groupDetail.setup.resume') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GroupWithStats } from '@wavi/shared';

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
