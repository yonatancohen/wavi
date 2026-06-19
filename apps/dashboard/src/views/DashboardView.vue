<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header flex h-14 items-center justify-between">
      <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">Dashboard</h1>
      <div
        class="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
        :class="agentConnected
          ? 'border-primary/20 bg-primary/[0.07] text-primary'
          : 'border-error/20 bg-error/[0.07] text-error'"
      >
        <div
          class="h-1.5 w-1.5 rounded-full"
          :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
        />
        <span class="font-mono">{{ agentConnected ? 'Online' : 'Offline' }}</span>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[1200px] flex-1 px-margin-mobile py-7 pb-24">

      <!-- Hero: greeting + KPI row -->
      <section class="mb-8 animate-slide-up">
        <div class="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 class="font-sora text-[22px] font-bold tracking-tight text-on-surface">
              Welcome back, <span class="text-primary">Human</span>.
            </h2>
            <p class="mt-1 text-[13px] text-on-surface-variant">
              {{ heroSubtitle }}
            </p>
          </div>
          <RouterLink
            to="/groups"
            class="flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:brightness-110 active:scale-95"
          >
            <span class="material-symbols-outlined text-[18px]">group_add</span>
            Manage Groups
          </RouterLink>
        </div>

        <!-- KPI cells -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="stat-cell">
            <span class="stat-cell-label">Agent</span>
            <div class="mt-1 flex items-center gap-2">
              <div
                class="h-2 w-2 rounded-full"
                :class="agentConnected ? 'animate-status-pulse bg-primary' : 'bg-error'"
              />
              <span
                class="font-mono text-sm font-semibold"
                :class="agentConnected ? 'text-primary' : 'text-error'"
              >{{ agentConnected ? 'Online' : 'Offline' }}</span>
            </div>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">Active groups</span>
            <span class="stat-cell-value text-primary">{{ activeGroups.length }}</span>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">Messages today</span>
            <span class="stat-cell-value">{{ totalMessagesToday }}</span>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">Replies today</span>
            <span class="stat-cell-value text-secondary">{{ totalRepliesToday }}</span>
          </div>
        </div>
      </section>

      <!-- Bento grid -->
      <div class="bento-grid">

        <!-- Active Groups -->
        <div class="flex flex-col gap-5 rounded-xl border border-outline-variant bg-surface-container p-5 md:col-span-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-primary">group</span>
              <h3 class="font-sora text-[15px] font-semibold text-on-surface">Active Groups</h3>
            </div>
            <span class="rounded-full bg-primary/[0.08] px-2.5 py-0.5 font-mono text-[11px] text-primary">
              {{ activeGroups.length }} live
            </span>
          </div>

          <div v-if="loading">
            <LoadingSkeletons variant="dashboard-groups" :count="4" />
          </div>

          <div
            v-else-if="activeGroups.length === 0"
            class="rounded-xl border border-outline-variant bg-surface-container-high/60 p-8 text-center"
          >
            <p class="mb-4 text-[13px] text-on-surface-variant">No groups registered yet.</p>
            <RouterLink to="/groups" class="btn btn-primary">Add from WhatsApp</RouterLink>
          </div>

          <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <RouterLink
              v-for="group in activeGroups.slice(0, 4)"
              :key="group.id"
              :to="`/groups/${group.id}`"
              class="group relative cursor-pointer overflow-hidden rounded-xl border border-white/[0.07] bg-surface-container-high/60 p-4 transition-all hover:border-primary/30 hover:bg-surface-container-highest/80 no-underline"
            >
              <!-- Status accent bar -->
              <div
                class="absolute left-0 top-0 h-full w-[3px]"
                :class="group.status === 'active'
                  ? 'bg-primary'
                  : group.status === 'paused'
                    ? 'bg-error/70'
                    : 'bg-secondary/70'"
              />
              <div class="pl-1">
                <div class="mb-3 flex items-center justify-between">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    :class="statusBadgeClass(group.status)"
                  >
                    {{ statusLabel(group.status) }}
                  </span>
                  <span class="font-mono text-[10px] text-on-surface-variant">
                    {{ group.message_count_today }} msg
                  </span>
                </div>
                <h4 class="mb-0.5 font-sora text-[15px] font-semibold text-on-surface">{{ group.name }}</h4>
                <p class="text-[12px] text-on-surface-variant">
                  {{ group.reply_count_today }} {{ group.reply_count_today === 1 ? 'reply' : 'replies' }} today
                </p>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="flex flex-col rounded-xl border border-outline-variant bg-surface-container p-5 md:col-span-4">
          <div class="mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-secondary">bolt</span>
            <h3 class="font-sora text-[15px] font-semibold text-on-surface">Quick Actions</h3>
          </div>
          <div class="flex flex-1 flex-col space-y-2">
            <RouterLink
              to="/connect"
              class="group flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-container-high/40 p-3.5 text-left no-underline transition-all hover:border-primary/30 hover:bg-surface-container-highest/60"
            >
              <span class="material-symbols-outlined text-[18px] text-primary transition-transform group-hover:scale-110">link</span>
              <div>
                <p class="text-[13px] font-semibold text-on-surface">Connect WhatsApp</p>
                <p class="text-[11px] text-on-surface-variant">Link your agent session</p>
              </div>
            </RouterLink>
            <RouterLink
              to="/groups"
              class="group flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-container-high/40 p-3.5 text-left no-underline transition-all hover:border-secondary/30 hover:bg-surface-container-highest/60"
            >
              <span class="material-symbols-outlined text-[18px] text-secondary transition-transform group-hover:scale-110">group_add</span>
              <div>
                <p class="text-[13px] font-semibold text-on-surface">Register Groups</p>
                <p class="text-[11px] text-on-surface-variant">Pick chats from WhatsApp</p>
              </div>
            </RouterLink>
            <RouterLink
              to="/activity"
              class="group flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-container-high/40 p-3.5 text-left no-underline transition-all hover:border-tertiary/30 hover:bg-surface-container-highest/60"
            >
              <span class="material-symbols-outlined text-[18px] text-tertiary transition-transform group-hover:scale-110">history</span>
              <div>
                <p class="text-[13px] font-semibold text-on-surface">View Activity</p>
                <p class="text-[11px] text-on-surface-variant">See what Wavi has been up to</p>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="rounded-xl border border-outline-variant bg-surface-container p-5 md:col-span-12">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-primary">history</span>
              <h3 class="font-sora text-[15px] font-semibold text-on-surface">Recent Activity</h3>
            </div>
            <RouterLink
              to="/activity"
              class="flex items-center gap-1 text-[12px] text-on-surface-variant no-underline transition-colors hover:text-primary"
            >
              View all
              <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
            </RouterLink>
          </div>

          <div>
            <div
              v-for="item in activityItems"
              :key="item.title"
              class="log-row"
            >
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                :class="item.iconBg"
              >
                <span class="material-symbols-outlined text-[16px]" :class="item.iconColor">{{ item.icon }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-3">
                  <h5 class="text-[13px] font-semibold" :class="item.iconColor">{{ item.title }}</h5>
                  <span class="log-timestamp shrink-0">{{ item.time }}</span>
                </div>
                <p class="mt-0.5 text-[13px] leading-relaxed text-on-surface-variant">{{ item.body }}</p>
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

const totalMessagesToday = computed(() =>
  activeGroups.value.reduce((sum, g) => sum + (g.message_count_today ?? 0), 0),
)

const totalRepliesToday = computed(() =>
  activeGroups.value.reduce((sum, g) => sum + (g.reply_count_today ?? 0), 0),
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
      iconBg: 'bg-error/15',
      iconColor: 'text-error',
    })
  } else {
    items.push({
      title: 'WhatsApp',
      body: 'Agent session is connected and listening.',
      time: 'Now',
      icon: 'check_circle',
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
    })
  }

  for (const group of activeGroups.value.slice(0, 2)) {
    items.push({
      title: group.name,
      body: `${group.message_count_today} messages and ${group.reply_count_today} replies today.`,
      time: 'Today',
      icon: 'forum',
      iconBg: 'bg-secondary/15',
      iconColor: 'text-secondary',
    })
  }

  if (items.length < 3) {
    items.push({
      title: 'Wavi Intelligence',
      body: 'Activity feed will fill up once groups are active. For now, Wavi is sharpening its wit.',
      time: 'Soon',
      icon: 'smart_toy',
      iconBg: 'bg-primary/15',
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
