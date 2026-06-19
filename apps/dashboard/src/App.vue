<template>
  <div class="flex min-h-screen bg-background">
    <nav class="flex w-[260px] shrink-0 flex-col border-r border-outline-variant bg-surface-container">
      <div class="flex flex-col items-start border-b border-outline-variant p-6">
        <div class="mb-4 flex items-center gap-4">
          <img
            src="/wavi-mascot.jpg"
            alt="Wavi mascot"
            class="h-12 w-12 rounded-xl object-contain"
          />
          <div>
            <h2 class="font-sora text-headline-md text-primary">Wavi</h2>
            <p class="text-label-md text-on-surface-variant">Your Witty AI Agent</p>
          </div>
        </div>
        <div
          class="flex items-center gap-2 rounded-full border px-3 py-1"
          :class="agentConnected
            ? 'border-primary/20 bg-primary/10'
            : 'border-error/20 bg-error/10'"
        >
          <div
            class="h-2 w-2 rounded-full"
            :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
          />
          <span
            class="text-[10px] font-bold uppercase tracking-widest"
            :class="agentConnected ? 'text-primary' : 'text-error'"
          >
            {{ agentConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
      </div>

      <div class="flex-1 space-y-1 py-4">
        <span class="block px-5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-on-surface-variant">
          Overview
        </span>
        <RouterLink to="/" class="nav-item">
          <span class="material-symbols-outlined text-[20px]">dashboard</span>
          Dashboard
          <span v-if="agentConnected" class="status-dot" />
        </RouterLink>
        <RouterLink to="/groups" class="nav-item">
          <span class="material-symbols-outlined text-[20px]">group</span>
          Groups
        </RouterLink>
        <RouterLink to="/activity" class="nav-item">
          <span class="material-symbols-outlined text-[20px]">history</span>
          Activity
        </RouterLink>

        <span class="block px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[1.5px] text-on-surface-variant">
          Agent
        </span>
        <RouterLink to="/connect" class="nav-item">
          <span class="material-symbols-outlined text-[20px]">link</span>
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
