import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useAgentStore } from '../stores/agent';
import { useFlowsStore } from '../stores/flows';
import { useRepliesStore } from '../stores/replies';
import { formatRelativeTime } from '../lib/ui';
import type { Reply, ReplyFlow } from '@wavi/shared';

export type LiveLogEntry = {
  id: string;
  kind: 'flow' | 'reply';
  title: string;
  body: string;
  timestamp: string;
  timeLabel: string;
  icon: string;
  iconBg: string;
  iconColor: string;
};

export type LiveLogStatus = {
  title: string;
  body: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  tone: 'healthy' | 'degraded' | 'connecting' | 'offline';
};

type ReplyRow = Reply & {
  group_name?: string;
  groups?: { name?: string } | null;
  triggered_by_name?: string;
  messages?: { sender_name?: string } | null;
};

function flowEntry(flow: ReplyFlow, locale: string, t: (key: string, ...args: unknown[]) => string): LiveLogEntry {
  const timestamp = new Date(flow.queued_at).toISOString();
  const statusLabel = flow.status === 'processing' ? t('flows.processing') : t('flows.queued');

  return {
    id: `flow-${flow.id}`,
    kind: 'flow',
    title: flow.group_name,
    body: flow.message_preview
      ? t('liveLog.flowBody', { sender: flow.sender_name, status: statusLabel, preview: flow.message_preview })
      : t('liveLog.flowBodyNoPreview', { sender: flow.sender_name, status: statusLabel }),
    timestamp,
    timeLabel: formatRelativeTime(timestamp, locale),
    icon: flow.status === 'processing' ? 'psychology' : 'hourglass_top',
    iconBg: flow.status === 'processing' ? 'bg-secondary/15' : 'bg-tertiary/15',
    iconColor: flow.status === 'processing' ? 'text-secondary' : 'text-tertiary',
  };
}

function replyEntry(reply: ReplyRow, locale: string, t: (key: string, ...args: unknown[]) => string): LiveLogEntry {
  const groupName = reply.group_name ?? reply.groups?.name ?? t('liveLog.unknownGroup');
  const trigger = reply.triggered_by_name ?? reply.messages?.sender_name;
  const body = trigger ? t('liveLog.replyBodyWithTrigger', { trigger, text: reply.body }) : reply.body;

  return {
    id: `reply-${reply.id}`,
    kind: 'reply',
    title: groupName,
    body,
    timestamp: reply.created_at,
    timeLabel: formatRelativeTime(reply.created_at, locale),
    icon: reply.flagged_miss ? 'flag' : 'smart_toy',
    iconBg: reply.flagged_miss ? 'bg-error/15' : 'bg-primary/15',
    iconColor: reply.flagged_miss ? 'text-error' : 'text-primary',
  };
}

export function useLiveLog() {
  const { t, locale } = useI18n();
  const agentStore = useAgentStore();
  const flowsStore = useFlowsStore();
  const repliesStore = useRepliesStore();
  const { healthTier, connected, connecting, phoneNumber, health } = storeToRefs(agentStore);
  const { total: activeFlowTotal, flows } = storeToRefs(flowsStore);
  const { replies, loading } = storeToRefs(repliesStore);

  const status = computed<LiveLogStatus>(() => {
    if (healthTier.value === 'degraded') {
      return {
        title: t('liveLog.status.degradedTitle'),
        body: t('liveLog.status.degradedBody'),
        icon: 'sync_problem',
        iconBg: 'bg-secondary/15',
        iconColor: 'text-secondary',
        tone: 'degraded',
      };
    }

    if (connecting.value) {
      return {
        title: t('liveLog.status.connectingTitle'),
        body: t('liveLog.status.connectingBody'),
        icon: 'progress_activity',
        iconBg: 'bg-tertiary/15',
        iconColor: 'text-tertiary',
        tone: 'connecting',
      };
    }

    if (!connected.value) {
      return {
        title: t('liveLog.status.offlineTitle'),
        body: t('liveLog.status.offlineBody'),
        icon: 'link_off',
        iconBg: 'bg-error/15',
        iconColor: 'text-error',
        tone: 'offline',
      };
    }

    const phone = phoneNumber.value;
    const h = health.value;
    const detail =
      h && (h.restart_in_progress || h.consecutive_cdp_failures > 0)
        ? t('liveLog.status.healthyWithHealth', {
            phone: phone ?? t('liveLog.status.linked'),
            cdp: h.consecutive_cdp_failures,
          })
        : phone
          ? t('liveLog.status.healthyWithPhone', { phone })
          : t('liveLog.status.healthyBody');

    return {
      title: t('liveLog.status.healthyTitle'),
      body: detail,
      icon: 'check_circle',
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary',
      tone: 'healthy',
    };
  });

  const entries = computed(() => {
    const items: LiveLogEntry[] = [...flows.value.map((flow) => flowEntry(flow, locale.value, t)), ...replies.value.slice(0, 30).map((reply) => replyEntry(reply as ReplyRow, locale.value, t))];

    return items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  });

  async function refresh() {
    await repliesStore.fetchReplies();
  }

  return {
    status,
    entries,
    activeFlowTotal,
    loading,
    refresh,
  };
}
