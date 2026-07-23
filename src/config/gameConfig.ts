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

export const GAME_CONFIG = {
  startingBalanceCents: 100_000,
  defaultBetCents: 1_000,
  betOptionsCents: BET_OPTIONS_CENTS,
  rows: 3,
  columns: 5,
  beerFreeSpins: 10,
  cigaretteFreeSpins: 3,
  freeSpinBaseMultiplier: 6,
  cigaretteMultiplierMinimum: 2,
  cigaretteMultiplierMaximum: 10,
  belowThresholdTriggerChances: {
    BEER: { 1: 0.002, 2: 0.008 },
    CIGARETTE: { 1: 0.005, 2: 0.01 },
  },
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
} as const;
