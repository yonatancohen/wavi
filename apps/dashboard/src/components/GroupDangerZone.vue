<template>
  <section class="rounded-xl border border-error/25 bg-error/[0.04] p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-error">warning</span>
      <div>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('groupDangerZone.title') }}</h2>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">{{ t('groupDangerZone.subtitle') }}</p>
      </div>
    </div>

    <div v-if="error" class="mb-3 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ error }}
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-error/15 bg-surface-container/80 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-on-surface">{{ t('groupSettings.deleteTitle') }}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">
          {{ t('groupSettings.deleteHint') }}
        </p>
      </div>
      <button type="button" class="btn btn-danger shrink-0 flex items-center gap-2 sm:ms-4" :disabled="deleting" @click="onDeleteClick">
        <span class="material-symbols-outlined text-[16px]">delete</span>
        {{ deleting ? t('groupSettings.deleting') : t('groupSettings.delete') }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import { useConfirm } from '../composables/useConfirm';
import type { GroupWithStats } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ group: GroupWithStats }>();

const router = useRouter();
const store = useGroupsStore();
const { confirm } = useConfirm();
const deleting = ref(false);
const error = ref<string | null>(null);

async function onDeleteClick() {
  const ok = await confirm({
    title: t('groupSettings.deleteConfirmTitle'),
    message: t('groupSettings.deleteConfirm', { name: props.group.name }),
    confirmLabel: t('groupSettings.delete'),
    variant: 'destructive',
  });
  if (!ok) return;

  deleting.value = true;
  error.value = null;
  try {
    await store.deleteGroup(props.group.id);
    await router.push('/groups');
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupSettings.failedDelete');
  } finally {
    deleting.value = false;
  }
}
</script>
