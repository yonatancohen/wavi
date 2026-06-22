<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header hidden lg:flex lg:min-h-14 lg:items-center lg:justify-between lg:gap-4">
      <div class="min-w-0">
        <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">
          {{ t('groups.title') }}
        </h1>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">
          {{ t('groups.subtitle') }}
        </p>
      </div>
      <button class="btn btn-primary flex shrink-0 items-center justify-center gap-2" :disabled="discovering" @click="openDiscover">
        <span class="material-symbols-outlined text-[16px]">group_add</span>
        {{ discovering ? t('groups.loading') : t('groups.addFromWhatsapp') }}
      </button>
    </header>

    <div class="page-content py-7">
      <button class="btn btn-primary mb-4 flex w-full items-center justify-center gap-2 lg:hidden" :disabled="discovering" @click="openDiscover">
        <span class="material-symbols-outlined text-[16px]">group_add</span>
        {{ discovering ? t('groups.loading') : t('groups.addFromWhatsapp') }}
      </button>

      <div v-if="error" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
        {{ error }}
      </div>

      <LoadingSkeletons v-if="loading" variant="group-cards" :count="4" />

      <div v-else-if="groups.length === 0" class="mx-auto mt-16 max-w-[520px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-2xl text-primary">group_off</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-[18px] font-semibold text-on-surface">
          {{ t('groups.empty.title') }}
        </h2>
        <p class="mb-6 text-[13px] leading-relaxed text-on-surface-variant">
          {{ t('groups.empty.body') }}
        </p>
        <button class="btn btn-primary" @click="openDiscover">{{ t('groups.empty.cta') }}</button>
      </div>

      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        <RouterLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="group relative block overflow-hidden rounded-xl border border-on-surface/[0.07] bg-surface-container p-5 no-underline transition-all hover:border-primary/30 hover:shadow-card-hover"
        >
          <!-- Status accent -->
          <div class="absolute start-0 top-0 h-full w-[3px]" :class="group.status === 'active' ? 'bg-primary' : group.status === 'paused' ? 'bg-error/70' : 'bg-secondary/70'" />
          <div class="ps-1">
            <div class="mb-3 flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[16px] shrink-0 text-primary">forum</span>
                <div class="min-w-0 font-sora text-[15px] font-semibold text-on-surface truncate">
                  {{ group.name }}
                </div>
              </div>
              <span class="badge shrink-0 px-2 py-0.5" :class="statusBadgeClass(group.status)">
                {{ statusLabel(group.status, t) }}
              </span>
            </div>

            <div class="mb-3 break-all font-mono text-[10px] text-on-surface-variant/60">
              {{ group.wa_group_id }}
            </div>

            <div class="flex gap-4 font-mono text-[11px] text-on-surface-variant">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[12px]">chat</span>
                {{ group.message_count_today }}
              </span>
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[12px]">smart_toy</span>
                {{ group.reply_count_today }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- Discover modal -->
    <div v-if="showDiscover" class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" @click.self="closeDiscover">
      <div class="flex max-h-[85vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl border border-outline-variant bg-surface-container shadow-2xl sm:max-h-[80vh] sm:rounded-xl">
        <div class="flex justify-between gap-4 border-b border-outline-variant px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 class="font-sora text-[17px] font-semibold text-on-surface">
              {{ t('groups.discover.title') }}
            </h2>
            <p class="mt-0.5 text-[12px] text-on-surface-variant">
              {{ t('groups.discover.subtitle') }}
            </p>
          </div>
          <button class="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface" @click="closeDiscover">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <LoadingSkeletons v-if="discovering" variant="discover-list" :count="4" />

        <div v-else-if="discoverError" class="overflow-y-auto px-6 pb-6 pt-4">
          <div class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
            {{ discoverError }}
          </div>
          <p class="my-4 text-[13px] leading-relaxed text-on-surface-variant">
            {{ t('groups.discover.connectHint') }}
          </p>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closeDiscover">{{ t('groups.discover.goToConnect') }}</RouterLink>
        </div>

        <div v-else-if="discovered.length === 0" class="px-6 py-12 text-center text-[13px] text-on-surface-variant">
          {{ t('groups.discover.empty') }}
        </div>

        <div v-else class="flex flex-col gap-2 overflow-y-auto px-6 pb-6 pt-4">
          <div
            v-for="item in discovered"
            :key="item.wa_group_id"
            class="flex flex-col gap-3 rounded-xl border border-on-surface/[0.06] bg-surface-container-high/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div>
              <div class="mb-0.5 text-[13px] font-semibold text-on-surface">{{ item.name }}</div>
              <div class="flex gap-3 font-mono text-[11px] text-on-surface-variant">
                <span v-if="item.participant_count">{{ t('groups.discover.members', { count: item.participant_count }) }}</span>
                <span v-if="item.registered" class="text-primary">{{ t('groups.discover.registered') }}</span>
              </div>
            </div>
            <div class="shrink-0">
              <RouterLink v-if="item.registered && item.group_id" :to="`/groups/${item.group_id}`" class="btn btn-secondary" @click="closeDiscover">
                {{ t('groups.discover.open') }}
              </RouterLink>
              <button v-else class="btn btn-primary" :disabled="registering === item.wa_group_id" @click="register(item)">
                {{ registering === item.wa_group_id ? t('groups.discover.adding') : t('groups.discover.register') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGroupsStore } from '../stores/groups';
import { statusBadgeClass, statusLabel } from '../lib/ui';
import LoadingSkeletons from '../components/LoadingSkeletons.vue';
import type { DiscoveredWaGroup } from '@wavi/shared';

const { t } = useI18n();
const store = useGroupsStore();
const router = useRouter();
const { groups, discovered, loading, discovering, registering } = storeToRefs(store);

const showDiscover = ref(false);
const discoverError = ref<string | null>(null);
const error = ref<string | null>(null);

async function openDiscover() {
  showDiscover.value = true;
  discoverError.value = null;
  try {
    await store.discoverGroups();
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : t('groups.failedDiscover');
  }
}

function closeDiscover() {
  showDiscover.value = false;
}

async function register(item: DiscoveredWaGroup) {
  try {
    const group = await store.registerGroup({
      wa_group_id: item.wa_group_id,
      name: item.name,
    });
    closeDiscover();
    router.push(`/groups/${group.id}`);
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : t('groups.failedRegister');
  }
}

onMounted(async () => {
  try {
    await store.fetchGroups();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groups.failedLoad');
  }
});
</script>
