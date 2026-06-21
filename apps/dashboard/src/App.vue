<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <!-- Desktop sidebar -->
    <nav
      class="hidden h-full w-[240px] shrink-0 flex-col overflow-y-auto border-e border-outline-variant bg-surface-container-low lg:flex"
      :aria-label="t('nav.main')"
    >
      <AppBrand :connected="agentConnected" />
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
          <RouterLink
            v-if="showMobileBack"
            to="/groups"
            class="icon-btn min-h-10 min-w-10 shrink-0"
            :aria-label="t('groupDetail.back')"
          >
            <span class="material-symbols-outlined text-[20px] [dir=rtl]:scale-x-[-1]">arrow_back</span>
          </RouterLink>
          <img
            v-else
            src="/wavi-mascot.jpg"
            alt=""
            class="h-8 w-8 shrink-0 rounded-lg object-contain ring-1 ring-outline-variant/30"
          />
          <div class="min-w-0">
            <p class="truncate font-sora text-[14px] font-bold tracking-tight text-on-surface">{{ mobilePageTitle }}</p>
            <p v-if="mobilePageSubtitle" class="truncate text-[10px] text-on-surface-variant">{{ mobilePageSubtitle }}</p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <ActiveFlowsIndicator
            v-if="activeFlowTotal > 0"
            :total="activeFlowTotal"
            :flows="activeFlows"
            compact
          />

          <div
            class="flex items-center gap-1.5 rounded-full border px-2 py-1"
            :class="agentConnected
              ? 'border-primary/20 bg-primary/[0.07]'
              : 'border-error/20 bg-error/[0.07]'"
            :title="agentConnected ? t('status.connected') : t('status.offline')"
          >
            <div
              class="h-1.5 w-1.5 rounded-full"
              :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
            />
            <span
              class="font-mono text-[9px] font-semibold uppercase tracking-widest"
              :class="agentConnected ? 'text-primary' : 'text-error'"
            >
              {{ agentConnected ? t('status.connected') : t('status.offline') }}
            </span>
          </div>

          <button
            type="button"
            class="icon-btn"
            :aria-expanded="settingsOpen"
            :aria-label="t('nav.settings')"
            @click="settingsOpen = true"
          >
            <span class="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>
      </header>

      <main class="main-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <RouterView />
      </main>

      <!-- Mobile bottom navigation -->
      <nav class="mobile-bottom-nav lg:hidden" :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in mobileNavItems"
          :key="item.to"
          :to="item.to"
          active-class=""
          class="mobile-bottom-nav-item"
          :class="{ 'router-link-active': isNavActive(item.to) }"
          :aria-label="t(item.label)"
          :aria-current="isNavActive(item.to) ? 'page' : undefined"
        >
          <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
          <span class="mobile-bottom-nav-label">{{ t(item.label) }}</span>
          <span v-if="item.showDot && agentConnected" class="mobile-bottom-nav-dot" />
        </RouterLink>
      </nav>
    </div>

    <!-- Mobile settings sheet -->
    <Teleport to="body">
      <div
        v-if="settingsOpen"
        class="mobile-sheet-backdrop"
        @click="settingsOpen = false"
      />
      <div
        v-if="settingsOpen"
        class="mobile-sheet"
        role="dialog"
        :aria-label="t('nav.settings')"
      >
        <div class="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('nav.settings') }}</h2>
          <button
            type="button"
            class="icon-btn"
            :aria-label="t('nav.close')"
            @click="settingsOpen = false"
          >
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { apiFetch } from './lib/api'
import { useTheme } from './composables/useTheme'
import { useLocale } from './composables/useLocale'
import { useGroupsStore } from './stores/groups'
import { useFlowsStore } from './stores/flows'
import AppBrand from './components/AppBrand.vue'
import AppNavLinks from './components/AppNavLinks.vue'
import AppNavFooter from './components/AppNavFooter.vue'
import ActiveFlowsIndicator from './components/ActiveFlowsIndicator.vue'

const { t } = useI18n()
const route = useRoute()
const groupsStore = useGroupsStore()
const flowsStore = useFlowsStore()
const { groups } = storeToRefs(groupsStore)
const { total: activeFlowTotal, flows: activeFlows } = storeToRefs(flowsStore)
const { mode, cycleMode } = useTheme()
const { locale, toggleLocale } = useLocale()

const agentConnected = ref(false)
const settingsOpen = ref(false)

const mobileNavItems = [
  { to: '/', icon: 'dashboard', label: 'nav.dashboard', showDot: true },
  { to: '/groups', icon: 'group', label: 'nav.groups', showDot: false },
  { to: '/activity', icon: 'history', label: 'nav.activity', showDot: false },
  { to: '/connect', icon: 'link', label: 'nav.whatsapp', showDot: false },
] as const

function isNavActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

const showMobileBack = computed(() =>
  route.path.startsWith('/groups/') && route.path !== '/groups',
)

const mobilePageTitle = computed(() => {
  const path = route.path
  if (path === '/') return t('dashboard.title')
  if (path === '/groups') return t('groups.title')
  if (path === '/activity') return t('activity.title')
  if (path === '/connect') return t('connect.title')
  if (showMobileBack.value) {
    const id = route.params.id as string
    const group = groups.value.find((g) => g.id === id)
    return group?.name ?? t('groupDetail.group')
  }
  return 'Wavi'
})

const mobilePageSubtitle = computed(() => {
  const path = route.path
  if (path === '/') return t('brand.tagline')
  if (path === '/groups') return t('groups.subtitle')
  if (path === '/activity') return t('activity.subtitle')
  if (path === '/connect') return t('connect.subtitle')
  return null
})

watch(() => route.path, () => {
  settingsOpen.value = false
})

watch(settingsOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(async () => {
  flowsStore.startPolling()
  try {
    const s = await apiFetch<{ connected: boolean }>('/agent/status')
    agentConnected.value = s.connected
  } catch {}
})

onUnmounted(() => {
  flowsStore.stopPolling()
})
</script>
