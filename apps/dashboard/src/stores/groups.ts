import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch } from '../lib/api';
import type { GroupWithStats, CharacterConfig, DiscoveredWaGroup, CreateGroupRequest } from '@wavi/shared';

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<GroupWithStats[]>([]);
  const discovered = ref<DiscoveredWaGroup[]>([]);
  const loading = ref(false);
  const discovering = ref(false);
  const registering = ref<string | null>(null);
  const selectedGroupId = ref<string | null>(null);
  const error = ref<string | null>(null);

  const selectedGroup = computed(() => groups.value.find((g) => g.id === selectedGroupId.value) ?? null);

  async function fetchGroups() {
    loading.value = true;
    error.value = null;
    try {
      groups.value = await apiFetch<GroupWithStats[]>('/groups');
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load groups';
    } finally {
      loading.value = false;
    }
  }

  async function fetchGroup(id: string) {
    const group = await apiFetch<GroupWithStats>(`/groups/${id}`);
    const idx = groups.value.findIndex((g) => g.id === id);
    if (idx !== -1) groups.value[idx] = group;
    else groups.value.unshift(group);
    return group;
  }

  async function discoverGroups() {
    discovering.value = true;
    error.value = null;
    try {
      discovered.value = await apiFetch<DiscoveredWaGroup[]>('/groups/discover');
      return discovered.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to discover groups';
      discovered.value = [];
      throw e;
    } finally {
      discovering.value = false;
    }
  }

  async function registerGroup(payload: CreateGroupRequest) {
    registering.value = payload.wa_group_id;
    error.value = null;
    try {
      const group = await apiFetch<GroupWithStats>('/groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      groups.value.unshift(group);
      const idx = discovered.value.findIndex((g) => g.wa_group_id === payload.wa_group_id);
      if (idx !== -1) {
        discovered.value[idx] = {
          ...discovered.value[idx],
          registered: true,
          group_id: group.id,
          status: group.status,
        };
      }
      return group;
    } finally {
      registering.value = null;
    }
  }

  async function updateCharacter(groupId: string, config: CharacterConfig) {
    const updated = await apiFetch<GroupWithStats>(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ character_config: config }),
    });
    const idx = groups.value.findIndex((g) => g.id === groupId);
    if (idx !== -1) groups.value[idx] = updated;
    return updated;
  }

  async function setStatus(groupId: string, status: 'active' | 'paused' | 'pending_setup') {
    const updated = await apiFetch<GroupWithStats>(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    const idx = groups.value.findIndex((g) => g.id === groupId);
    if (idx !== -1) groups.value[idx] = updated;
    return updated;
  }

  return {
    groups,
    discovered,
    loading,
    discovering,
    registering,
    selectedGroupId,
    selectedGroup,
    error,
    fetchGroups,
    fetchGroup,
    discoverGroups,
    registerGroup,
    updateCharacter,
    setStatus,
  };
});
