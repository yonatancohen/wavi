import type { CostStats } from '@wavi/shared';
import { db } from '../db/client.js';

const HAIKU_INPUT_PER_M = 0.8;
const HAIKU_OUTPUT_PER_M = 4;
const SONNET_INPUT_PER_M = 3;
const SONNET_OUTPUT_PER_M = 15;

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  // Blended estimate — most replies use Haiku
  const inputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M;
  return inputCost + outputCost;
}

export async function getCostStats(agentId: string): Promise<CostStats> {
  const since = monthStart();
  const budgetUsd = process.env.MONTHLY_REPLY_BUDGET_USD ? Number(process.env.MONTHLY_REPLY_BUDGET_USD) : null;

  const { data: groups } = await db.from('groups').select('id').eq('agent_id', agentId);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) {
    return {
      month: since.slice(0, 7),
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_replies: 0,
      avg_latency_ms: 0,
      budget_usd: budgetUsd,
      spent_usd_estimate: 0,
      budget_exceeded: false,
      auto_paused: false,
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
    month: since.slice(0, 7),
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_replies: rows.length,
    avg_latency_ms: rows.length ? Math.round(totalLatency / rows.length) : 0,
    budget_usd: budgetUsd,
    spent_usd_estimate: Math.round(spent * 100) / 100,
    budget_exceeded: budgetExceeded,
    auto_paused: process.env.AUTO_PAUSE_ON_BUDGET === 'true' && budgetExceeded,
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

export function estimateReplyCost(inputTokens: number, outputTokens: number, model: string): number {
  const inputRate = model.includes('sonnet') ? SONNET_INPUT_PER_M : HAIKU_INPUT_PER_M;
  const outputRate = model.includes('sonnet') ? SONNET_OUTPUT_PER_M : HAIKU_OUTPUT_PER_M;
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}
