import type { AgentUsageStats, GroupUsageRank, GroupUsageStats, UsagePeriodStats, UsageReplyExtreme, UsageRequestType, UsageTypeStats } from '@wavi/shared';
import { USAGE_REQUEST_TYPES } from '@wavi/shared';
import { db } from '../db/client.js';
import { redis } from './redis.js';
import { estimateCostUsd, estimateReplyCost } from './pricing.js';
import { dayKey, getDayStartUtc, getMonthStartUtc, getWeekStartSundayUtc, monthKey, weekKey } from './usage-periods.js';
import { buildPeriodStats, emptyTypeStats, sumTypeStats, withSpend } from './usage-stats.js';

export { getPeakInflightToday } from './usage-record.js';

const TRACKED_TYPES = USAGE_REQUEST_TYPES.filter((t) => t !== 'whatsapp_reply') as Exclude<UsageRequestType, 'whatsapp_reply'>[];

type UsageScope = 'agent' | 'group';
type UsagePeriod = 'day' | 'week' | 'month' | 'all';

interface ReplyRow {
  group_id: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}

function usageHashKey(scope: UsageScope, scopeId: string, period: UsagePeriod, periodId: string, type: UsageRequestType): string {
  return `usage:${scope}:${scopeId}:${period}:${periodId}:${type}`;
}

async function readTrackedTypeStats(scope: UsageScope, scopeId: string, period: UsagePeriod, periodId: string, type: UsageRequestType): Promise<UsageTypeStats> {
  const raw = await redis.hgetall<Record<string, string>>(usageHashKey(scope, scopeId, period, periodId, type));
  if (!raw || Object.keys(raw).length === 0) return emptyTypeStats(type);

  return withSpend({
    type,
    requests: Number(raw.requests ?? 0),
    input_tokens: Number(raw.input_tokens ?? 0),
    output_tokens: Number(raw.output_tokens ?? 0),
  });
}

async function fetchReplyRows(groupIds: string[], since: string | null): Promise<ReplyRow[]> {
  if (groupIds.length === 0) return [];

  let query = db.from('replies').select('group_id, prompt_tokens, completion_tokens, latency_ms, created_at').in('group_id', groupIds);
  if (since) query = query.gte('created_at', since);

  const { data } = await query;
  return (data ?? []) as ReplyRow[];
}

function whatsappStatsFromRows(rows: ReplyRow[]): UsageTypeStats & { avg_latency_ms: number | null } {
  if (rows.length === 0) {
    return { ...emptyTypeStats('whatsapp_reply'), avg_latency_ms: null };
  }

  const input = rows.reduce((s, r) => s + (r.prompt_tokens ?? 0), 0);
  const output = rows.reduce((s, r) => s + (r.completion_tokens ?? 0), 0);
  const latency = rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0);

  return {
    ...withSpend({
      type: 'whatsapp_reply',
      requests: rows.length,
      input_tokens: input,
      output_tokens: output,
    }),
    avg_latency_ms: Math.round(latency / rows.length),
  };
}

async function trackedStatsForPeriod(scope: UsageScope, scopeId: string, period: UsagePeriod, periodId: string): Promise<UsageTypeStats[]> {
  return Promise.all(TRACKED_TYPES.map((type) => readTrackedTypeStats(scope, scopeId, period, periodId, type)));
}

async function buildScopePeriodStats(scope: UsageScope, scopeId: string, groupIds: string[], since: string | null, period: UsagePeriod, periodId: string): Promise<UsagePeriodStats> {
  const [whatsapp, tracked] = await Promise.all([fetchReplyRows(groupIds, since).then(whatsappStatsFromRows), trackedStatsForPeriod(scope, scopeId, period, periodId)]);

  const { avg_latency_ms, ...whatsappType } = whatsapp;
  return buildPeriodStats([whatsappType, ...tracked], avg_latency_ms);
}

async function getGroupNameMap(groupIds: string[]): Promise<Map<string, string>> {
  if (groupIds.length === 0) return new Map();
  const { data } = await db.from('groups').select('id, name').in('id', groupIds);
  return new Map((data ?? []).map((g) => [g.id as string, g.name as string]));
}

async function getReplyExtremes(groupIds: string[], since: string | null): Promise<{ min: UsageReplyExtreme | null; max: UsageReplyExtreme | null }> {
  if (groupIds.length === 0) return { min: null, max: null };

  const rows = await fetchReplyRows(groupIds, since);
  if (rows.length === 0) return { min: null, max: null };

  const names = await getGroupNameMap(groupIds);

  const ranked = rows
    .map((row) => {
      const input = row.prompt_tokens ?? 0;
      const output = row.completion_tokens ?? 0;
      const total = input + output;
      return {
        total_tokens: total,
        input_tokens: input,
        output_tokens: output,
        spent_usd_estimate: Math.round(estimateReplyCost(input, output, 'haiku') * 100) / 100,
        group_id: row.group_id,
        group_name: names.get(row.group_id) ?? 'Unknown',
        created_at: row.created_at,
      } satisfies UsageReplyExtreme;
    })
    .sort((a, b) => a.total_tokens - b.total_tokens);

  return { min: ranked[0] ?? null, max: ranked[ranked.length - 1] ?? null };
}

async function getTopGroups(agentId: string, since: string | null, limit = 3): Promise<GroupUsageRank[]> {
  const { data: groups } = await db.from('groups').select('id, name').eq('agent_id', agentId);
  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id as string);
  const names = new Map(groupRows.map((g) => [g.id as string, g.name as string]));
  const replyRows = await fetchReplyRows(groupIds, since);

  const byGroup = new Map<string, { requests: number; input: number; output: number }>();
  for (const row of replyRows) {
    const current = byGroup.get(row.group_id) ?? { requests: 0, input: 0, output: 0 };
    current.requests += 1;
    current.input += row.prompt_tokens ?? 0;
    current.output += row.completion_tokens ?? 0;
    byGroup.set(row.group_id, current);
  }

  const now = new Date();
  const monthStartIso = getMonthStartUtc(now).toISOString();
  const period: UsagePeriod = since === monthStartIso ? 'month' : since ? 'week' : 'all';
  const periodId = period === 'month' ? monthKey(now) : period === 'week' ? weekKey(now) : 'total';

  const trackedByGroup = await Promise.all(
    groupIds.map(async (groupId) => {
      const tracked = await trackedStatsForPeriod('group', groupId, period, periodId);
      const totals = sumTypeStats(tracked);
      return { groupId, ...totals };
    }),
  );

  const ranks: GroupUsageRank[] = groupIds.map((groupId) => {
    const wa = byGroup.get(groupId) ?? { requests: 0, input: 0, output: 0 };
    const tracked = trackedByGroup.find((t) => t.groupId === groupId);
    const input = wa.input + (tracked?.input_tokens ?? 0);
    const output = wa.output + (tracked?.output_tokens ?? 0);
    const requests = wa.requests + (tracked?.requests ?? 0);
    return {
      group_id: groupId,
      group_name: names.get(groupId) ?? 'Unknown',
      requests,
      input_tokens: input,
      output_tokens: output,
      spent_usd_estimate: Math.round(estimateCostUsd(input, output) * 100) / 100,
    };
  });

  return ranks.sort((a, b) => b.spent_usd_estimate - a.spent_usd_estimate).slice(0, limit);
}

export async function getAgentUsageStats(agentId: string): Promise<AgentUsageStats> {
  const { data: groups } = await db.from('groups').select('id').eq('agent_id', agentId);
  const groupIds = (groups ?? []).map((g) => g.id as string);
  const now = new Date();
  const budgetUsd = process.env.MONTHLY_REPLY_BUDGET_USD ? Number(process.env.MONTHLY_REPLY_BUDGET_USD) : null;

  const [today, week, month, allTime, topGroups, extremes] = await Promise.all([
    buildScopePeriodStats('agent', agentId, groupIds, getDayStartUtc(now).toISOString(), 'day', dayKey(now)),
    buildScopePeriodStats('agent', agentId, groupIds, getWeekStartSundayUtc(now).toISOString(), 'week', weekKey(now)),
    buildScopePeriodStats('agent', agentId, groupIds, getMonthStartUtc(now).toISOString(), 'month', monthKey(now)),
    buildScopePeriodStats('agent', agentId, groupIds, null, 'all', 'total'),
    getTopGroups(agentId, getMonthStartUtc(now).toISOString(), 3),
    getReplyExtremes(groupIds, getMonthStartUtc(now).toISOString()),
  ]);

  const budgetExceeded = budgetUsd != null && month.spent_usd_estimate >= budgetUsd;

  return {
    today,
    week,
    month,
    all_time: allTime,
    top_groups: topGroups,
    min_reply: extremes.min,
    max_reply: extremes.max,
    budget_usd: budgetUsd,
    budget_exceeded: budgetExceeded,
    auto_paused: process.env.AUTO_PAUSE_ON_BUDGET === 'true' && budgetExceeded,
    week_starts_on: 'sunday',
  };
}

export async function getGroupUsageStats(agentId: string, groupId: string): Promise<GroupUsageStats | null> {
  const { data: group } = await db.from('groups').select('id').eq('id', groupId).eq('agent_id', agentId).maybeSingle();
  if (!group) return null;

  const now = new Date();
  const groupIds = [groupId];

  const [today, week, month, allTime, extremes] = await Promise.all([
    buildScopePeriodStats('group', groupId, groupIds, getDayStartUtc(now).toISOString(), 'day', dayKey(now)),
    buildScopePeriodStats('group', groupId, groupIds, getWeekStartSundayUtc(now).toISOString(), 'week', weekKey(now)),
    buildScopePeriodStats('group', groupId, groupIds, getMonthStartUtc(now).toISOString(), 'month', monthKey(now)),
    buildScopePeriodStats('group', groupId, groupIds, null, 'all', 'total'),
    getReplyExtremes(groupIds, null),
  ]);

  return {
    group_id: groupId,
    today,
    week,
    month,
    all_time: allTime,
    min_reply: extremes.min,
    max_reply: extremes.max,
    week_starts_on: 'sunday',
  };
}
