<template>
  <div class="flex min-h-screen bg-background">
    <nav class="flex w-[240px] shrink-0 flex-col border-r border-outline-variant bg-surface-container-low">
      <!-- Brand -->
      <div class="flex flex-col gap-3 border-b border-outline-variant px-5 py-5">
        <div class="flex items-center gap-3">
          <img
            src="/wavi-mascot.jpg"
            alt="Wavi mascot"
            class="h-9 w-9 rounded-lg object-contain ring-1 ring-white/10"
          />
          <div>
            <h2 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">Wavi</h2>
            <p class="text-[11px] text-on-surface-variant">Your Witty AI Agent</p>
          </div>
        </div>

        <!-- Connection status -->
        <div
          class="flex w-fit items-center gap-2 rounded-full border px-2.5 py-1"
          :class="agentConnected
            ? 'border-primary/20 bg-primary/[0.07]'
            : 'border-error/20 bg-error/[0.07]'"
        >
          <div
            class="h-1.5 w-1.5 rounded-full"
            :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
          />
          <span
            class="font-mono text-[10px] font-semibold uppercase tracking-widest"
            :class="agentConnected ? 'text-primary' : 'text-error'"
          >
            {{ agentConnected ? 'Connected' : 'Offline' }}
          </span>
        </div>
      </div>

      <!-- Nav -->
      <div class="flex-1 space-y-0.5 py-4">
        <span class="block px-5 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
          Overview
        </span>
        <RouterLink to="/" class="nav-item">
          <span class="material-symbols-outlined text-[18px]">dashboard</span>
          Dashboard
          <span v-if="agentConnected" class="status-dot" />
        </RouterLink>
        <RouterLink to="/groups" class="nav-item">
          <span class="material-symbols-outlined text-[18px]">group</span>
          Groups
        </RouterLink>
        <RouterLink to="/activity" class="nav-item">
          <span class="material-symbols-outlined text-[18px]">history</span>
          Activity
        </RouterLink>

        <span class="block px-5 pb-2 pt-4 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
          Agent
        </span>
        <RouterLink to="/connect" class="nav-item">
          <span class="material-symbols-outlined text-[18px]">link</span>
          WhatsApp
        </RouterLink>
      </div>

      <!-- Footer -->
      <div class="border-t border-outline-variant px-5 py-3">
        <p class="font-mono text-[10px] text-on-surface-variant/40 select-none">wavi · v0.1</p>
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
