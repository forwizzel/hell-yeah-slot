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

export function createBandMultiplierRollValues(
  selectedMultiplier: number,
  minimum: number,
  maximum: number,
): readonly number[] {
  if (!Number.isSafeInteger(selectedMultiplier)
    || !Number.isSafeInteger(minimum)
    || !Number.isSafeInteger(maximum)
    || minimum < 1
    || maximum < minimum
    || selectedMultiplier < minimum
    || selectedMultiplier > maximum) {
    throw new RangeError("Sword multiplier is outside the configured stage band");
  }

  return [
    ...Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
      .filter((multiplier) => multiplier !== selectedMultiplier),
    selectedMultiplier,
  ];
}
