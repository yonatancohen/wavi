<template>
  <div class="flex flex-col" :class="embedded ? '' : 'min-h-0 flex-1'">
    <div class="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
      <span class="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-primary">science</span>
      <p class="text-[12px] leading-relaxed text-on-surface-variant">
        {{ t('testChat.previewBanner') }}
      </p>
    </div>

    <div v-if="loadError" class="mb-4 rounded-xl border border-error/25 bg-error/[0.07] px-4 py-3 text-[13px] text-error">
      {{ loadError }}
    </div>

    <div class="mb-4 grid gap-4 rounded-xl border border-outline-variant bg-surface-container p-4 sm:grid-cols-2">
      <label v-if="!groupId" class="flex flex-col gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('testChat.group') }}</span>
        <div class="relative">
          <select v-model="selectedGroupId" :class="selectClass" :disabled="loadingGroups" @change="onGroupChange">
            <option value="">{{ t('testChat.selectGroup') }}</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">
              {{ g.name }}
            </option>
          </select>
          <span class="material-symbols-outlined pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">expand_more</span>
        </div>
      </label>

      <label class="flex flex-col gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('testChat.sender') }}</span>
        <div class="relative">
          <select v-model="senderMode" :class="selectClass" :disabled="!selectedGroupId || loadingMembers" @change="onSenderModeChange">
            <option value="generic">{{ t('testChat.genericSender') }}</option>
            <option value="member" :disabled="members.length === 0">{{ t('testChat.memberSender') }}</option>
          </select>
          <span class="material-symbols-outlined pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">expand_more</span>
        </div>
      </label>

      <label v-if="senderMode === 'member'" class="flex flex-col gap-2 sm:col-span-2">
        <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{{ t('testChat.member') }}</span>
        <div class="relative">
          <select v-model="selectedMemberId" :class="selectClass" :disabled="loadingMembers">
            <option value="">{{ t('testChat.selectMember') }}</option>
            <option v-for="member in members" :key="member.wa_user_id" :value="member.wa_user_id">{{ member.display_name }} ({{ member.msg_count }} msgs)</option>
          </select>
          <span class="material-symbols-outlined pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">expand_more</span>
        </div>
      </label>
    </div>

    <section class="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container" :class="embedded ? 'min-h-[min(560px,55vh)]' : 'min-h-[min(560px,55vh)] flex-1'">
      <div class="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-primary">forum</span>
          <h2 class="font-sora text-[15px] font-semibold text-on-surface">
            {{ t('testChat.transcript') }}
          </h2>
        </div>
        <button type="button" class="btn btn-ghost text-[12px]" :disabled="turns.length === 0" @click="clearSession">
          {{ t('testChat.clear') }}
        </button>
      </div>

      <div ref="scrollEl" class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div v-if="!selectedGroupId" class="flex flex-1 items-center justify-center px-6 py-10 text-center">
          <div>
            <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">chat_bubble_outline</span>
            <p class="text-[13px] text-on-surface-variant">{{ t('testChat.pickGroup') }}</p>
          </div>
        </div>

        <div v-else-if="turns.length === 0" class="flex flex-1 items-center justify-center px-6 py-10 text-center">
          <div>
            <span class="material-symbols-outlined mb-2 text-[28px] text-on-surface-variant/40">smart_toy</span>
            <p class="text-[13px] text-on-surface-variant">{{ t('testChat.empty') }}</p>
          </div>
        </div>

        <article v-for="turn in turns" :key="turn.id" class="flex flex-col gap-1" :class="turn.role === 'assistant' ? 'items-end' : 'items-start'">
          <div class="flex max-w-[85%] flex-col gap-1" :class="turn.role === 'assistant' ? 'items-end' : 'items-start'">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5" :class="turn.role === 'assistant' ? 'flex-row-reverse' : ''">
              <span class="text-[11px] font-semibold" :class="turn.role === 'assistant' ? 'text-primary' : 'text-on-surface'">
                {{ turn.role === 'assistant' ? t('messages.agent') : turn.sender_name }}
              </span>
              <span v-if="turn.latency_ms != null" class="font-mono text-[10px] text-on-surface-variant/70">
                {{ turn.latency_ms }}ms · {{ (turn.prompt_tokens ?? 0) + (turn.completion_tokens ?? 0) }} tok
              </span>
            </div>
            <div
              class="rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
              :class="turn.role === 'assistant' ? 'rounded-br-md bg-primary/12 text-on-surface' : 'rounded-bl-md border border-outline-variant/60 bg-surface-variant/30 text-on-surface'"
            >
              {{ turn.content }}
            </div>
          </div>
        </article>

        <div v-if="sending" class="flex items-start gap-2 px-0.5">
          <LoadingState variant="inline" :message="t('testChat.thinking')" />
        </div>
      </div>

      <form class="border-t border-outline-variant bg-surface-container-low p-4" @submit.prevent="sendMessage">
        <div v-if="sendError" class="mb-3 text-[12px] text-error">{{ sendError }}</div>
        <div class="flex items-end gap-2 rounded-xl border border-outline-variant bg-surface-variant/20 p-2 transition-colors focus-within:border-primary/50">
          <textarea
            ref="draftEl"
            v-model="draft"
            rows="1"
            class="min-h-[44px] flex-1 resize-none overflow-y-hidden border-0 bg-transparent px-2 py-2 text-[13px] leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant/60 disabled:cursor-not-allowed disabled:opacity-50"
            :placeholder="t('testChat.placeholder')"
            :disabled="!canSend"
            @input="resizeDraft"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button type="submit" class="btn btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4" :disabled="!canSend || !draft.trim()">
            <span class="material-symbols-outlined text-[18px]">send</span>
            <span class="hidden sm:inline">{{ t('testChat.send') }}</span>
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useGroupsStore } from '../stores/groups';
import { apiFetch } from '../lib/api';
import LoadingState from './LoadingState.vue';
import type { TestReplyHistoryTurn, TestReplyRequest, TestReplyResponse, UserProfile } from '@wavi/shared';

interface TestChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sender_name?: string;
  latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

const props = withDefaults(
  defineProps<{
    groupId?: string;
    embedded?: boolean;
  }>(),
  { groupId: undefined, embedded: false },
);

const GENERIC_SENDER_NAME = 'Tester';
const GENERIC_SENDER_WA_ID = 'test-admin';

const fieldClass =
  'w-full rounded-xl border border-outline-variant bg-surface-variant/20 px-4 py-2.5 text-[13px] text-on-surface outline-none transition-colors focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50';
const selectClass = `${fieldClass} appearance-none pe-10`;

const { t } = useI18n();
const groupsStore = useGroupsStore();
const { groups } = storeToRefs(groupsStore);

const selectedGroupId = ref('');
const senderMode = ref<'generic' | 'member'>('generic');
const selectedMemberId = ref('');
const members = ref<UserProfile[]>([]);
const turns = ref<TestChatTurn[]>([]);
const draft = ref('');
const loadingGroups = ref(!props.groupId);
const loadingMembers = ref(false);
const sending = ref(false);
const loadError = ref<string | null>(null);
const sendError = ref<string | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
const draftEl = ref<HTMLTextAreaElement | null>(null);

const MAX_DRAFT_ROWS = 6;

const canSend = computed(() => Boolean(selectedGroupId.value) && !sending.value && (senderMode.value === 'generic' || Boolean(selectedMemberId.value)));

const activeSender = computed(() => {
  if (senderMode.value === 'member' && selectedMemberId.value) {
    const member = members.value.find((m) => m.wa_user_id === selectedMemberId.value);
    return {
      name: member?.display_name ?? selectedMemberId.value,
      waId: selectedMemberId.value,
    };
  }
  return { name: GENERIC_SENDER_NAME, waId: GENERIC_SENDER_WA_ID };
});

function turnId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  });
}

function resizeDraft() {
  const el = draftEl.value;
  if (!el) return;

  el.style.height = 'auto';
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 21;
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const maxHeight = lineHeight * MAX_DRAFT_ROWS + padding;
  const nextHeight = Math.min(el.scrollHeight, maxHeight);

  el.style.height = `${nextHeight}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function buildHistory(): TestReplyHistoryTurn[] {
  return turns.value.map((turn) => ({
    role: turn.role,
    content: turn.content,
    sender_name: turn.role === 'user' ? turn.sender_name : undefined,
  }));
}

async function loadMembers(groupId: string) {
  loadingMembers.value = true;
  try {
    members.value = await apiFetch<UserProfile[]>(`/groups/${groupId}/members`);
    if (members.value.length === 0) senderMode.value = 'generic';
  } catch (e) {
    members.value = [];
    loadError.value = e instanceof Error ? e.message : t('testChat.failedLoadMembers');
  } finally {
    loadingMembers.value = false;
  }
}

function clearSession() {
  turns.value = [];
  draft.value = '';
  sendError.value = null;
}

function onGroupChange() {
  clearSession();
  selectedMemberId.value = '';
  senderMode.value = 'generic';
  members.value = [];
  if (selectedGroupId.value) loadMembers(selectedGroupId.value);
}

function onSenderModeChange() {
  if (senderMode.value === 'generic') selectedMemberId.value = '';
}

async function sendMessage() {
  const message = draft.value.trim();
  if (!message || !selectedGroupId.value || sending.value) return;
  if (senderMode.value === 'member' && !selectedMemberId.value) return;

  sendError.value = null;
  sending.value = true;

  const userTurn: TestChatTurn = {
    id: turnId(),
    role: 'user',
    content: message,
    sender_name: activeSender.value.name,
  };
  turns.value.push(userTurn);
  draft.value = '';
  nextTick(resizeDraft);
  scrollToBottom();

  try {
    const body: TestReplyRequest = {
      message,
      sender_name: activeSender.value.name,
      sender_wa_id: activeSender.value.waId,
      history: buildHistory().slice(0, -1),
    };

    const result = await apiFetch<TestReplyResponse>(`/groups/${selectedGroupId.value}/test-reply`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    turns.value.push({
      id: turnId(),
      role: 'assistant',
      content: result.reply || t('testChat.emptyReply'),
      latency_ms: result.latency_ms,
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
    });
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : t('testChat.failedSend');
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

function applyFixedGroup(groupId: string) {
  if (!groupId) return;
  selectedGroupId.value = groupId;
  clearSession();
  selectedMemberId.value = '';
  senderMode.value = 'generic';
  loadMembers(groupId);
}

watch(
  () => props.groupId,
  (groupId) => {
    if (groupId) applyFixedGroup(groupId);
  },
  { immediate: true },
);

watch(turns, () => scrollToBottom(), { deep: true });
watch(draft, () => nextTick(resizeDraft));

onMounted(async () => {
  if (props.groupId) {
    nextTick(resizeDraft);
    return;
  }

  try {
    await groupsStore.fetchGroups();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('testChat.failedLoadGroups');
  } finally {
    loadingGroups.value = false;
    nextTick(resizeDraft);
  }
});
</script>
