<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="page-header">
      <RouterLink
        to="/groups"
        class="mb-2 inline-flex items-center gap-1 text-[11px] text-on-surface-variant no-underline transition-colors hover:text-primary"
      >
        <span class="material-symbols-outlined text-[14px]">arrow_back</span>
        Groups
      </RouterLink>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="font-sora text-[17px] font-bold tracking-tight text-on-surface">{{ group?.name ?? 'Group' }}</h1>
          <p class="mt-0.5 break-all font-mono text-[10px] text-on-surface-variant/60">{{ group?.wa_group_id }}</p>
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

    <div class="mx-auto w-full max-w-[800px] flex-1 px-margin-mobile py-7">
      <LoadingSkeletons v-if="loading" variant="group-detail" />

      <div
        v-else-if="error"
        class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error"
      >
        {{ error }}
      </div>

      <template v-else-if="group">
        <!-- Stats -->
        <div class="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div class="stat-cell">
            <span class="stat-cell-label">Messages today</span>
            <span class="stat-cell-value text-primary">{{ group.message_count_today }}</span>
          </div>
          <div class="stat-cell">
            <span class="stat-cell-label">Replies today</span>
            <span class="stat-cell-value text-secondary">{{ group.reply_count_today }}</span>
          </div>
          <div class="col-span-2 stat-cell md:col-span-1">
            <span class="stat-cell-label">Status</span>
            <span
              class="mt-1 font-mono text-[15px] font-semibold"
              :class="group.status === 'active' ? 'text-primary' : group.status === 'paused' ? 'text-error' : 'text-secondary'"
            >{{ statusLabel(group.status) }}</span>
          </div>
        </div>

        <!-- Setup section -->
        <section class="mb-4 rounded-xl border border-outline-variant bg-surface-container p-5">
          <div class="mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-primary">tune</span>
            <h2 class="font-sora text-[15px] font-semibold text-on-surface">Setup</h2>
          </div>
          <p class="mb-5 text-[13px] leading-relaxed text-on-surface-variant">
            After registering, set the group to
            <strong class="text-on-surface">Live</strong> so Wavi replies when someone tags
            <code class="rounded-md bg-surface-variant px-1.5 py-0.5 font-mono text-[12px] text-primary">@Wavi</code>
            in the chat.
          </p>

          <div class="flex flex-wrap gap-3">
            <button
              v-if="group.status !== 'active'"
              class="btn btn-primary flex items-center gap-2"
              :disabled="saving"
              @click="goLive"
            >
              <span class="material-symbols-outlined text-[18px]">play_arrow</span>
              {{ saving ? 'Saving…' : 'Go Live' }}
            </button>
            <button
              v-if="group.status === 'active'"
              class="btn btn-secondary flex items-center gap-2"
              :disabled="saving"
              @click="pause"
            >
              <span class="material-symbols-outlined text-[18px]">pause</span>
              Pause
            </button>
            <button
              v-if="group.status === 'paused'"
              class="btn btn-secondary flex items-center gap-2"
              :disabled="saving"
              @click="goLive"
            >
              <span class="material-symbols-outlined text-[18px]">play_arrow</span>
              Resume
            </button>
          </div>
        </section>

        <!-- Next steps -->
        <section class="rounded-xl border border-outline-variant bg-surface-container p-5">
          <div class="mb-4 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-tertiary">checklist</span>
            <h2 class="font-sora text-[15px] font-semibold text-on-surface">Next steps</h2>
          </div>
          <ul class="space-y-3">
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[16px] text-primary">check_circle</span>
              <span class="text-[13px] text-on-surface">Register group in Wavi</span>
            </li>
            <li class="flex items-start gap-3">
              <span
                class="material-symbols-outlined mt-0.5 text-[16px]"
                :class="group.status === 'active' ? 'text-primary' : 'text-on-surface-variant'"
              >{{ group.status === 'active' ? 'check_circle' : 'radio_button_unchecked' }}</span>
              <span class="text-[13px]" :class="group.status === 'active' ? 'text-on-surface' : 'text-on-surface-variant'">Go live</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[16px] text-on-surface-variant/40">schedule</span>
              <span class="text-[13px] text-on-surface-variant">Upload chat history <span class="font-mono text-[10px]">(coming soon)</span></span>
            </li>
            <li class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[16px] text-on-surface-variant/40">schedule</span>
              <span class="text-[13px] text-on-surface-variant">Review generated character <span class="font-mono text-[10px]">(coming soon)</span></span>
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
import LoadingSkeletons from '../components/LoadingSkeletons.vue'
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
