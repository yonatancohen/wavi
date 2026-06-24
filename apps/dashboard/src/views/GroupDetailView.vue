<template>
  <div class="flex flex-col bg-background">
    <!-- Mobile tab bar (desktop header is hidden below lg) -->
    <nav v-if="group && !loading && !error" class="group-tabs-mobile" role="tablist" :aria-label="group.name">
      <div class="group-tabs">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.id"
          :to="tabRoute(tab.id)"
          replace
          role="tab"
          class="group-tab"
          :class="activeTab === tab.id ? 'group-tab-active' : 'group-tab-inactive'"
          :aria-selected="activeTab === tab.id ? 'true' : 'false'"
        >
          {{ tab.label }}
        </RouterLink>
      </div>
    </nav>

    <!-- Mobile status + go live (desktop actions live in page-header below) -->
    <div v-if="group && !loading && !error" class="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface/95 px-margin-mobile py-3 lg:hidden">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="group.is_draft" class="badge shrink-0 px-2.5 py-1" :class="draftBadgeClass()">
          {{ draftLabel(t) }}
        </span>
        <span class="badge shrink-0 px-2.5 py-1" :class="statusBadgeClass(group.status)">
          {{ statusLabel(group.status, t) }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="group.status !== 'active'"
          class="btn btn-primary flex items-center gap-1.5 px-3 py-2 text-[12px]"
          :disabled="saving || group.is_draft"
          :title="group.is_draft ? t('groupDetail.setup.linkBeforeLive') : undefined"
          @click="goLive"
        >
          <span class="material-symbols-outlined text-[16px]">play_arrow</span>
          {{ saving ? t('groupDetail.setup.saving') : t('groupDetail.setup.goLive') }}
        </button>
        <button v-if="group.status === 'active'" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="pause">
          <span class="material-symbols-outlined text-[16px]">pause</span>
          {{ t('groupDetail.setup.pause') }}
        </button>
        <button v-if="group.status === 'paused'" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="goLive">
          <span class="material-symbols-outlined text-[16px]">play_arrow</span>
          {{ t('groupDetail.setup.resume') }}
        </button>
      </div>
    </div>

    <div v-if="group && !loading && !error" class="group-stats border-b border-outline-variant px-margin-mobile py-3 lg:hidden">
      <span v-if="group.member_count != null" class="group-stat">
        <span class="text-on-surface-variant">{{ t('groupDetail.stats.members') }}</span>
        <span class="font-semibold text-on-surface">{{ group.member_count }}</span>
      </span>
      <span class="group-stat">
        <span class="text-on-surface-variant">{{ t('groupDetail.stats.profiles') }}</span>
        <span class="font-semibold text-tertiary">{{ group.profile_count }}</span>
      </span>
      <span class="group-stat">
        <span class="text-on-surface-variant">{{ t('groupDetail.stats.messagesToday') }}</span>
        <span class="font-semibold text-primary">{{ group.message_count_today }}</span>
      </span>
      <span class="group-stat">
        <span class="text-on-surface-variant">{{ t('groupDetail.stats.repliesToday') }}</span>
        <span class="font-semibold text-secondary">{{ group.reply_count_today }}</span>
      </span>
    </div>

    <header class="page-header page-header--group sticky top-0 z-10 hidden lg:block">
      <RouterLink to="/groups" class="mb-3 inline-flex items-center gap-1 text-[11px] text-on-surface-variant no-underline transition-colors hover:text-primary">
        <span class="material-symbols-outlined text-[14px] [dir=rtl]:scale-x-[-1]">arrow_back</span>
        {{ t('groupDetail.back') }}
      </RouterLink>

      <div v-if="group" class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h1 class="font-sora text-[18px] font-bold tracking-tight text-on-surface">
            {{ group.name }}
          </h1>
          <p class="mt-1 truncate font-mono text-[10px] text-on-surface-variant/50">
            {{ group.is_draft ? t('groups.draftHint') : group.wa_group_id }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="group.is_draft" class="badge shrink-0 px-2.5 py-1" :class="draftBadgeClass()">
            {{ draftLabel(t) }}
          </span>
          <span class="badge shrink-0 px-2.5 py-1" :class="statusBadgeClass(group.status)">
            {{ statusLabel(group.status, t) }}
          </span>
          <button
            v-if="group.status !== 'active'"
            class="btn btn-primary flex items-center gap-1.5 px-3 py-2 text-[12px]"
            :disabled="saving || group.is_draft"
            :title="group.is_draft ? t('groupDetail.setup.linkBeforeLive') : undefined"
            @click="goLive"
          >
            <span class="material-symbols-outlined text-[16px]">play_arrow</span>
            {{ saving ? t('groupDetail.setup.saving') : t('groupDetail.setup.goLive') }}
          </button>
          <button v-if="group.status === 'active'" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="pause">
            <span class="material-symbols-outlined text-[16px]">pause</span>
            {{ t('groupDetail.setup.pause') }}
          </button>
          <button v-if="group.status === 'paused'" class="btn btn-secondary flex items-center gap-1.5 px-3 py-2 text-[12px]" :disabled="saving" @click="goLive">
            <span class="material-symbols-outlined text-[16px]">play_arrow</span>
            {{ t('groupDetail.setup.resume') }}
          </button>
        </div>
      </div>
      <h1 v-else class="font-sora text-[18px] font-bold tracking-tight text-on-surface">
        {{ t('groupDetail.group') }}
      </h1>

      <div v-if="group && !loading" class="group-stats">
        <span v-if="group.member_count != null" class="group-stat">
          <span class="text-on-surface-variant">{{ t('groupDetail.stats.members') }}</span>
          <span class="font-semibold text-on-surface">{{ group.member_count }}</span>
        </span>
        <span class="group-stat">
          <span class="text-on-surface-variant">{{ t('groupDetail.stats.profiles') }}</span>
          <span class="font-semibold text-tertiary">{{ group.profile_count }}</span>
        </span>
        <span class="group-stat">
          <span class="text-on-surface-variant">{{ t('groupDetail.stats.messagesToday') }}</span>
          <span class="font-semibold text-primary">{{ group.message_count_today }}</span>
        </span>
        <span class="group-stat">
          <span class="text-on-surface-variant">{{ t('groupDetail.stats.repliesToday') }}</span>
          <span class="font-semibold text-secondary">{{ group.reply_count_today }}</span>
        </span>
        <span class="group-stat">
          <span class="text-on-surface-variant">{{ t('groupDetail.stats.status') }}</span>
          <span class="font-semibold" :class="group.status === 'active' ? 'text-primary' : group.status === 'paused' ? 'text-error' : 'text-secondary'">{{ statusLabel(group.status, t) }}</span>
        </span>
      </div>

      <div v-if="group && !loading && !error" class="group-tabs-bar">
        <nav class="group-tabs" role="tablist" :aria-label="group.name">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.id"
            :to="tabRoute(tab.id)"
            replace
            role="tab"
            class="group-tab"
            :class="activeTab === tab.id ? 'group-tab-active' : 'group-tab-inactive'"
            :aria-selected="activeTab === tab.id ? 'true' : 'false'"
          >
            {{ tab.label }}
          </RouterLink>
        </nav>
      </div>
    </header>

    <div class="page-content py-5 lg:py-6">
      <LoadingSkeletons v-if="loading" variant="group-detail" />

      <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
        {{ error }}
      </div>

      <template v-else-if="group">
        <div v-show="activeTab === 'setup'" class="bento-grid items-stretch">
          <div class="col-span-12">
            <GroupWhatsAppLink :group="group" @updated="onGroupUpdated" />
          </div>
          <div class="col-span-12">
            <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
              <p class="text-[13px] leading-relaxed text-on-surface-variant">
                {{
                  t('groupDetail.setup.body', {
                    live: t('groupDetail.setup.live'),
                    mention: t('groupDetail.setup.mention'),
                  })
                }}
              </p>
              <p v-if="group.is_draft" class="mt-3 text-[13px] text-tertiary">
                {{ t('groupDetail.setup.draftNotice') }}
              </p>
            </section>
          </div>
          <div class="col-span-12 h-full lg:col-span-4">
            <GroupSettingsSection :group="group" @updated="onGroupUpdated" @rebuild-complete="onRebuildComplete" />
          </div>
          <div class="col-span-12 h-full lg:col-span-8">
            <IngestUpload :group-id="group.id" @complete="onIngestionComplete" />
          </div>
        </div>

        <div v-show="activeTab === 'character'" class="space-y-4">
          <CharacterEditor :group="group" @updated="onCharacterUpdated" />
          <section v-if="!group.character_config" class="rounded-xl border border-dashed border-outline-variant bg-surface-variant/20 px-6 py-10 text-center">
            <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">psychology</span>
            <p class="text-[13px] text-on-surface-variant">
              {{ t('groupDetail.nextSteps.uploadHistory') }}
            </p>
          </section>
        </div>

        <div v-show="activeTab === 'people'" class="group-panel">
          <MembersSection ref="membersRef" :group-id="group.id" />
        </div>

        <div v-show="activeTab === 'dynamics'" class="group-panel">
          <DynamicsSection ref="dynamicsRef" :group-id="group.id" />
        </div>

        <div v-show="activeTab === 'messages'" class="group-panel">
          <MessagesSection ref="messagesRef" :group-id="group.id" />
        </div>

        <div v-show="activeTab === 'testChat'" class="group-panel">
          <TestChatPanel :group-id="group.id" embedded />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useGroupsStore } from '../stores/groups';
import { statusBadgeClass, statusLabel, draftBadgeClass, draftLabel } from '../lib/ui';
import GroupWhatsAppLink from '../components/GroupWhatsAppLink.vue';
import LoadingSkeletons from '../components/LoadingSkeletons.vue';
import IngestUpload from '../components/IngestUpload.vue';
import GroupSettingsSection from '../components/GroupSettingsSection.vue';
import MembersSection from '../components/MembersSection.vue';
import DynamicsSection from '../components/DynamicsSection.vue';
import MessagesSection from '../components/MessagesSection.vue';
import CharacterEditor from '../components/CharacterEditor.vue';
import TestChatPanel from '../components/TestChatPanel.vue';
import type { GroupWithStats } from '@wavi/shared';

type GroupTab = 'setup' | 'character' | 'people' | 'dynamics' | 'messages' | 'testChat';

const GROUP_TABS: GroupTab[] = ['setup', 'character', 'people', 'dynamics', 'messages', 'testChat'];

function tabFromHash(hash: string): GroupTab {
  const id = hash.replace(/^#/, '') as GroupTab;
  return GROUP_TABS.includes(id) ? id : 'setup';
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useGroupsStore();

const group = ref<GroupWithStats | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const hasIngestedData = ref(false);

/** Derived from URL hash — survives refresh and is shareable. */
const activeTab = computed(() => tabFromHash(route.hash));

function tabRoute(tab: GroupTab) {
  return { name: 'group' as const, params: { id: route.params.id as string }, hash: `#${tab}` };
}

const membersRef = ref<InstanceType<typeof MembersSection> | null>(null);
const dynamicsRef = ref<InstanceType<typeof DynamicsSection> | null>(null);
const messagesRef = ref<InstanceType<typeof MessagesSection> | null>(null);

const tabs = computed(() => {
  if (!group.value) return [];
  return [
    { id: 'setup' as const, label: t('groupDetail.tabs.setup') },
    { id: 'character' as const, label: t('groupDetail.tabs.character') },
    { id: 'people' as const, label: t('groupDetail.tabs.people') },
    { id: 'dynamics' as const, label: t('groupDetail.tabs.dynamics') },
    { id: 'messages' as const, label: t('groupDetail.tabs.messages') },
    { id: 'testChat' as const, label: t('groupDetail.tabs.testChat') },
  ];
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    group.value = await store.fetchGroup(route.params.id as string);
    hasIngestedData.value = group.value.character_config !== null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupDetail.failedLoad');
  } finally {
    loading.value = false;
  }
}

async function onIngestionComplete() {
  if (!group.value) return;
  try {
    group.value = await store.fetchGroup(group.value.id);
    hasIngestedData.value = true;
    await router.replace(tabRoute('character'));
    await Promise.all([membersRef.value?.reload(), dynamicsRef.value?.reload()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupDetail.failedReload');
  }
}

function onCharacterUpdated(updated: GroupWithStats) {
  group.value = updated;
}

function onGroupUpdated(updated: GroupWithStats) {
  group.value = updated;
}

async function onRebuildComplete() {
  if (!group.value) return;
  try {
    group.value = await store.fetchGroup(group.value.id);
    hasIngestedData.value = group.value.character_config !== null;
    await router.replace(tabRoute('character'));
    await Promise.all([membersRef.value?.reload(), dynamicsRef.value?.reload()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupDetail.failedReload');
  }
}

async function goLive() {
  if (!group.value) return;
  saving.value = true;
  try {
    group.value = await store.setStatus(group.value.id, 'active');
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupDetail.failedStatus');
  } finally {
    saving.value = false;
  }
}

async function pause() {
  if (!group.value) return;
  saving.value = true;
  try {
    group.value = await store.setStatus(group.value.id, 'paused');
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('groupDetail.failedStatus');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>
