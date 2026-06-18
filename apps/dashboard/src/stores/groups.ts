import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch } from '../lib/api'
import type { GroupWithStats, CharacterConfig } from '@wavi/shared'

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<GroupWithStats[]>([])
  const loading = ref(false)
  const selectedGroupId = ref<string | null>(null)

  const selectedGroup = computed(() =>
    groups.value.find((g) => g.id === selectedGroupId.value) ?? null,
  )

  async function fetchGroups() {
    loading.value = true
    try {
      groups.value = await apiFetch<GroupWithStats[]>('/groups')
    } finally {
      loading.value = false
    }
  }

  async function updateCharacter(groupId: string, config: CharacterConfig) {
    const updated = await apiFetch<GroupWithStats>(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ character_config: config }),
    })
    const idx = groups.value.findIndex((g) => g.id === groupId)
    if (idx !== -1) groups.value[idx] = updated
  }

  async function setStatus(groupId: string, status: 'active' | 'paused') {
    const updated = await apiFetch<GroupWithStats>(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    const idx = groups.value.findIndex((g) => g.id === groupId)
    if (idx !== -1) groups.value[idx] = updated
  }

  return { groups, loading, selectedGroupId, selectedGroup, fetchGroups, updateCharacter, setStatus }
})
