<template>
  <div class="flex min-h-screen flex-col">
    <div class="flex min-h-[60px] items-center justify-between gap-4 border-b border-border bg-surface px-7 py-4">
      <div>
        <RouterLink to="/groups" class="mb-1 inline-block text-xs text-muted no-underline hover:text-ink">
          ← Groups
        </RouterLink>
        <div class="text-[15px] font-semibold">{{ group?.name ?? 'Group' }}</div>
        <div class="mt-0.5 break-all text-[11px] text-muted">{{ group?.wa_group_id }}</div>
      </div>
      <span
        v-if="group"
        class="badge px-2.5 py-1"
        :class="statusBadgeClass(group.status)"
      >
        {{ statusLabel(group.status) }}
      </span>
    </div>

    <div class="flex-1 max-w-[720px] p-7">
      <div v-if="loading" class="text-muted">Loading…</div>
      <div
        v-else-if="error"
        class="rounded-[10px] border border-danger/25 bg-danger/10 px-3.5 py-3 text-[#ffb4b4]"
      >
        {{ error }}
      </div>

      <template v-else-if="group">
        <section class="mb-4 rounded-[14px] border border-border bg-surface p-5">
          <div class="mb-2.5 text-sm font-semibold">Setup</div>
          <p class="mb-4 text-sm leading-relaxed text-muted">
            After registering, set the group to <strong class="text-ink">Live</strong> so Wavi replies when someone tags
            <code class="rounded-md bg-surface2 px-1.5 py-0.5 text-accent">@Wavi</code>
            in the chat.
          </p>

          <div class="flex flex-wrap gap-2.5">
            <button
              v-if="group.status !== 'active'"
              class="btn btn-primary"
              :disabled="saving"
              @click="goLive"
            >
              Go Live
            </button>
            <button
              v-if="group.status === 'active'"
              class="btn btn-secondary"
              :disabled="saving"
              @click="pause"
            >
              Pause
            </button>
            <button
              v-if="group.status === 'paused'"
              class="btn btn-secondary"
              :disabled="saving"
              @click="goLive"
            >
              Resume
            </button>
          </div>
        </section>

        <section class="rounded-[14px] border border-border bg-surface p-5">
          <div class="mb-2.5 text-sm font-semibold">Next steps</div>
          <ul class="list-disc pl-[18px] text-sm leading-[1.8] text-muted">
            <li class="text-ink">Register group in Wavi</li>
            <li :class="group.status === 'active' ? 'text-ink' : ''">Go live</li>
            <li>Upload chat history (coming soon in dashboard)</li>
            <li>Review generated character (coming soon)</li>
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
