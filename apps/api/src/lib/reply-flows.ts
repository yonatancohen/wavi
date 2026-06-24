import { redis } from './redis.js';
import { recordInflightPeak } from './usage.js';

const ACTIVE_KEY = 'reply_flows:active';
const FLOW_TTL = 600; // 10 min safety net if completion is missed

export type ReplyFlowStatus = 'queued' | 'processing';

export interface ReplyFlowRecord {
  id: string;
  group_id: string;
  group_name: string;
  sender_name: string;
  message_preview: string;
  status: ReplyFlowStatus;
  queued_at: number;
}

function flowKey(id: string) {
  return `reply_flow:${id}`;
}

function previewMessage(body: string, max = 80): string {
  const trimmed = body.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export async function registerReplyFlow(params: { group_id: string; group_name: string; sender_name: string; body: string }): Promise<string> {
  const id = crypto.randomUUID();
  const queued_at = Date.now();
  const record: ReplyFlowRecord = {
    id,
    group_id: params.group_id,
    group_name: params.group_name,
    sender_name: params.sender_name,
    message_preview: previewMessage(params.body),
    status: 'queued',
    queued_at,
  };

  await redis.set(flowKey(id), JSON.stringify(record), { ex: FLOW_TTL });
  await redis.zadd(ACTIVE_KEY, { score: queued_at, member: id });
  const total = await redis.zcard(ACTIVE_KEY);
  if (total) await recordInflightPeak(total);
  return id;
}

export async function markReplyFlowProcessing(flowId: string | undefined) {
  if (!flowId) return;

  const raw = await redis.get<string>(flowKey(flowId));
  if (!raw) return;

  const record: ReplyFlowRecord = typeof raw === 'string' ? JSON.parse(raw) : raw;
  record.status = 'processing';
  await redis.set(flowKey(flowId), JSON.stringify(record), { ex: FLOW_TTL });
}

export async function completeReplyFlow(flowId: string | undefined) {
  if (!flowId) return;
  await redis.del(flowKey(flowId));
  await redis.zrem(ACTIVE_KEY, flowId);
}

export async function getActiveReplyFlows(limit = 3) {
  const ids = await redis.zrange<string[]>(ACTIVE_KEY, 0, -1, { rev: true });
  if (!ids?.length) {
    return { total: 0, flows: [] as ReplyFlowRecord[] };
  }

  const flows: ReplyFlowRecord[] = [];
  const stale: string[] = [];

  for (const id of ids) {
    const raw = await redis.get<string>(flowKey(id));
    if (!raw) {
      stale.push(id);
      continue;
    }
    flows.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
  }

  if (stale.length) {
    await Promise.all(stale.map((id) => redis.zrem(ACTIVE_KEY, id)));
  }

  return {
    total: flows.length,
    flows: flows.slice(0, limit),
  };
}
