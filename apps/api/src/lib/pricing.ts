const HAIKU_INPUT_PER_M = 0.8;
const HAIKU_OUTPUT_PER_M = 4;
const SONNET_INPUT_PER_M = 3;
const SONNET_OUTPUT_PER_M = 15;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M;
  const outputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M;
  return inputCost + outputCost;
}

export function estimateReplyCost(inputTokens: number, outputTokens: number, model: string): number {
  const inputRate = model.includes('sonnet') ? SONNET_INPUT_PER_M : HAIKU_INPUT_PER_M;
  const outputRate = model.includes('sonnet') ? SONNET_OUTPUT_PER_M : HAIKU_OUTPUT_PER_M;
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}
