export interface RandomSource {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
}

export function validateMaxExclusive(maxExclusive: number): void {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive safe integer");
  }
}
