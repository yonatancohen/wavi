<template>
  <section class="rounded-xl border border-outline-variant bg-surface-container p-4">
    <div class="mb-4 flex items-center gap-2">
      <span class="material-symbols-outlined text-[18px] text-secondary">groups</span>
      <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('members.title') }}</h2>
    </div>

    <LoadingState v-if="loading" variant="compact" :message="t('loading.members')" />

    <div v-else-if="error" class="rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ error }}
    </div>

    <div v-else-if="members.length === 0" class="rounded-xl border border-dashed border-outline-variant bg-surface-variant/20 px-6 py-8 text-center">
      <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">person_off</span>
      <p class="text-[13px] text-on-surface-variant">
        {{ t('members.empty') }}
      </p>
    </div>

    <div v-else class="grid gap-3">
      <article v-for="member in members" :key="member.id" class="rounded-xl border border-outline-variant bg-surface-variant/20 p-4">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="font-sora text-[14px] font-semibold text-on-surface">
              {{ member.display_name }}
            </h3>
            <p class="mt-0.5 font-mono text-[10px] text-on-surface-variant/60">
              {{ t('members.messages', { count: member.msg_count.toLocaleString() }) }}
            </p>
          </div>
          <span class="badge px-2 py-0.5" :class="activityBadgeClass(member.profile_data.activity_level)">
            {{ member.profile_data.activity_level }}
          </span>
        </div>

        <p class="mb-3 text-[13px] leading-relaxed text-on-surface-variant">
          {{ member.behavioral_summary }}
        </p>

        <div class="mb-3 flex flex-wrap gap-2">
          <span class="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
            {{ formatHumorType(member.profile_data.humor_type) }}
          </span>
          <span class="rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-semibold text-secondary"> {{ member.profile_data.emoji_usage }} emoji </span>
          <span
            v-for="topic in member.profile_data.dominant_topics.slice(0, 2)"
            :key="topic"
            class="rounded-full border border-outline-variant px-2.5 py-1 text-[10px] font-medium text-on-surface-variant"
          >
            {{ topic }}
          </span>
        </div>

        <div v-if="member.profile_data.sensitivity_flags.length > 0" class="flex flex-wrap gap-1.5 border-t border-outline-variant/50 pt-3">
          <span v-for="flag in member.profile_data.sensitivity_flags" :key="flag" class="rounded-md bg-error/[0.06] px-2 py-0.5 text-[10px] text-on-surface-variant/60">
            {{ flag }}
          </span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '../lib/api';
import LoadingState from './LoadingState.vue';
import type { UserProfile } from '@wavi/shared';

const { t } = useI18n();

const props = defineProps<{ groupId: string }>();

const members = ref<UserProfile[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

function activityBadgeClass(level: UserProfile['profile_data']['activity_level']) {
  const map = {
    high: 'bg-primary/10 text-primary border border-primary/20',
    medium: 'bg-secondary/10 text-secondary border border-secondary/20',
    low: 'bg-surface-variant text-on-surface-variant border border-outline-variant',
    lurker: 'bg-surface-variant/50 text-on-surface-variant/60 border border-outline-variant/50',
  };
  return map[level];
}

function formatHumorType(type: string) {
  return type.replace(/-/g, ' ');
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    members.value = await apiFetch<UserProfile[]>(`/groups/${props.groupId}/members`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('members.failedLoad');
    members.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.groupId, load);
onMounted(load);

defineExpose({ reload: load });
</script>
