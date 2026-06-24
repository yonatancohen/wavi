<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-primary">link</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">
        {{ t('groupLink.title') }}
      </h2>
    </div>

    <p class="mb-4 text-[13px] leading-relaxed text-on-surface-variant">
      {{ group.is_draft ? t('groupLink.draftBody') : t('groupLink.linkedBody') }}
    </p>

    <div v-if="actionError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ actionError }}
    </div>

    <div v-if="!group.is_draft" class="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {{ t('groupLink.linkedChat') }}
      </div>
      <div class="mt-1 break-all font-mono text-[12px] text-on-surface">{{ group.wa_group_id }}</div>
    </div>

    <div v-if="group.is_draft" class="space-y-3">
      <button class="btn btn-primary flex w-full items-center justify-center gap-2 sm:w-auto" :disabled="discovering" @click="openLinkPicker">
        <span class="material-symbols-outlined text-[16px]">group_add</span>
        {{ discovering ? t('groupLink.loadingChats') : t('groupLink.connect') }}
      </button>
    </div>

    <button v-else-if="group.status === 'pending_setup'" class="btn btn-secondary flex items-center gap-2" :disabled="unlinking" @click="unlink">
      <span class="material-symbols-outlined text-[16px]">link_off</span>
      {{ unlinking ? t('groupLink.unlinking') : t('groupLink.unlink') }}
    </button>

    <p v-else class="text-[12px] text-on-surface-variant">
      {{ t('groupLink.unlinkBlocked') }}
    </p>

    <!-- Link picker modal -->
    <div v-if="showPicker" class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" @click.self="closePicker">
      <div class="flex max-h-[85vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl border border-outline-variant bg-surface-container shadow-2xl sm:max-h-[80vh] sm:rounded-xl">
        <div class="flex justify-between gap-4 border-b border-outline-variant px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h3 class="font-sora text-[17px] font-semibold text-on-surface">{{ t('groupLink.pickerTitle') }}</h3>
            <p class="mt-0.5 text-[12px] text-on-surface-variant">{{ t('groupLink.pickerSubtitle') }}</p>
          </div>
          <button class="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface" @click="closePicker">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <LoadingSkeletons v-if="discovering" variant="discover-list" :count="4" />

        <div v-else-if="pickerError" class="overflow-y-auto px-6 pb-6 pt-4">
          <div class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">{{ pickerError }}</div>
          <p class="my-4 text-[13px] leading-relaxed text-on-surface-variant">{{ t('groups.discover.connectHint') }}</p>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closePicker">{{ t('groups.discover.goToConnect') }}</RouterLink>
        </div>

        <div v-else-if="availableChats.length === 0" class="px-6 py-12 text-center text-[13px] text-on-surface-variant">
          {{ t('groupLink.pickerEmpty') }}
        </div>

        <div v-else class="flex flex-col gap-2 overflow-y-auto px-6 pb-6 pt-4">
          <div
            v-for="item in availableChats"
            :key="item.wa_group_id"
            class="flex flex-col gap-3 rounded-xl border border-on-surface/[0.06] bg-surface-container-high/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <div class="mb-0.5 text-[13px] font-semibold text-on-surface">{{ item.name }}</div>
              <div class="font-mono text-[11px] text-on-surface-variant">
                <span v-if="item.participant_count">{{ t('groups.discover.members', { count: item.participant_count }) }}</span>
              </div>
            </div>
            <button class="btn btn-primary shrink-0" :disabled="linking === item.wa_group_id" @click="link(item)">
              {{ linking === item.wa_group_id ? t('groupLink.linking') : t('groupLink.link') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGroupsStore } from '../stores/groups';
import LoadingSkeletons from './LoadingSkeletons.vue';
import type { DiscoveredWaGroup, GroupWithStats } from '@wavi/shared';

const { t } = useI18n();
const props = defineProps<{ group: GroupWithStats }>();
const emit = defineEmits<{ updated: [group: GroupWithStats] }>();

const store = useGroupsStore();
const { discovered, discovering } = storeToRefs(store);

const showPicker = ref(false);
const pickerError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const linking = ref<string | null>(null);
const unlinking = ref(false);

const availableChats = computed(() => discovered.value.filter((item) => !item.registered));

async function openLinkPicker() {
  showPicker.value = true;
  pickerError.value = null;
  try {
    await store.discoverGroups();
  } catch (e) {
    pickerError.value = e instanceof Error ? e.message : t('groups.failedDiscover');
  }
}

function closePicker() {
  showPicker.value = false;
}

async function link(item: DiscoveredWaGroup) {
  linking.value = item.wa_group_id;
  actionError.value = null;
  try {
    const updated = await store.linkGroup(props.group.id, {
      wa_group_id: item.wa_group_id,
      name: item.name,
    });
    emit('updated', updated);
    closePicker();
  } catch (e) {
    pickerError.value = e instanceof Error ? e.message : t('groupLink.failedLink');
  } finally {
    linking.value = null;
  }
}

async function unlink() {
  unlinking.value = true;
  actionError.value = null;
  try {
    const updated = await store.unlinkGroup(props.group.id);
    emit('updated', updated);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : t('groupLink.failedUnlink');
  } finally {
    unlinking.value = false;
  }
}
</script>
