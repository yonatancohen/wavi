import type { CostStats, TestChatCostStats } from '@wavi/shared';
import { db } from '../db/client.js';
import { redis } from './redis.js';
import { estimateCostUsd } from './pricing.js';
import { recordTrackedUsage } from './usage.js';

const TEST_CHAT_COST_TTL_SEC = 60 * 60 * 24 * 45;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function testChatCostKey(month = currentMonthKey()): string {
  return `test_chat_cost:${month}`;
}

function emptyTestChatCost(): TestChatCostStats {
  return {
    input_tokens: 0,
    output_tokens: 0,
    replies: 0,
    spent_usd_estimate: 0,
  };
}

async function getTestChatCostStats(): Promise<TestChatCostStats> {
  const raw = await redis.hgetall<Record<string, string>>(testChatCostKey());
  if (!raw || Object.keys(raw).length === 0) return emptyTestChatCost();

  const inputTokens = Number(raw.input_tokens ?? 0);
  const outputTokens = Number(raw.output_tokens ?? 0);
  const replies = Number(raw.replies ?? 0);

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    replies,
    spent_usd_estimate: Math.round(estimateCostUsd(inputTokens, outputTokens) * 100) / 100,
  };
}

export async function recordTestChatUsage(inputTokens: number, outputTokens: number, groupId?: string): Promise<void> {
  const key = testChatCostKey();
  await Promise.all([redis.hincrby(key, 'input_tokens', inputTokens), redis.hincrby(key, 'output_tokens', outputTokens), redis.hincrby(key, 'replies', 1), redis.expire(key, TEST_CHAT_COST_TTL_SEC)]);
  await recordTrackedUsage({
    type: 'test_chat',
    groupId,
    inputTokens,
    outputTokens,
    requests: 1,
  });
}

export async function getCostStats(agentId: string): Promise<CostStats> {
  const since = monthStart();
  const month = since.slice(0, 7);
  const budgetUsd = process.env.MONTHLY_REPLY_BUDGET_USD ? Number(process.env.MONTHLY_REPLY_BUDGET_USD) : null;
  const testChat = await getTestChatCostStats();

  const { data: groups } = await db.from('groups').select('id').eq('agent_id', agentId);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) {
    return {
      month,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_replies: 0,
      avg_latency_ms: 0,
      budget_usd: budgetUsd,
      spent_usd_estimate: 0,
      budget_exceeded: false,
      auto_paused: false,
      test_chat: testChat,
    };
  }

  const { data: replies } = await db.from('replies').select('prompt_tokens, completion_tokens, latency_ms').in('group_id', groupIds).gte('created_at', since);

  const rows = replies ?? [];
  const totalInput = rows.reduce((s, r) => s + (r.prompt_tokens ?? 0), 0);
  const totalOutput = rows.reduce((s, r) => s + (r.completion_tokens ?? 0), 0);
  const totalLatency = rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0);
  const spent = estimateCostUsd(totalInput, totalOutput);
  const budgetExceeded = budgetUsd != null && spent >= budgetUsd;

  return {
    month,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_replies: rows.length,
    avg_latency_ms: rows.length ? Math.round(totalLatency / rows.length) : 0,
    budget_usd: budgetUsd,
    spent_usd_estimate: Math.round(spent * 100) / 100,
    budget_exceeded: budgetExceeded,
    auto_paused: process.env.AUTO_PAUSE_ON_BUDGET === 'true' && budgetExceeded,
    test_chat: testChat,
  };
}

export async function maybeAutoPauseOnBudget(agentId: string): Promise<boolean> {
  if (process.env.AUTO_PAUSE_ON_BUDGET !== 'true') return false;
  const stats = await getCostStats(agentId);
  if (!stats.budget_exceeded) return false;

  await db.from('groups').update({ status: 'paused' }).eq('agent_id', agentId).eq('status', 'active');
  console.warn(`[Cost] Monthly budget exceeded ($${stats.spent_usd_estimate}) — auto-paused active groups`);
  return true;
}

export { estimateReplyCost } from './pricing.js';
