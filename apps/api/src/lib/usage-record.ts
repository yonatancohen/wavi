import type { UsageRequestType } from '@wavi/shared';
import { redis } from './redis.js';
import { dayKey, monthKey, weekKey } from './usage-periods.js';

const DAY_TTL_SEC = 60 * 60 * 24 * 100;
const WEEK_TTL_SEC = 60 * 60 * 24 * 400;
const MONTH_TTL_SEC = 60 * 60 * 24 * 800;

type UsageScope = 'agent' | 'group';
type UsagePeriod = 'day' | 'week' | 'month' | 'all';

function getAgentId(): string {
  const id = process.env.AGENT_ID;
  if (!id) throw new Error('AGENT_ID not configured');
  return id;
}

function usageHashKey(scope: UsageScope, scopeId: string, period: UsagePeriod, periodId: string, type: UsageRequestType): string {
  return `usage:${scope}:${scopeId}:${period}:${periodId}:${type}`;
}

function peakInflightKey(date = new Date()): string {
  return `usage:peak_inflight:${dayKey(date)}`;
}

async function incrementTrackedUsage(params: {
  scope: UsageScope;
  scopeId: string;
  type: Exclude<UsageRequestType, 'whatsapp_reply'>;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}): Promise<void> {
  const now = new Date();
  const periods: Array<{ period: UsagePeriod; periodId: string; ttl?: number }> = [
    { period: 'day', periodId: dayKey(now), ttl: DAY_TTL_SEC },
    { period: 'week', periodId: weekKey(now), ttl: WEEK_TTL_SEC },
    { period: 'month', periodId: monthKey(now), ttl: MONTH_TTL_SEC },
    { period: 'all', periodId: 'total' },
  ];

  await Promise.all(
    periods.flatMap(({ period, periodId, ttl }) => {
      const key = usageHashKey(params.scope, params.scopeId, period, periodId, params.type);
      const ops = [redis.hincrby(key, 'requests', params.requests), redis.hincrby(key, 'input_tokens', params.inputTokens), redis.hincrby(key, 'output_tokens', params.outputTokens)];
      if (ttl) ops.push(redis.expire(key, ttl));
      return ops;
    }),
  );
}

export async function recordTrackedUsage(params: {
  type: Exclude<UsageRequestType, 'whatsapp_reply'>;
  groupId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
}): Promise<void> {
  const agentId = getAgentId();
  const inputTokens = Math.max(0, Math.round(params.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(params.outputTokens ?? 0));
  const requests = Math.max(0, Math.round(params.requests ?? 1));

  await incrementTrackedUsage({
    scope: 'agent',
    scopeId: agentId,
    type: params.type,
    inputTokens,
    outputTokens,
    requests,
  });

  if (params.groupId) {
    await incrementTrackedUsage({
      scope: 'group',
      scopeId: params.groupId,
      type: params.type,
      inputTokens,
      outputTokens,
      requests,
    });
  }
}

export async function recordInflightPeak(count: number): Promise<void> {
  const key = peakInflightKey();
  const current = Number((await redis.get<string>(key)) ?? 0);
  if (count <= current) return;
  await redis.set(key, String(count), { ex: DAY_TTL_SEC });
}

export async function recordAnthropicCall(params: { type: 'synthesis' | 'recovery'; groupId?: string; usage?: { input_tokens: number; output_tokens: number } }): Promise<void> {
  if (!params.usage) return;
  await recordTrackedUsage({
    type: params.type,
    groupId: params.groupId,
    inputTokens: params.usage.input_tokens,
    outputTokens: params.usage.output_tokens,
    requests: 1,
  });
}

export async function recordEmbeddingCall(params: { groupId?: string; totalTokens: number; requests?: number }): Promise<void> {
  await recordTrackedUsage({
    type: 'embedding',
    groupId: params.groupId,
    inputTokens: params.totalTokens,
    outputTokens: 0,
    requests: params.requests ?? 1,
  });
}

export async function recordImageGenerationCall(params: { groupId?: string; requests?: number }): Promise<void> {
  await recordTrackedUsage({
    type: 'image_generation',
    groupId: params.groupId,
    inputTokens: 0,
    outputTokens: 0,
    requests: params.requests ?? 1,
  });
}

export async function getPeakInflightToday(): Promise<number> {
  return Number((await redis.get<string>(peakInflightKey())) ?? 0);
}
