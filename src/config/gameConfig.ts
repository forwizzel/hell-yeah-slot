export const BET_OPTIONS_CENTS = [
  20,
  40,
  60,
  80,
  100,
  120,
  140,
  160,
  180,
  200,
  250,
  300,
  500,
  1_000,
  2_500,
  5_000,
  7_500,
  10_000,
  15_000,
  20_000,
  25_000,
  30_000,
  40_000,
  50_000,
] as const;

export function getAdjacentBetCents(currentBetCents: number, direction: -1 | 1): number {
  const currentIndex = BET_OPTIONS_CENTS.findIndex((option) => option === currentBetCents);
  if (currentIndex < 0) {
    throw new RangeError("Current bet is not a configured option");
  }
  return BET_OPTIONS_CENTS[currentIndex + direction] ?? currentBetCents;
}

export function getFeatureBuyCostCents(feature: FeatureBuyId, betCents: number): number {
  if (!Number.isSafeInteger(betCents) || betCents <= 0) {
    throw new RangeError("Feature-buy bet must be a positive safe integer number of cents");
  }
  return safeMultiply(
    betCents,
    FEATURE_BUY_MULTIPLIERS[feature],
    "Feature-buy cost exceeds the safe integer range",
  );
}

export const GAME_CONFIG = {
  startingBalanceCents: 45_000_000,
  defaultBetCents: 50_000,
  betOptionsCents: BET_OPTIONS_CENTS,
  rows: 3,
  columns: 5,
  beerFreeSpins: 10,
  cigaretteFreeSpins: 10,
  beerFreeSpinMultiplier: 5,
  cigaretteCashAwardMinimumTenths: 5,
  cigaretteCashAwardMaximumTenths: 500,
  beerCashAwardMinimumTenths: 5,
  beerCashAwardMaximumTenths: 250,
  recentEventLimit: 30,
  normalSpinDurationMs: 3_500,
  quickSpinDurationMs: 180,
  normalReelStepDurationMs: 115,
  quickReelStepDurationMs: 78,
  reelSettleDurationMs: 320,
  normalEvaluationDelayMs: 420,
  quickEvaluationDelayMs: 90,
  normalMultiplierRevealDurationMs: 2_400,
  quickMultiplierRevealDurationMs: 180,
  normalCashAwardCountDurationMs: 650,
  quickCashAwardCountDurationMs: 180,
  normalLargeWinDurationMs: 3_000,
  quickLargeWinDurationMs: 750,
} as const;
import { safeMultiply } from "../math/safeInteger";

export type FeatureBuyId = "beer" | "cigarette" | "combined" | "sword";

export const FEATURE_BUY_MULTIPLIERS: Readonly<Record<FeatureBuyId, number>> = Object.freeze({
  beer: 23.5,
  cigarette: 58.5,
  combined: 58.6,
  sword: 900,
});
