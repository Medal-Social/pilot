// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export interface ModelPrice {
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
}

export const CODEX_PRICES: Record<string, ModelPrice> = {
  'gpt-5': { inputPerM: 30, cachedInputPerM: 7.5, outputPerM: 60 },
  'gpt-5.4': { inputPerM: 30, cachedInputPerM: 7.5, outputPerM: 60 },
  'gpt-4.1': { inputPerM: 2, cachedInputPerM: 0.5, outputPerM: 8 },
  'gpt-4.1-mini': { inputPerM: 0.4, cachedInputPerM: 0.1, outputPerM: 1.6 },
  'gpt-4o': { inputPerM: 2.5, cachedInputPerM: 1.25, outputPerM: 10 },
  'gpt-4o-mini': { inputPerM: 0.15, cachedInputPerM: 0.075, outputPerM: 0.6 },
};

export function computeCodexCost(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): number | null {
  const prices = CODEX_PRICES[model];
  if (!prices) return null;
  const M = 1_000_000;
  // `inputTokens` from Codex's `total_token_usage` already INCLUDES
  // `cachedInputTokens`. Charge the cached portion at the cached rate
  // and the rest at the full input rate — never both.
  const fullInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  return (
    (fullInputTokens * prices.inputPerM) / M +
    (cachedInputTokens * prices.cachedInputPerM) / M +
    (outputTokens * prices.outputPerM) / M
  );
}
