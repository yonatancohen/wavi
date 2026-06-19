<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-10 border-b border-outline-variant bg-surface px-margin-mobile py-4">
      <h1 class="font-sora text-headline-md text-on-surface">Activity</h1>
      <p class="mt-0.5 text-body-md text-on-surface-variant">
        Recent Wavi replies across your registered groups
      </p>
    </header>

    <div class="mx-auto w-full max-w-[900px] flex-1 px-margin-mobile py-8">
      <LoadingSkeletons v-if="loading" variant="activity-list" :count="4" />

      <div
        v-else-if="error"
        class="rounded-xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error"
      >
        {{ error }}
      </div>

      <div
        v-else-if="items.length === 0"
        class="mx-auto mt-16 max-w-[520px] rounded-xl border border-outline-variant bg-surface-container p-10 text-center"
      >
        <div class="relative mx-auto mb-6 inline-block">
          <div class="absolute inset-0 animate-neon-pulse rounded-full bg-primary opacity-20 blur-xl" />
          <div class="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-surface-container shadow-wavi-ring">
            <span class="material-symbols-outlined text-3xl text-primary">history</span>
          </div>
        </div>
        <h2 class="mb-2 font-sora text-headline-md text-on-surface">No activity yet</h2>
        <p class="mb-6 text-body-md text-on-surface-variant">
          Once Wavi starts replying in your groups, you'll see the feed here.
        </p>
        <RouterLink to="/groups" class="btn btn-primary">Go to Groups</RouterLink>
      </div>

      <div v-else class="space-y-1 rounded-xl border border-outline-variant bg-surface-container p-2">
        <div
          v-for="item in items"
          :key="item.id"
          class="flex items-start gap-4 rounded-xl border-b border-outline-variant/30 p-4 transition-colors last:border-0 hover:bg-surface-variant/50"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="item.flagged ? 'bg-error/20' : 'bg-primary/20'"
          >
            <span
              class="material-symbols-outlined"
              :class="item.flagged ? 'text-error' : 'text-primary'"
            >{{ item.flagged ? 'flag' : 'smart_toy' }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-label-md text-primary">{{ item.groupName }}</h3>
                <span v-if="item.flagged" class="badge border border-error/20 bg-error/10 px-2 py-0.5 text-error">
                  Flagged
                </span>
              </div>
              <span class="text-[11px] text-on-surface-variant">{{ item.time }}</span>
            </div>
            <p v-if="item.trigger" class="mb-2 text-sm text-on-surface-variant">
              Triggered by <span class="text-on-surface">{{ item.trigger }}</span>
              <span v-if="item.triggerMessage" class="italic">: "{{ item.triggerMessage }}"</span>
            </p>
            <p class="text-sm leading-relaxed text-on-surface">{{ item.body }}</p>
            <div class="mt-2 flex gap-3 text-[11px] text-on-surface-variant">
              <span>{{ item.latency }}ms</span>
              <span>{{ item.tokens }} tokens</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useRepliesStore } from '../stores/replies'
import { formatRelativeTime } from '../lib/ui'
import LoadingSkeletons from '../components/LoadingSkeletons.vue'
import type { Reply } from '@wavi/shared'

type ReplyRow = Reply & {
  messages?: { sender_name?: string; body?: string } | null
  groups?: { name?: string } | null
}

const store = useRepliesStore()
const error = ref<string | null>(null)

const loading = computed(() => store.loading)

const items = computed(() =>
  store.replies.map((reply) => {
    const row = reply as ReplyRow
    const groupName = row.group_name ?? row.groups?.name ?? 'Unknown group'
    const trigger = row.triggered_by_name ?? row.messages?.sender_name
    const triggerMessage = row.triggered_by_message ?? row.messages?.body

    return {
      id: reply.id,
      groupName,
      body: reply.body,
      trigger,
      triggerMessage: triggerMessage && triggerMessage.length > 120
        ? `${triggerMessage.slice(0, 120)}…`
        : triggerMessage,
      time: formatRelativeTime(reply.created_at),
      latency: reply.latency_ms,
      tokens: reply.prompt_tokens + reply.completion_tokens,
      flagged: reply.flagged_miss,
    }
  }),
)

onMounted(async () => {
  try {
    await store.fetchReplies()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load activity'
  }
})
</script>
