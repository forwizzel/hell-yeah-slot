export const GAME_CONFIG = {
  startingCredits: 1_000,
  defaultBet: 10,
  minimumBet: 1,
  maximumBet: 100,
  betIncrement: 1,
  rows: 3,
  columns: 5,
  bonusStartingRespins: 3,
  bonusLandingProbability: 0.12,
  recentEventLimit: 30,
  normalSpinDurationMs: 720,
  quickSpinDurationMs: 180,
  normalEvaluationDelayMs: 420,
  quickEvaluationDelayMs: 90,
} as const;

export const BONUS_VALUE_WEIGHTS = [
  { value: 1, weight: 40 },
  { value: 2, weight: 30 },
  { value: 5, weight: 20 },
  { value: 10, weight: 8 },
  { value: 25, weight: 2 },
] as const;
