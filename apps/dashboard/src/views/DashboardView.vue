<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile">
      <div class="flex items-center gap-4">
        <h1 class="font-sora text-headline-md font-extrabold tracking-tight text-primary">Wavi</h1>
      </div>
      <div class="flex items-center gap-2">
        <div
          class="flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
          :class="agentConnected
            ? 'border-primary/20 bg-primary/10 text-primary'
            : 'border-error/20 bg-error/10 text-error'"
        >
          <div
            class="h-2 w-2 rounded-full"
            :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
          />
          {{ agentConnected ? 'Online' : 'Offline' }}
        </div>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[1200px] flex-1 px-margin-mobile py-8 pb-24">
      <section class="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 class="font-sora text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Welcome back, <span class="text-primary">Human</span>.
          </h2>
          <p class="mt-2 text-body-lg text-on-surface-variant">
            {{ heroSubtitle }}
          </p>
        </div>
        <div class="flex gap-3">
          <RouterLink
            to="/groups"
            class="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-label-md text-on-primary shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-95"
          >
            <span class="material-symbols-outlined text-[20px]">group_add</span>
            Manage Groups
          </RouterLink>
        </div>
      </section>

      <div class="bento-grid">
        <div class="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container p-6 md:col-span-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">group</span>
              <h3 class="font-sora text-headline-md">Active Groups</h3>
            </div>
            <span class="rounded-full bg-primary/10 px-3 py-1 text-label-md text-primary">
              {{ activeGroups.length }} Active
            </span>
          </div>

          <div v-if="loading">
            <LoadingSkeletons variant="dashboard-groups" :count="4" />
          </div>

          <div
            v-else-if="activeGroups.length === 0"
            class="rounded-xl border border-outline-variant bg-surface-variant/40 p-8 text-center"
          >
            <p class="mb-4 text-on-surface-variant">No groups registered yet.</p>
            <RouterLink to="/groups" class="btn btn-primary">Add from WhatsApp</RouterLink>
          </div>

          <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RouterLink
              v-for="group in activeGroups.slice(0, 4)"
              :key="group.id"
              :to="`/groups/${group.id}`"
              class="glass-card group cursor-pointer rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div class="mb-4 flex items-center justify-between">
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="statusBadgeClass(group.status)"
                >
                  {{ statusLabel(group.status) }}
                </span>
                <span class="text-[10px] text-on-surface-variant">{{ group.message_count_today }} msgs today</span>
              </div>
              <h4 class="mb-1 font-sora text-[18px]">{{ group.name }}</h4>
              <p class="line-clamp-1 text-sm text-on-surface-variant">
                {{ group.reply_count_today }} Wavi {{ group.reply_count_today === 1 ? 'reply' : 'replies' }} today
              </p>
            </RouterLink>
          </div>
        </div>

        <div class="flex flex-col rounded-xl border border-outline-variant bg-surface-container p-6 md:col-span-4">
          <div class="mb-6 flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary">bolt</span>
            <h3 class="font-sora text-headline-md">Quick Actions</h3>
          </div>
          <div class="flex flex-1 flex-col space-y-3">
            <RouterLink
              to="/connect"
              class="group flex w-full items-center gap-3 rounded-xl border border-outline-variant p-4 text-left transition-all hover:border-primary hover:bg-primary/5"
            >
              <span class="material-symbols-outlined text-primary transition-transform group-hover:scale-110">link</span>
              <div>
                <p class="text-sm font-semibold">Connect WhatsApp</p>
                <p class="text-[12px] text-on-surface-variant">Link your agent session</p>
              </div>
            </RouterLink>
            <RouterLink
              to="/groups"
              class="group flex w-full items-center gap-3 rounded-xl border border-outline-variant p-4 text-left transition-all hover:border-secondary hover:bg-secondary/5"
            >
              <span class="material-symbols-outlined text-secondary transition-transform group-hover:scale-110">group_add</span>
              <div>
                <p class="text-sm font-semibold">Register Groups</p>
                <p class="text-[12px] text-on-surface-variant">Pick chats from WhatsApp</p>
              </div>
            </RouterLink>
            <RouterLink
              to="/activity"
              class="group flex w-full items-center gap-3 rounded-xl border border-outline-variant p-4 text-left transition-all hover:border-tertiary hover:bg-tertiary/5"
            >
              <span class="material-symbols-outlined text-tertiary transition-transform group-hover:scale-110">history</span>
              <div>
                <p class="text-sm font-semibold">View Activity</p>
                <p class="text-[12px] text-on-surface-variant">See what Wavi has been up to</p>
              </div>
            </RouterLink>
          </div>
        </div>

        <div class="rounded-xl border border-outline-variant bg-surface-container p-6 md:col-span-12">
          <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">history</span>
              <h3 class="font-sora text-headline-md">Recent Activity</h3>
            </div>
            <RouterLink
              to="/activity"
              class="flex items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-primary"
            >
              View all
              <span class="material-symbols-outlined text-sm">arrow_forward</span>
            </RouterLink>
          </div>

          <div class="space-y-1">
            <div
              v-for="item in activityItems"
              :key="item.title"
              class="flex items-start gap-4 rounded-xl border-b border-outline-variant/30 p-4 transition-colors last:border-0 hover:bg-surface-variant/50"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                :class="item.iconBg"
              >
                <span class="material-symbols-outlined" :class="item.iconColor">{{ item.icon }}</span>
              </div>
              <div class="flex-1">
                <div class="mb-1 flex items-center justify-between">
                  <h5 class="text-label-md" :class="item.iconColor">{{ item.title }}</h5>
                  <span class="text-[11px] text-on-surface-variant">{{ item.time }}</span>
                </div>
                <p class="text-sm leading-relaxed text-on-surface">{{ item.body }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGroupsStore } from '../stores/groups'
import { apiFetch } from '../lib/api'
import { statusBadgeClass, statusLabel } from '../lib/ui'
import LoadingSkeletons from '../components/LoadingSkeletons.vue'

const store = useGroupsStore()
const { groups, loading } = storeToRefs(store)
const agentConnected = ref(false)

const activeGroups = computed(() =>
  groups.value.filter((g) => g.status === 'active'),
)

const heroSubtitle = computed(() => {
  if (!agentConnected.value) {
    return 'Connect WhatsApp to let Wavi start organizing your chaotic digital life.'
  }
  if (activeGroups.value.length === 0) {
    return 'WhatsApp is linked — register a group so Wavi has somewhere witty to work.'
  }
  return `Wavi is live in ${activeGroups.value.length} ${activeGroups.value.length === 1 ? 'group' : 'groups'} and ready to roast.`
})

const activityItems = computed(() => {
  const items = []

  if (!agentConnected.value) {
    items.push({
      title: 'WhatsApp',
      body: 'Agent is offline. Head to Connect to scan the QR code.',
      time: 'Now',
      icon: 'link_off',
      iconBg: 'bg-error/20',
      iconColor: 'text-error',
    })
  } else {
    items.push({
      title: 'WhatsApp',
      body: 'Agent session is connected and listening.',
      time: 'Now',
      icon: 'check_circle',
      iconBg: 'bg-primary/20',
      iconColor: 'text-primary',
    })
  }

  for (const group of activeGroups.value.slice(0, 2)) {
    items.push({
      title: group.name,
      body: `${group.message_count_today} messages and ${group.reply_count_today} replies today.`,
      time: 'Today',
      icon: 'forum',
      iconBg: 'bg-secondary/20',
      iconColor: 'text-secondary',
    })
  }

  if (items.length < 3) {
    items.push({
      title: 'Wavi Intelligence',
      body: 'Activity feed will fill up once groups are active. For now, Wavi is sharpening its wit.',
      time: 'Soon',
      icon: 'smart_toy',
      iconBg: 'bg-primary/20',
      iconColor: 'text-primary',
    })
  }

  return items.slice(0, 3)
})

onMounted(async () => {
  try {
    const status = await apiFetch<{ connected: boolean }>('/agent/status')
    agentConnected.value = status.connected
  } catch {}

  try {
    await store.fetchGroups()
  } catch {}
})
</script>
