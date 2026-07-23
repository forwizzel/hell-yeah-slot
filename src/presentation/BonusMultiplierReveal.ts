import { GAME_CONFIG } from "../config/gameConfig";

const ROLL_FACTORS = [2, 8, 4, 10, 3, 9, 5, 7, 6] as const;

export function createMultiplierRollValues(effectiveMultiplier: number): readonly number[] {
  const baseMultiplier = GAME_CONFIG.freeSpinBaseMultiplier;
  if (!Number.isSafeInteger(effectiveMultiplier) || effectiveMultiplier % baseMultiplier !== 0) {
    throw new RangeError("Effective free-spin multiplier is invalid");
  }

  const selectedFactor = effectiveMultiplier / baseMultiplier;
  if (selectedFactor < GAME_CONFIG.cigaretteMultiplierMinimum
    || selectedFactor > GAME_CONFIG.cigaretteMultiplierMaximum) {
    throw new RangeError("Cigarette multiplier is outside the configured range");
  }

  return [
    ...ROLL_FACTORS.filter((factor) => factor !== selectedFactor).map((factor) => factor * baseMultiplier),
    effectiveMultiplier,
  ];
}
