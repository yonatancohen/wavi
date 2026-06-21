<template>
  <div class="flex-1 space-y-0.5 py-4">
    <span class="block px-5 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
      {{ t('nav.overview') }}
    </span>
    <RouterLink
      v-for="item in overviewNavItems"
      :key="item.to"
      :to="item.to"
      active-class=""
      class="nav-item"
      :class="{ 'router-link-active': isNavActive(item.to) }"
      :aria-current="isNavActive(item.to) ? 'page' : undefined"
    >
      <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
      {{ t(item.label) }}
      <span v-if="item.showDot && connected" class="status-dot" />
    </RouterLink>

    <span class="block px-5 pb-2 pt-4 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
      {{ t('nav.agent') }}
    </span>
    <RouterLink
      to="/connect"
      active-class=""
      class="nav-item"
      :class="{ 'router-link-active': isNavActive('/connect') }"
      :aria-current="isNavActive('/connect') ? 'page' : undefined"
    >
      <span class="material-symbols-outlined text-[18px]">link</span>
      {{ t('nav.whatsapp') }}
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'

defineProps<{ connected: boolean }>()

const { t } = useI18n()
const route = useRoute()

const overviewNavItems = [
  { to: '/', icon: 'dashboard', label: 'nav.dashboard', showDot: true },
  { to: '/groups', icon: 'group', label: 'nav.groups', showDot: false },
  { to: '/activity', icon: 'history', label: 'nav.activity', showDot: false },
] as const

function isNavActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>
