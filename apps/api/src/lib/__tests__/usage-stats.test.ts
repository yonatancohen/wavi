import { describe, expect, it } from 'bun:test';
import { buildPeriodStats, withSpend } from '../usage-stats.js';

describe('usage stats aggregation', () => {
  it('computes spend from token totals', () => {
    const stats = withSpend({
      type: 'whatsapp_reply',
      requests: 2,
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(stats.spent_usd_estimate).toBe(0.8);
  });

  it('builds period stats with full request breakdown', () => {
    const period = buildPeriodStats(
      [withSpend({ type: 'whatsapp_reply', requests: 3, input_tokens: 1000, output_tokens: 200 }), withSpend({ type: 'test_chat', requests: 1, input_tokens: 500, output_tokens: 100 })],
      420,
    );

    expect(period.requests).toBe(4);
    expect(period.input_tokens).toBe(1500);
    expect(period.output_tokens).toBe(300);
    expect(period.avg_latency_ms).toBe(420);
    expect(period.breakdown).toHaveLength(6);
    expect(period.breakdown.find((row) => row.type === 'whatsapp_reply')?.requests).toBe(3);
    expect(period.breakdown.find((row) => row.type === 'embedding')?.requests).toBe(0);
  });
});
