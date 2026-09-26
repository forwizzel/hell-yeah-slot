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
    FEATURE_BUY_MULTIPLIER_TENTHS[feature],
    "Feature-buy cost exceeds the safe integer range",
  ) / 10;
}

export const GAME_CONFIG = {
  startingBalanceCents: 45_000_000,
  defaultBetCents: 50_000,
  betOptionsCents: BET_OPTIONS_CENTS,
  rows: 3,
  columns: 5,
  beerFreeSpins: 8,
  cigaretteFreeSpins: 8,
  beerRetriggerSpins: 5,
  cigaretteRetriggerSpins: 5,
  beerFreeSpinMultiplier: 3,
  maximumPaidRoundWinMultiplier: 10_000,
  recentEventLimit: 30,
  maximumAutoSpins: 1_000,
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

export interface CashAwardPrize {
  readonly multiplierTenths: number;
  readonly weight: number;
}

export const CIGARETTE_CASH_AWARDS: ReadonlyArray<CashAwardPrize> = Object.freeze([
  Object.freeze({ multiplierTenths: 5, weight: 30 }),
  Object.freeze({ multiplierTenths: 10, weight: 25 }),
  Object.freeze({ multiplierTenths: 15, weight: 18 }),
  Object.freeze({ multiplierTenths: 20, weight: 12 }),
  Object.freeze({ multiplierTenths: 30, weight: 7 }),
  Object.freeze({ multiplierTenths: 50, weight: 4 }),
  Object.freeze({ multiplierTenths: 100, weight: 2 }),
  Object.freeze({ multiplierTenths: 200, weight: 1 }),
  Object.freeze({ multiplierTenths: 500, weight: 1 }),
]);

export const BEER_CASH_AWARDS: ReadonlyArray<CashAwardPrize> = Object.freeze([
  Object.freeze({ multiplierTenths: 5, weight: 45 }),
  Object.freeze({ multiplierTenths: 10, weight: 30 }),
  Object.freeze({ multiplierTenths: 15, weight: 15 }),
  Object.freeze({ multiplierTenths: 20, weight: 6 }),
  Object.freeze({ multiplierTenths: 50, weight: 3 }),
  Object.freeze({ multiplierTenths: 250, weight: 1 }),
]);
import { safeMultiply } from "../math/safeInteger";

export type FeatureBuyId = "beer" | "cigarette" | "combined" | "sword";

export const FEATURE_BUY_MULTIPLIER_TENTHS: Readonly<Record<FeatureBuyId, number>> = Object.freeze({
  beer: 136,
  cigarette: 250,
  combined: 731,
  sword: 1_638,
});
