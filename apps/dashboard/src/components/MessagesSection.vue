<template>
  <section class="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
    <div class="flex items-center justify-between border-b border-outline-variant px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[18px] text-primary">forum</span>
        <h2 class="font-sora text-[15px] font-semibold text-on-surface">{{ t('messages.title') }}</h2>
      </div>
      <span v-if="messages.length > 0" class="font-mono text-[10px] text-on-surface-variant">
        {{ t('messages.count', { count: messages.length }) }}
      </span>
    </div>

    <LoadingState v-if="loading" variant="compact" :message="t('loading.messages')" />

    <div
      v-else-if="error"
      class="px-4 py-3 text-[13px] text-error"
    >
      {{ error }}
    </div>

    <div
      v-else-if="messages.length === 0"
      class="px-6 py-10 text-center"
    >
      <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">chat_bubble_outline</span>
      <p class="text-[13px] text-on-surface-variant">{{ t('messages.empty') }}</p>
    </div>

    <div
      v-else
      ref="scrollEl"
      class="flex max-h-[min(560px,60vh)] flex-col overflow-y-auto px-4 py-3"
      @scroll="onScroll"
    >
      <div
        class="flex shrink-0 items-center justify-center py-2"
      >
        <LoadingState
          v-if="loadingMore"
          variant="inline"
          :message="t('messages.loadingMore')"
        />
        <span
          v-else-if="hasMore"
          class="text-[11px] text-on-surface-variant/60"
        >
          {{ t('messages.scrollUp') }}
        </span>
      </div>

      <div class="flex flex-col gap-3">
        <article
          v-for="msg in messages"
          :key="msg.id"
          class="flex flex-col gap-1"
          :class="msg.is_agent_reply ? 'items-end' : 'items-start'"
        >
          <div
            class="flex max-w-[85%] flex-col gap-1"
            :class="msg.is_agent_reply ? 'items-end' : 'items-start'"
          >
            <div
              class="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5"
              :class="msg.is_agent_reply ? 'flex-row-reverse' : ''"
            >
              <span
                class="text-[11px] font-semibold"
                :class="msg.is_agent_reply ? 'text-primary' : 'text-on-surface'"
              >
                {{ msg.is_agent_reply ? t('messages.agent') : (msg.sender_name || msg.sender_wa_id) }}
              </span>
              <span class="font-mono text-[10px] text-on-surface-variant/70">
                {{ formatTime(msg.timestamp) }}
              </span>
            </div>
            <div
              class="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
              :class="msg.is_agent_reply
                ? 'rounded-br-md bg-primary/12 text-on-surface'
                : 'rounded-bl-md border border-outline-variant/60 bg-surface-variant/30 text-on-surface'"
            >
              {{ msg.body }}
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { createClient } from '@supabase/supabase-js'
import { apiFetch } from '../lib/api'
import LoadingState from './LoadingState.vue'
import type { Message, MessagesPage } from '@wavi/shared'

const PAGE_SIZE = 50

const { t, locale } = useI18n()

const props = defineProps<{ groupId: string }>()

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const messages = ref<Message[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(false)
const error = ref<string | null>(null)
const scrollEl = ref<HTMLElement | null>(null)
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

function formatTime(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const loc = locale.value === 'he' ? 'he-IL' : 'en-US'
  if (sameDay) {
    return date.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleString(loc, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function fetchPage(before?: string) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (before) params.set('before', before)
  return apiFetch<MessagesPage>(`/groups/${props.groupId}/messages?${params}`)
}

async function loadInitial() {
  loading.value = true
  error.value = null
  try {
    const page = await fetchPage()
    messages.value = page.messages
    hasMore.value = page.has_more
    await nextTick()
    scrollToBottom()
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('messages.failedLoad')
    messages.value = []
    hasMore.value = false
  } finally {
    loading.value = false
  }
}

async function loadOlder() {
  if (loadingMore.value || !hasMore.value || messages.value.length === 0) return

  const oldest = messages.value[0]
  const container = scrollEl.value
  const prevHeight = container?.scrollHeight ?? 0

  loadingMore.value = true
  try {
    const page = await fetchPage(oldest.timestamp)
    if (page.messages.length === 0) {
      hasMore.value = false
      return
    }

    const existingIds = new Set(messages.value.map((m) => m.id))
    const older = page.messages.filter((m) => !existingIds.has(m.id))
    messages.value = [...older, ...messages.value]
    hasMore.value = page.has_more

    await nextTick()
    if (container) {
      container.scrollTop += container.scrollHeight - prevHeight
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('messages.failedLoad')
  } finally {
    loadingMore.value = false
  }
}

function scrollToBottom() {
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  const el = scrollEl.value
  if (!el || loadingMore.value || !hasMore.value) return
  if (el.scrollTop < 80) loadOlder()
}

function subscribeRealtime() {
  unsubscribeRealtime()
  realtimeChannel = supabase
    .channel(`messages:${props.groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${props.groupId}`,
      },
      (payload) => {
        const msg = payload.new as Message
        if (messages.value.some((m) => m.id === msg.id)) return
        messages.value.push(msg)
        nextTick(() => {
          const el = scrollEl.value
          if (!el) return
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
          if (nearBottom) scrollToBottom()
        })
      },
    )
    .subscribe()
}

function unsubscribeRealtime() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
    realtimeChannel = null
  }
}

watch(() => props.groupId, () => {
  loadInitial()
  subscribeRealtime()
})

onMounted(() => {
  loadInitial()
  subscribeRealtime()
})

onUnmounted(unsubscribeRealtime)

defineExpose({ reload: loadInitial })
</script>
