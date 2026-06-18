<template>
  <div class="view">
    <div class="topbar">
      <div>
        <RouterLink to="/groups" class="back">← Groups</RouterLink>
        <div class="page-title">{{ group?.name ?? 'Group' }}</div>
        <div class="page-sub">{{ group?.wa_group_id }}</div>
      </div>
      <span v-if="group" class="badge" :class="`badge-${group.status}`">{{ statusLabel(group.status) }}</span>
    </div>

    <div class="content">
      <div v-if="loading" class="empty">Loading…</div>
      <div v-else-if="error" class="alert">{{ error }}</div>

      <template v-else-if="group">
        <section class="panel">
          <div class="panel-title">Setup</div>
          <p class="panel-copy">
            After registering, set the group to <strong>Live</strong> so Wavi replies when someone tags
            <code>@Wavi</code> in the chat.
          </p>

          <div class="actions">
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

        <section class="panel">
          <div class="panel-title">Next steps</div>
          <ul class="steps">
            <li :class="{ done: true }">Register group in Wavi</li>
            <li :class="{ done: group.status === 'active' }">Go live</li>
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
import type { GroupStatus, GroupWithStats } from '@wavi/shared'

const route = useRoute()
const store = useGroupsStore()

const group = ref<GroupWithStats | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

function statusLabel(status: GroupStatus) {
  if (status === 'active') return 'Live'
  if (status === 'paused') return 'Paused'
  return 'Setup'
}

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

<style scoped>
.view { display: flex; flex-direction: column; min-height: 100vh; }
.topbar {
  min-height: 60px; border-bottom: 1px solid var(--border);
  padding: 16px 28px; display: flex; align-items: center;
  justify-content: space-between; gap: 16px; background: var(--surface);
}
.back { display: inline-block; font-size: 12px; color: var(--muted); text-decoration: none; margin-bottom: 4px; }
.page-title { font-size: 15px; font-weight: 600; }
.page-sub { font-size: 11px; color: var(--muted); margin-top: 2px; word-break: break-all; }
.content { flex: 1; padding: 28px; max-width: 720px; }
.empty { color: var(--muted); }
.alert {
  background: rgba(255,95,95,.1); border: 1px solid rgba(255,95,95,.25);
  color: #ffb4b4; padding: 12px 14px; border-radius: 10px;
}
.panel {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 20px; margin-bottom: 16px;
}
.panel-title { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.panel-copy { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 16px; }
.panel-copy code {
  background: var(--surface2); padding: 2px 6px; border-radius: 6px; color: var(--accent);
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn {
  border: none; border-radius: 10px; padding: 10px 16px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #07140f; }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.badge {
  font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap;
}
.badge-active { background: rgba(37,211,102,.12); color: var(--wa); }
.badge-pending_setup { background: rgba(255,184,77,.12); color: var(--warn); }
.badge-paused { background: rgba(255,95,95,.12); color: var(--danger); }
.steps { padding-left: 18px; color: var(--muted); line-height: 1.8; font-size: 14px; }
.steps .done { color: var(--text); }
</style>
