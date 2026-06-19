<template>
  <div class="flex min-h-screen flex-col">
    <div class="flex min-h-[60px] items-center justify-between gap-4 border-b border-border bg-surface px-7 py-4">
      <div>
        <div class="text-[15px] font-semibold">Groups</div>
        <div class="mt-0.5 text-xs text-muted">Register WhatsApp groups where Wavi should listen and reply</div>
      </div>
      <button class="btn btn-primary" :disabled="discovering" @click="openDiscover">
        {{ discovering ? 'Loading…' : '+ Add from WhatsApp' }}
      </button>
    </div>

    <div class="flex-1 p-7">
      <div
        v-if="error"
        class="mb-4 rounded-[10px] border border-danger/25 bg-danger/10 px-3.5 py-3 text-[#ffb4b4]"
      >
        {{ error }}
      </div>

      <div v-if="loading" class="text-muted">Loading groups…</div>

      <div
        v-else-if="groups.length === 0"
        class="mx-auto mt-20 max-w-[520px] rounded-2xl border border-border bg-surface p-10 text-center text-muted"
      >
        <div class="mb-2 text-lg font-semibold text-ink">No groups registered yet</div>
        <div class="mb-5 text-sm leading-normal">
          Connect WhatsApp, then click “Add from WhatsApp” to pick a group you’re already in.
        </div>
        <button class="btn btn-primary" @click="openDiscover">Add from WhatsApp</button>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        <RouterLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="block rounded-[14px] border border-border bg-surface p-[18px] text-inherit no-underline transition-colors duration-150 hover:border-accent/35"
        >
          <div class="mb-2 flex items-start justify-between gap-3">
            <div class="text-[15px] font-semibold">{{ group.name }}</div>
            <span class="badge px-2 py-0.5" :class="statusBadgeClass(group.status)">
              {{ statusLabel(group.status) }}
            </span>
          </div>
          <div class="mb-3 break-all text-[11px] text-muted">{{ group.wa_group_id }}</div>
          <div class="flex gap-3 text-xs text-muted">
            <span>{{ group.message_count_today }} msgs today</span>
            <span>{{ group.reply_count_today }} replies today</span>
          </div>
        </RouterLink>
      </div>
    </div>

    <div
      v-if="showDiscover"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      @click.self="closeDiscover"
    >
      <div class="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div class="flex justify-between gap-4 border-b border-border px-[22px] py-5">
          <div>
            <div class="text-base font-semibold">Add group from WhatsApp</div>
            <div class="mt-1 text-xs text-muted">These are groups your linked WhatsApp account is already in</div>
          </div>
          <button class="cursor-pointer border-none bg-transparent px-2 py-1 text-lg text-muted" @click="closeDiscover">
            ✕
          </button>
        </div>

        <div v-if="discovering" class="px-[22px] py-10 text-center text-muted">Loading WhatsApp groups…</div>

        <div v-else-if="discoverError" class="overflow-y-auto px-[22px] pb-[22px] pt-4">
          <div class="rounded-[10px] border border-danger/25 bg-danger/10 px-3.5 py-3 text-[#ffb4b4]">
            {{ discoverError }}
          </div>
          <div class="my-3 text-[13px] leading-normal text-muted">
            Make sure WhatsApp is connected under Agent → WhatsApp, and that this account is in at least one group.
          </div>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closeDiscover">Go to Connect</RouterLink>
        </div>

        <div v-else-if="discovered.length === 0" class="px-[22px] py-10 text-center text-muted">
          No group chats found on this WhatsApp account.
        </div>

        <div v-else class="flex flex-col gap-2.5 overflow-y-auto px-[22px] pb-[22px] pt-4">
          <div
            v-for="item in discovered"
            :key="item.wa_group_id"
            class="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface2 p-3.5"
          >
            <div>
              <div class="mb-1 text-sm font-semibold">{{ item.name }}</div>
              <div class="flex gap-2.5 text-xs text-muted">
                <span v-if="item.participant_count">{{ item.participant_count }} members</span>
                <span v-if="item.registered" class="text-wa">Registered</span>
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
