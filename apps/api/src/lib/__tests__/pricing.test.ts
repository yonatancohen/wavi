import { describe, expect, it } from 'bun:test';
import { estimateCostUsd, estimateReplyCost } from '../pricing.js';

describe('pricing estimates', () => {
  it('estimates blended Haiku cost', () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(0.8, 5);
    expect(estimateCostUsd(0, 1_000_000)).toBeCloseTo(4, 5);
  });

  it('uses Sonnet 5 rates ($2 / $10 per MTok) when model name includes sonnet', () => {
    const sonnet = estimateReplyCost(1_000_000, 1_000_000, 'claude-sonnet-5');
    const haiku = estimateReplyCost(1_000_000, 1_000_000, 'claude-haiku-4-5');
    expect(sonnet).toBeCloseTo(12, 5);
    expect(haiku).toBeCloseTo(4.8, 5);
    expect(sonnet).toBeGreaterThan(haiku);
  });
});
