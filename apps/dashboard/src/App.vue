<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <!-- Desktop sidebar -->
    <nav class="hidden h-full w-[240px] shrink-0 flex-col overflow-y-auto border-e border-outline-variant bg-surface-container-low lg:flex" :aria-label="t('nav.main')">
      <AppBrand />
      <div v-if="activeFlowTotal > 0" class="px-3 pb-3">
        <ActiveFlowsIndicator :total="activeFlowTotal" :flows="activeFlows" />
      </div>
      <AppNavLinks :connected="agentConnected" />
      <AppNavFooter />
    </nav>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Mobile top bar (single header on mobile — page headers are desktop-only) -->
      <header class="mobile-top-bar lg:hidden">
        <div class="flex min-w-0 items-center gap-2">
          <RouterLink v-if="showMobileBack" to="/groups" class="icon-btn min-h-10 min-w-10 shrink-0" :aria-label="t('groupDetail.back')">
            <span class="material-symbols-outlined text-[20px] [dir=rtl]:scale-x-[-1]">arrow_back</span>
          </RouterLink>
          <img v-else src="/wavi-mascot.jpg" alt="" class="h-8 w-8 shrink-0 rounded-lg object-contain ring-1 ring-outline-variant/30" />
          <div class="min-w-0">
            <p class="truncate font-sora text-[14px] font-bold tracking-tight text-on-surface">
              {{ mobilePageTitle }}
            </p>
            <p v-if="mobilePageSubtitle" class="truncate text-[10px] text-on-surface-variant">
              {{ mobilePageSubtitle }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <ActiveFlowsIndicator v-if="activeFlowTotal > 0" :total="activeFlowTotal" :flows="activeFlows" compact />

          <AgentStatusBadge compact />

          <button type="button" class="icon-btn" :aria-expanded="settingsOpen" :aria-label="t('nav.settings')" @click="settingsOpen = true">
            <span class="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>
      </header>

      <main class="main-content">
        <RouterView />
      </main>

      <!-- Mobile bottom navigation -->
      <nav class="mobile-bottom-nav lg:hidden" :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in mobileQuickNavItems"
          :key="item.to"
          :to="item.to"
          active-class=""
          class="mobile-bottom-nav-item"
          :class="{ 'router-link-active': isNavActive(route.path, item.to) }"
          :aria-label="t(item.label)"
          :aria-current="isNavActive(route.path, item.to) ? 'page' : undefined"
        >
          <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
          <span class="mobile-bottom-nav-label">{{ t(item.label) }}</span>
          <span v-if="item.showDot && agentConnected" class="mobile-bottom-nav-dot" />
        </RouterLink>

        <button type="button" class="mobile-bottom-nav-item" :class="{ 'router-link-active': navMenuOpen }" :aria-expanded="navMenuOpen" :aria-label="t('nav.menu')" @click="navMenuOpen = true">
          <span class="material-symbols-outlined text-[22px]">menu</span>
          <span class="mobile-bottom-nav-label">{{ t('nav.menu') }}</span>
        </button>
      </nav>
    </div>

    <!-- Mobile navigation menu -->
    <Teleport to="body">
      <div v-if="navMenuOpen" class="mobile-sheet-backdrop" @click="navMenuOpen = false" />
      <div v-if="navMenuOpen" class="mobile-sheet" role="dialog" :aria-label="t('nav.menu')">
        <div class="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">
            {{ t('nav.menu') }}
          </h2>
          <button type="button" class="icon-btn" :aria-label="t('nav.close')" @click="navMenuOpen = false">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="max-h-[min(70vh,32rem)] overflow-y-auto p-3">
          <p class="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
            {{ t('nav.overview') }}
          </p>
          <RouterLink
            v-for="item in overviewNavItems"
            :key="item.to"
            :to="item.to"
            class="mobile-sheet-nav-row"
            :class="{ 'mobile-sheet-nav-row-active': isNavActive(route.path, item.to) }"
            @click="navMenuOpen = false"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">{{ item.icon }}</span>
            <span class="flex-1 text-[13px] font-medium text-on-surface">{{ t(item.label) }}</span>
            <span v-if="item.showDot && agentConnected" class="status-dot" />
          </RouterLink>

          <p class="px-3 pb-1 pt-4 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
            {{ t('nav.agent') }}
          </p>
          <RouterLink
            v-for="item in agentNavItems"
            :key="item.to"
            :to="item.to"
            class="mobile-sheet-nav-row"
            :class="{ 'mobile-sheet-nav-row-active': isNavActive(route.path, item.to) }"
            @click="navMenuOpen = false"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">{{ item.icon }}</span>
            <span class="flex-1 text-[13px] font-medium text-on-surface">{{ t(item.label) }}</span>
          </RouterLink>
        </div>
      </div>
    </Teleport>

    <!-- Mobile settings sheet -->
    <Teleport to="body">
      <div v-if="settingsOpen" class="mobile-sheet-backdrop" @click="settingsOpen = false" />
      <div v-if="settingsOpen" class="mobile-sheet" role="dialog" :aria-label="t('nav.settings')">
        <div class="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">
            {{ t('nav.settings') }}
          </h2>
          <button type="button" class="icon-btn" :aria-label="t('nav.close')" @click="settingsOpen = false">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="space-y-1 p-3">
          <p class="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
            {{ t('nav.appearance') }}
          </p>
          <button type="button" class="mobile-sheet-row" @click="cycleMode">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">
              {{ mode === 'light' ? 'light_mode' : mode === 'dark' ? 'dark_mode' : 'brightness_auto' }}
            </span>
            <span class="flex-1 text-start text-[13px] font-medium text-on-surface">{{ t('theme.' + mode) }}</span>
            <span class="text-[11px] text-on-surface-variant">{{ t('nav.tapToChange') }}</span>
          </button>
          <button type="button" class="mobile-sheet-row" @click="toggleLocale">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">translate</span>
            <span class="flex-1 text-start text-[13px] font-medium text-on-surface">{{ t('nav.language') }}</span>
            <span class="font-mono text-[11px] text-on-surface-variant">{{ locale === 'he' ? 'EN' : 'עב' }}</span>
          </button>
        </div>

        <div class="border-t border-outline-variant px-5 py-3">
          <p class="font-mono text-[10px] text-on-surface-variant/40">wavi · v0.1</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useTheme } from './composables/useTheme';
import { useLocale } from './composables/useLocale';
import { useGroupsStore } from './stores/groups';
import { useFlowsStore } from './stores/flows';
import { useAgentStore } from './stores/agent';
import AppBrand from './components/AppBrand.vue';
import AppNavLinks from './components/AppNavLinks.vue';
import AppNavFooter from './components/AppNavFooter.vue';
import ActiveFlowsIndicator from './components/ActiveFlowsIndicator.vue';
import AgentStatusBadge from './components/AgentStatusBadge.vue';
import { agentNavItems, isNavActive, mobileQuickNavItems, overviewNavItems } from './lib/nav-items';

const { t } = useI18n();
const route = useRoute();
const groupsStore = useGroupsStore();
const flowsStore = useFlowsStore();
const agentStore = useAgentStore();
const { groups } = storeToRefs(groupsStore);
const { total: activeFlowTotal, flows: activeFlows } = storeToRefs(flowsStore);
const { connected: agentConnected } = storeToRefs(agentStore);
const { mode, cycleMode } = useTheme();
const { locale, toggleLocale } = useLocale();

const settingsOpen = ref(false);
const navMenuOpen = ref(false);

const showMobileBack = computed(() => route.path.startsWith('/groups/') && route.path !== '/groups');

const mobilePageTitle = computed(() => {
  const path = route.path;
  if (path === '/') return t('dashboard.title');
  if (path === '/groups') return t('groups.title');
  if (path === '/activity') return t('activity.title');
  if (path === '/live-log') return t('liveLog.title');
  if (path === '/test-chat') return t('testChat.title');
  if (path === '/how-it-works') return t('howItWorks.title');
  if (path === '/connect') return t('connect.title');
  if (showMobileBack.value) {
    const id = route.params.id as string;
    const group = groups.value.find((g) => g.id === id);
    return group?.name ?? t('groupDetail.group');
  }
  return 'Wavi';
});

const mobilePageSubtitle = computed(() => {
  const path = route.path;
  if (path === '/') return t('brand.tagline');
  if (path === '/groups') return t('groups.subtitle');
  if (path === '/activity') return t('activity.subtitle');
  if (path === '/live-log') return t('liveLog.subtitle');
  if (path === '/test-chat') return t('testChat.subtitle');
  if (path === '/how-it-works') return t('howItWorks.subtitle');
  if (path === '/connect') return t('connect.subtitle');
  return null;
});

watch(
  () => route.path,
  () => {
    settingsOpen.value = false;
    navMenuOpen.value = false;
  },
);

watch([settingsOpen, navMenuOpen], ([settings, menu]) => {
  document.body.style.overflow = settings || menu ? 'hidden' : '';
});

onMounted(() => {
  flowsStore.startPolling();
  agentStore.startPolling();
});

onUnmounted(() => {
  flowsStore.stopPolling();
  agentStore.stopPolling();
});
</script>
