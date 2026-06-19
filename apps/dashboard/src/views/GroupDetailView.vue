<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-10 border-b border-outline-variant bg-surface px-margin-mobile py-4">
      <RouterLink
        to="/groups"
        class="mb-2 inline-flex items-center gap-1 text-xs text-on-surface-variant no-underline transition-colors hover:text-primary"
      >
        <span class="material-symbols-outlined text-[16px]">arrow_back</span>
        Groups
      </RouterLink>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="font-sora text-headline-md text-on-surface">{{ group?.name ?? 'Group' }}</h1>
          <p class="mt-0.5 break-all text-[11px] text-on-surface-variant">{{ group?.wa_group_id }}</p>
        </div>
        <span
          v-if="group"
          class="badge shrink-0 px-2.5 py-1"
          :class="statusBadgeClass(group.status)"
        >
          {{ statusLabel(group.status) }}
        </span>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[800px] flex-1 px-margin-mobile py-8">
      <div v-if="loading" class="flex items-center gap-3 text-on-surface-variant">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
        Loading…
      </div>

      <div
        v-else-if="error"
        class="rounded-xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error"
      >
        {{ error }}
      </div>

      <template v-else-if="group">
        <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div class="rounded-xl border border-outline-variant bg-surface-container p-4">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Messages today</p>
            <p class="mt-1 font-sora text-headline-md text-primary">{{ group.message_count_today }}</p>
          </div>
          <div class="rounded-xl border border-outline-variant bg-surface-container p-4">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Replies today</p>
            <p class="mt-1 font-sora text-headline-md text-secondary">{{ group.reply_count_today }}</p>
          </div>
          <div class="col-span-2 rounded-xl border border-outline-variant bg-surface-container p-4 md:col-span-1">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Status</p>
            <p class="mt-1 font-sora text-headline-md text-on-surface">{{ statusLabel(group.status) }}</p>
          </div>
        </div>

        <section class="mb-4 rounded-xl border border-outline-variant bg-surface-container p-6">
          <div class="mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-primary">tune</span>
            <h2 class="font-sora text-headline-md">Setup</h2>
          </div>
          <p class="mb-5 text-body-md leading-relaxed text-on-surface-variant">
            After registering, set the group to
            <strong class="text-on-surface">Live</strong> so Wavi replies when someone tags
            <code class="rounded-md bg-surface-variant px-2 py-0.5 text-primary">@Wavi</code>
            in the chat.
          </p>

          <div class="flex flex-wrap gap-3">
            <button
              v-if="group.status !== 'active'"
              class="btn btn-primary flex items-center gap-2"
              :disabled="saving"
              @click="goLive"
            >
              <span class="material-symbols-outlined text-[20px]">play_arrow</span>
              {{ saving ? 'Saving…' : 'Go Live' }}
            </button>
            <button
              v-if="group.status === 'active'"
              class="btn btn-secondary flex items-center gap-2"
              :disabled="saving"
              @click="pause"
            >
              <span class="material-symbols-outlined text-[20px]">pause</span>
              Pause
            </button>
            <button
              v-if="group.status === 'paused'"
              class="btn btn-secondary flex items-center gap-2"
              :disabled="saving"
              @click="goLive"
            >
              <span class="material-symbols-outlined text-[20px]">play_arrow</span>
              Resume
            </button>
          </div>
        </section>

        <section class="rounded-xl border border-outline-variant bg-surface-container p-6">
          <div class="mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-tertiary">checklist</span>
            <h2 class="font-sora text-headline-md">Next steps</h2>
          </div>
          <ul class="space-y-3 text-body-md leading-relaxed text-on-surface-variant">
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[18px] text-primary">check_circle</span>
              <span class="text-on-surface">Register group in Wavi</span>
            </li>
            <li class="flex items-start gap-3">
              <span
                class="material-symbols-outlined mt-0.5 text-[18px]"
                :class="group.status === 'active' ? 'text-primary' : 'text-on-surface-variant'"
              >{{ group.status === 'active' ? 'check_circle' : 'radio_button_unchecked' }}</span>
              <span :class="group.status === 'active' ? 'text-on-surface' : ''">Go live</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[18px] text-on-surface-variant">schedule</span>
              Upload chat history (coming soon)
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[18px] text-on-surface-variant">schedule</span>
              Review generated character (coming soon)
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useGroupsStore } from '../stores/groups'
import { statusBadgeClass, statusLabel } from '../lib/ui'
import type { GroupWithStats } from '@wavi/shared'

const route = useRoute()
const store = useGroupsStore()

const group = ref<GroupWithStats | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    group.value = await store.fetchGroup(route.params.id as string)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load group'
  } finally {
    loading.value = false
  }
}

async function goLive() {
  if (!group.value) return
  saving.value = true
  try {
    group.value = await store.setStatus(group.value.id, 'active')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update status'
  } finally {
    saving.value = false
  }
}

async function pause() {
  if (!group.value) return
  saving.value = true
  try {
    group.value = await store.setStatus(group.value.id, 'paused')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update status'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
