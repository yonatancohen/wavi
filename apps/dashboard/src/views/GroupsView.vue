<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header flex min-h-14 items-center justify-between gap-4">
      <div>
        <h1 class="font-sora text-[15px] font-bold tracking-tight text-on-surface">Groups</h1>
        <p class="mt-0.5 text-[12px] text-on-surface-variant">
          Register WhatsApp groups where Wavi should listen and reply
        </p>
      </div>
      <button class="btn btn-primary flex items-center gap-2" :disabled="discovering" @click="openDiscover">
        <span class="material-symbols-outlined text-[16px]">group_add</span>
        {{ discovering ? 'Loading…' : 'Add from WhatsApp' }}
      </button>
    </header>

    <div class="mx-auto w-full max-w-[1200px] flex-1 px-margin-mobile py-7">
      <div
        v-if="error"
        class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error"
      >
        {{ error }}
      </div>

      <LoadingSkeletons v-if="loading" variant="group-cards" :count="4" />

      <div
        v-else-if="groups.length === 0"
        class="mx-auto mt-16 max-w-[520px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center"
      >
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-2xl text-primary">group_off</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-[18px] font-semibold text-on-surface">No groups registered yet</h2>
        <p class="mb-6 text-[13px] leading-relaxed text-on-surface-variant">
          Connect WhatsApp, then add a group you're already in so Wavi knows where to show up.
        </p>
        <button class="btn btn-primary" @click="openDiscover">Add from WhatsApp</button>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        <RouterLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="group relative block overflow-hidden rounded-xl border border-white/[0.07] bg-surface-container p-5 no-underline transition-all hover:border-primary/30 hover:shadow-card-hover"
        >
          <!-- Status accent -->
          <div
            class="absolute left-0 top-0 h-full w-[3px]"
            :class="group.status === 'active'
              ? 'bg-primary'
              : group.status === 'paused'
                ? 'bg-error/70'
                : 'bg-secondary/70'"
          />
          <div class="pl-1">
            <div class="mb-3 flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[16px] shrink-0 text-primary">forum</span>
                <div class="min-w-0 font-sora text-[15px] font-semibold text-on-surface truncate">{{ group.name }}</div>
              </div>
              <span class="badge shrink-0 px-2 py-0.5" :class="statusBadgeClass(group.status)">
                {{ statusLabel(group.status) }}
              </span>
            </div>

            <div class="mb-3 break-all font-mono text-[10px] text-on-surface-variant/60">{{ group.wa_group_id }}</div>

            <div class="flex gap-4 font-mono text-[11px] text-on-surface-variant">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[12px]">chat</span>
                {{ group.message_count_today }}
              </span>
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[12px]">smart_toy</span>
                {{ group.reply_count_today }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>
    </div>

    <!-- Discover modal -->
    <div
      v-if="showDiscover"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      @click.self="closeDiscover"
    >
      <div class="flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-2xl">
        <div class="flex justify-between gap-4 border-b border-outline-variant px-6 py-5">
          <div>
            <h2 class="font-sora text-[17px] font-semibold text-on-surface">Add group from WhatsApp</h2>
            <p class="mt-0.5 text-[12px] text-on-surface-variant">
              Groups your linked WhatsApp account is already in
            </p>
          </div>
          <button
            class="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            @click="closeDiscover"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <LoadingSkeletons v-if="discovering" variant="discover-list" :count="4" />

        <div v-else-if="discoverError" class="overflow-y-auto px-6 pb-6 pt-4">
          <div class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
            {{ discoverError }}
          </div>
          <p class="my-4 text-[13px] leading-relaxed text-on-surface-variant">
            Make sure WhatsApp is connected under Agent → WhatsApp, and that this account is in at least one group.
          </p>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closeDiscover">Go to Connect</RouterLink>
        </div>

        <div v-else-if="discovered.length === 0" class="px-6 py-12 text-center text-[13px] text-on-surface-variant">
          No group chats found on this WhatsApp account.
        </div>

        <div v-else class="flex flex-col gap-2 overflow-y-auto px-6 pb-6 pt-4">
          <div
            v-for="item in discovered"
            :key="item.wa_group_id"
            class="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-surface-container-high/60 p-4"
          >
            <div>
              <div class="mb-0.5 text-[13px] font-semibold text-on-surface">{{ item.name }}</div>
              <div class="flex gap-3 font-mono text-[11px] text-on-surface-variant">
                <span v-if="item.participant_count">{{ item.participant_count }} members</span>
                <span v-if="item.registered" class="text-primary">Registered</span>
              </div>
            </div>
            <div>
              <RouterLink
                v-if="item.registered && item.group_id"
                :to="`/groups/${item.group_id}`"
                class="btn btn-secondary"
                @click="closeDiscover"
              >
                Open
              </RouterLink>
              <button
                v-else
                class="btn btn-primary"
                :disabled="registering === item.wa_group_id"
                @click="register(item)"
              >
                {{ registering === item.wa_group_id ? 'Adding…' : 'Register' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGroupsStore } from '../stores/groups'
import { statusBadgeClass, statusLabel } from '../lib/ui'
import LoadingSkeletons from '../components/LoadingSkeletons.vue'
import type { DiscoveredWaGroup } from '@wavi/shared'

const store = useGroupsStore()
const router = useRouter()
const { groups, discovered, loading, discovering, registering } = storeToRefs(store)

const showDiscover = ref(false)
const discoverError = ref<string | null>(null)
const error = ref<string | null>(null)

async function openDiscover() {
  showDiscover.value = true
  discoverError.value = null
  try {
    await store.discoverGroups()
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : 'Failed to load groups'
  }
}

function closeDiscover() {
  showDiscover.value = false
}

async function register(item: DiscoveredWaGroup) {
  try {
    const group = await store.registerGroup({
      wa_group_id: item.wa_group_id,
      name: item.name,
    })
    closeDiscover()
    router.push(`/groups/${group.id}`)
  } catch (e) {
    discoverError.value = e instanceof Error ? e.message : 'Failed to register group'
  }
}

onMounted(async () => {
  try {
    await store.fetchGroups()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load groups'
  }
})
</script>
