<template>
  <div class="flex min-h-screen">
    <nav class="flex w-[220px] shrink-0 flex-col gap-1 border-r border-border bg-surface py-6">
      <div class="flex items-center gap-2.5 px-5 pb-6">
        <span class="text-xl text-wa">●</span>
        <span class="text-lg font-bold tracking-tight">Wa<strong class="text-accent">vi</strong></span>
      </div>

      <div class="mb-2 px-3">
        <span class="block px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Overview</span>
        <RouterLink to="/" class="nav-item">
          <span class="w-5 text-center text-base">⬡</span>
          Dashboard
          <span v-if="agentConnected" class="status-dot" />
        </RouterLink>
        <RouterLink to="/groups" class="nav-item">
          <span class="w-5 text-center text-base">💬</span>
          Groups
        </RouterLink>
        <RouterLink to="/activity" class="nav-item">
          <span class="w-5 text-center text-base">↩</span>
          Activity
        </RouterLink>
      </div>

      <div class="px-3">
        <span class="block px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Agent</span>
        <RouterLink to="/connect" class="nav-item">
          <span class="w-5 text-center text-base">🔗</span>
          WhatsApp
        </RouterLink>
      </div>
    </nav>

    <main class="flex-1 overflow-x-hidden"><RouterView /></main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { apiFetch } from './lib/api'

const agentConnected = ref(false)

onMounted(async () => {
  try {
    const s = await apiFetch<{ connected: boolean }>('/agent/status')
    agentConnected.value = s.connected
  } catch {}
})
</script>
