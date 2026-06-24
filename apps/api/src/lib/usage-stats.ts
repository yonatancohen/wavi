import type { UsagePeriodStats, UsageRequestType, UsageTypeStats } from '@wavi/shared';
import { USAGE_REQUEST_TYPES } from '@wavi/shared';
import { estimateCostUsd } from './pricing.js';

export function emptyTypeStats(type: UsageRequestType): UsageTypeStats {
  return { type, requests: 0, input_tokens: 0, output_tokens: 0, spent_usd_estimate: 0 };
}

export function withSpend(stats: Omit<UsageTypeStats, 'spent_usd_estimate'>): UsageTypeStats {
  return {
    ...stats,
    spent_usd_estimate: Math.round(estimateCostUsd(stats.input_tokens, stats.output_tokens) * 100) / 100,
  };
}

export function sumTypeStats(items: UsageTypeStats[]): UsageTypeStats {
  const total = items.reduce(
    (acc, item) => ({
      requests: acc.requests + item.requests,
      input_tokens: acc.input_tokens + item.input_tokens,
      output_tokens: acc.output_tokens + item.output_tokens,
    }),
    { requests: 0, input_tokens: 0, output_tokens: 0 },
  );
  return withSpend({ type: 'whatsapp_reply', ...total });
}

export function buildPeriodStats(parts: UsageTypeStats[], avgLatencyMs: number | null): UsagePeriodStats {
  const breakdown = USAGE_REQUEST_TYPES.map((type) => {
    const match = parts.filter((p) => p.type === type);
    if (match.length === 0) return emptyTypeStats(type);
    return withSpend({
      type,
      requests: match.reduce((s, m) => s + m.requests, 0),
      input_tokens: match.reduce((s, m) => s + m.input_tokens, 0),
      output_tokens: match.reduce((s, m) => s + m.output_tokens, 0),
    });
  });

  const totals = sumTypeStats(breakdown);
  return {
    requests: totals.requests,
    input_tokens: totals.input_tokens,
    output_tokens: totals.output_tokens,
    spent_usd_estimate: totals.spent_usd_estimate,
    avg_latency_ms: avgLatencyMs,
    breakdown,
  };
}
