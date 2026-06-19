<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-4 border-b border-outline-variant bg-surface px-margin-mobile py-4">
      <div>
        <h1 class="font-sora text-headline-md text-on-surface">Groups</h1>
        <p class="mt-0.5 text-body-md text-on-surface-variant">
          Register WhatsApp groups where Wavi should listen and reply
        </p>
      </div>
      <button class="btn btn-primary flex items-center gap-2" :disabled="discovering" @click="openDiscover">
        <span class="material-symbols-outlined text-[20px]">group_add</span>
        {{ discovering ? 'Loading…' : 'Add from WhatsApp' }}
      </button>
    </header>

    <div class="mx-auto w-full max-w-[1200px] flex-1 px-margin-mobile py-8">
      <div
        v-if="error"
        class="mb-4 rounded-xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error"
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
          <div class="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-3xl text-primary">group_off</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-headline-md text-on-surface">No groups registered yet</h2>
        <p class="mb-6 text-body-md leading-relaxed text-on-surface-variant">
          Connect WhatsApp, then add a group you're already in so Wavi knows where to show up.
        </p>
        <button class="btn btn-primary" @click="openDiscover">Add from WhatsApp</button>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        <RouterLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="glass-card group block rounded-xl p-5 text-inherit no-underline transition-all hover:-translate-y-0.5 hover:border-primary/40"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">forum</span>
              <div class="font-sora text-[17px] font-semibold">{{ group.name }}</div>
            </div>
            <span class="badge px-2.5 py-0.5" :class="statusBadgeClass(group.status)">
              {{ statusLabel(group.status) }}
            </span>
          </div>
          <div class="mb-4 break-all text-[11px] text-on-surface-variant">{{ group.wa_group_id }}</div>
          <div class="flex gap-4 text-xs text-on-surface-variant">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">chat</span>
              {{ group.message_count_today }} msgs today
            </span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">smart_toy</span>
              {{ group.reply_count_today }} replies today
            </span>
          </div>
        </RouterLink>
      </div>
    </div>

    <div
      v-if="showDiscover"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      @click.self="closeDiscover"
    >
      <div class="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-2xl">
        <div class="flex justify-between gap-4 border-b border-outline-variant px-6 py-5">
          <div>
            <h2 class="font-sora text-headline-md text-on-surface">Add group from WhatsApp</h2>
            <p class="mt-1 text-body-md text-on-surface-variant">
              Groups your linked WhatsApp account is already in
            </p>
          </div>
          <button
            class="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            @click="closeDiscover"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <LoadingSkeletons v-if="discovering" variant="discover-list" :count="4" />

        <div v-else-if="discoverError" class="overflow-y-auto px-6 pb-6 pt-4">
          <div class="rounded-xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
            {{ discoverError }}
          </div>
          <p class="my-4 text-body-md leading-relaxed text-on-surface-variant">
            Make sure WhatsApp is connected under Agent → WhatsApp, and that this account is in at least one group.
          </p>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closeDiscover">Go to Connect</RouterLink>
        </div>

        <div v-else-if="discovered.length === 0" class="px-6 py-12 text-center text-on-surface-variant">
          No group chats found on this WhatsApp account.
        </div>

        <div v-else class="flex flex-col gap-3 overflow-y-auto px-6 pb-6 pt-4">
          <div
            v-for="item in discovered"
            :key="item.wa_group_id"
            class="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-variant/40 p-4"
          >
            <div>
              <div class="mb-1 text-sm font-semibold text-on-surface">{{ item.name }}</div>
              <div class="flex gap-3 text-xs text-on-surface-variant">
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
