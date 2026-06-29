<template>
  <!-- Hold the shell blank until auth is resolved (avoids flashing admin on OAuth callback). -->
  <div v-if="!authReady" class="min-h-screen bg-background" />

  <!-- Login page renders without app chrome -->
  <RouterView v-else-if="showLoginPage" />

  <div v-else-if="isAuthenticated" class="flex h-svh overflow-hidden bg-background lg:h-dvh">
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
            <span class="material-symbols-outlined text-[20px] rtl:scale-x-[-1]">arrow_back</span>
          </RouterLink>
          <RouterLink v-else to="/" class="icon-btn min-h-10 min-w-10 shrink-0 p-0" :aria-label="t('nav.dashboard')">
            <img src="/wavi-mascot.jpg" alt="" class="h-8 w-8 rounded-lg object-contain ring-1 ring-outline-variant/30" />
          </RouterLink>
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

          <template v-if="showSignOut">
            <p class="px-3 pb-1 pt-4 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
              {{ t('nav.account') }}
            </p>
            <button type="button" class="mobile-sheet-row text-error" @click="handleSignOut">
              <span class="material-symbols-outlined text-[18px]">logout</span>
              <span class="flex-1 text-start text-[13px] font-medium">{{ t('auth.signOut') }}</span>
            </button>
          </template>
        </div>

        <div class="border-t border-outline-variant px-5 py-3">
          <p class="font-mono text-[10px] text-on-surface-variant/40">wavi · v0.1</p>
        </div>
      </div>
    </Teleport>
  </div>

  <GroupSearchPalette :open="paletteOpen" @close="paletteOpen = false" />
  <ConfirmDialog />

  <!-- Debug error banner — visible on mobile, auto-clears after read -->
  <Teleport to="body">
    <div v-if="vueError" class="fixed inset-x-0 bottom-20 z-[9999] mx-3 rounded-xl border border-error/30 bg-error/10 p-3 text-[11px] text-error shadow-lg lg:bottom-4" style="word-break: break-all">
      <div class="mb-1 flex items-center justify-between gap-2">
        <strong>Vue error ({{ vueError.comp }})</strong>
        <button class="underline" @click="clearVueError">dismiss</button>
      </div>
      <div>{{ vueError.msg }}</div>
      <div class="mt-1 text-on-surface-variant/70">{{ vueError.info }}</div>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useTheme } from './composables/useTheme';
import { useLocale } from './composables/useLocale';
import { useGroupsStore } from './stores/groups';
import { useFlowsStore } from './stores/flows';
import { useAgentStore } from './stores/agent';
import { useAuthStore, isAuthRequired } from './stores/auth';
import AppBrand from './components/AppBrand.vue';
import AppNavLinks from './components/AppNavLinks.vue';
import AppNavFooter from './components/AppNavFooter.vue';
import ActiveFlowsIndicator from './components/ActiveFlowsIndicator.vue';
import AgentStatusBadge from './components/AgentStatusBadge.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import GroupSearchPalette from './components/GroupSearchPalette.vue';
import { agentNavItems, isNavActive, mobileQuickNavItems, overviewNavItems } from './lib/nav-items';
import { loginRedirectTarget } from './lib/login-redirect';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const groupsStore = useGroupsStore();
const flowsStore = useFlowsStore();
const agentStore = useAgentStore();
const authStore = useAuthStore();
const { groups } = storeToRefs(groupsStore);
const { total: activeFlowTotal, flows: activeFlows } = storeToRefs(flowsStore);
const { connected: agentConnected } = storeToRefs(agentStore);
const { userEmail, ready: authReady, isAuthenticated, accessToken } = storeToRefs(authStore);
const showSignOut = computed(() => isAuthRequired && !!userEmail.value);
const { mode, cycleMode } = useTheme();
const { locale, toggleLocale } = useLocale();

const settingsOpen = ref(false);
const navMenuOpen = ref(false);
const paletteOpen = ref(false);

interface VueErrorInfo {
  msg: string;
  comp: string;
  info: string;
  time: number;
}
const vueError = ref<VueErrorInfo | null>(null);

function loadVueError() {
  try {
    const raw = localStorage.getItem('wavi-vue-error');
    if (raw) vueError.value = JSON.parse(raw) as VueErrorInfo;
  } catch {
    /* ignore */
  }
}

function clearVueError() {
  vueError.value = null;
  localStorage.removeItem('wavi-vue-error');
}

onMounted(loadVueError);

const isLoginRoute = computed(() => route.path === '/login');
const showLoginPage = computed(() => isLoginRoute.value && !isAuthenticated.value);

watch(
  () => [authReady.value, isAuthenticated.value, route.path, route.query.redirect] as const,
  ([ready, authed, path, redirect]) => {
    if (!ready || !authed || path !== '/login') return;
    void router.replace(loginRedirectTarget(redirect));
  },
  { immediate: true },
);

async function handleSignOut() {
  settingsOpen.value = false;
  await authStore.signOut();
  await router.push('/login');
}

const showMobileBack = computed(() => route.path.startsWith('/groups/') && route.path !== '/groups');

const mobilePageTitle = computed(() => {
  const path = route.path;
  if (path === '/') return t('dashboard.title');
  if (path === '/groups') return t('groups.title');
  if (path === '/activity') return t('activity.title');
  if (path === '/live-log') return t('liveLog.title');
  if (path === '/reminders') return t('reminders.title');
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
  if (path === '/reminders') return t('reminders.subtitle');
  if (path === '/test-chat') return t('testChat.subtitle');
  if (path === '/how-it-works') return t('howItWorks.subtitle');
  if (path === '/connect') return t('connect.subtitle');
  return null;
});

watch(
  [isLoginRoute, authReady, isAuthenticated, accessToken],
  ([login, ready, authed, token]) => {
    if (!ready || login || !authed || !token) {
      flowsStore.stopPolling();
      agentStore.stopPolling();
      return;
    }
    flowsStore.startPolling();
    agentStore.startPolling();
  },
  { immediate: true },
);

watch(
  () => route.path,
  () => {
    settingsOpen.value = false;
    navMenuOpen.value = false;
    paletteOpen.value = false;
  },
);

watch([settingsOpen, navMenuOpen, paletteOpen], ([settings, menu, palette]) => {
  document.body.style.overflow = settings || menu || palette ? 'hidden' : '';
});

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;
  if (!isAuthenticated.value || isLoginRoute.value) return;

  const target = e.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) {
    return;
  }

  e.preventDefault();
  paletteOpen.value = !paletteOpen.value;
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  flowsStore.stopPolling();
  agentStore.stopPolling();
});
</script>
