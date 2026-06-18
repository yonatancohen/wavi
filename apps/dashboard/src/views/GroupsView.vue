<template>
  <div class="view">
    <div class="topbar">
      <div>
        <div class="page-title">Groups</div>
        <div class="page-sub">Register WhatsApp groups where Wavi should listen and reply</div>
      </div>
      <button class="btn btn-primary" :disabled="discovering" @click="openDiscover">
        {{ discovering ? 'Loading…' : '+ Add from WhatsApp' }}
      </button>
    </div>

    <div class="content">
      <div v-if="error" class="alert">{{ error }}</div>

      <div v-if="loading" class="empty">Loading groups…</div>

      <div v-else-if="groups.length === 0" class="empty-card">
        <div class="empty-title">No groups registered yet</div>
        <div class="empty-sub">
          Connect WhatsApp, then click “Add from WhatsApp” to pick a group you’re already in.
        </div>
        <button class="btn btn-primary" @click="openDiscover">Add from WhatsApp</button>
      </div>

      <div v-else class="grid">
        <RouterLink
          v-for="group in groups"
          :key="group.id"
          :to="`/groups/${group.id}`"
          class="card"
        >
          <div class="card-top">
            <div class="card-name">{{ group.name }}</div>
            <span class="badge" :class="`badge-${group.status}`">{{ statusLabel(group.status) }}</span>
          </div>
          <div class="card-meta">{{ group.wa_group_id }}</div>
          <div class="card-stats">
            <span>{{ group.message_count_today }} msgs today</span>
            <span>{{ group.reply_count_today }} replies today</span>
          </div>
        </RouterLink>
      </div>
    </div>

    <div v-if="showDiscover" class="modal-backdrop" @click.self="closeDiscover">
      <div class="modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">Add group from WhatsApp</div>
            <div class="modal-sub">These are groups your linked WhatsApp account is already in</div>
          </div>
          <button class="icon-btn" @click="closeDiscover">✕</button>
        </div>

        <div v-if="discovering" class="modal-body center">Loading WhatsApp groups…</div>

        <div v-else-if="discoverError" class="modal-body">
          <div class="alert">{{ discoverError }}</div>
          <div class="hint">
            Make sure WhatsApp is connected under Agent → WhatsApp, and that this account is in at least one group.
          </div>
          <RouterLink to="/connect" class="btn btn-secondary" @click="closeDiscover">Go to Connect</RouterLink>
        </div>

        <div v-else-if="discovered.length === 0" class="modal-body center">
          No group chats found on this WhatsApp account.
        </div>

        <div v-else class="modal-body list">
          <div v-for="item in discovered" :key="item.wa_group_id" class="discover-row">
            <div class="discover-info">
              <div class="discover-name">{{ item.name }}</div>
              <div class="discover-meta">
                <span v-if="item.participant_count">{{ item.participant_count }} members</span>
                <span v-if="item.registered" class="registered">Registered</span>
              </div>
            </div>
            <div class="discover-actions">
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
import type { DiscoveredWaGroup, GroupStatus } from '@wavi/shared'

const store = useGroupsStore()
const router = useRouter()
const { groups, discovered, loading, discovering, registering } = storeToRefs(store)

const showDiscover = ref(false)
const discoverError = ref<string | null>(null)
const error = ref<string | null>(null)

function statusLabel(status: GroupStatus) {
  if (status === 'active') return 'Live'
  if (status === 'paused') return 'Paused'
  return 'Setup'
}

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

<style scoped>
.view { display: flex; flex-direction: column; min-height: 100vh; }
.topbar {
  min-height: 60px; border-bottom: 1px solid var(--border);
  padding: 16px 28px; display: flex; align-items: center;
  justify-content: space-between; gap: 16px; background: var(--surface);
}
.page-title { font-size: 15px; font-weight: 600; }
.page-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
.content { flex: 1; padding: 28px; }
.empty, .empty-card { color: var(--muted); }
.empty-card {
  max-width: 520px; margin: 80px auto; text-align: center;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 40px;
}
.empty-title { font-size: 18px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.empty-sub { font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card {
  display: block; text-decoration: none; color: inherit;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 18px; transition: border-color 0.15s;
}
.card:hover { border-color: rgba(79,255,176,0.35); }
.card-top { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 8px; }
.card-name { font-size: 15px; font-weight: 600; }
.card-meta { font-size: 11px; color: var(--muted); word-break: break-all; margin-bottom: 12px; }
.card-stats { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
.badge {
  font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap;
}
.badge-active { background: rgba(37,211,102,.12); color: var(--wa); }
.badge-pending_setup { background: rgba(255,184,77,.12); color: var(--warn); }
.badge-paused { background: rgba(255,95,95,.12); color: var(--danger); }
.btn {
  border: none; border-radius: 10px; padding: 10px 16px;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #07140f; }
.btn-secondary {
  background: var(--surface2); color: var(--text);
  border: 1px solid var(--border); text-decoration: none; display: inline-flex; align-items: center;
}
.alert {
  background: rgba(255,95,95,.1); border: 1px solid rgba(255,95,95,.25);
  color: #ffb4b4; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px;
}
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50;
}
.modal {
  width: min(640px, 100%); max-height: 80vh; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  display: flex; flex-direction: column;
}
.modal-header {
  display: flex; justify-content: space-between; gap: 16px;
  padding: 20px 22px; border-bottom: 1px solid var(--border);
}
.modal-title { font-size: 16px; font-weight: 600; }
.modal-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.icon-btn {
  background: transparent; border: none; color: var(--muted);
  font-size: 18px; cursor: pointer; padding: 4px 8px;
}
.modal-body { padding: 16px 22px 22px; overflow-y: auto; }
.modal-body.center { text-align: center; color: var(--muted); padding: 40px 22px; }
.modal-body.list { display: flex; flex-direction: column; gap: 10px; }
.discover-row {
  display: flex; justify-content: space-between; gap: 16px; align-items: center;
  padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface2);
}
.discover-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.discover-meta { font-size: 12px; color: var(--muted); display: flex; gap: 10px; }
.registered { color: var(--wa); }
.hint { font-size: 13px; color: var(--muted); margin: 12px 0 16px; line-height: 1.5; }
</style>
