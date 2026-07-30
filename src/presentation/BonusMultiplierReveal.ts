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
