export function addCapped(left: number, right: number, maximum: number): number {
  validateNonNegativeSafeInteger(left, "Left value");
  validateNonNegativeSafeInteger(right, "Right value");
  validateNonNegativeSafeInteger(maximum, "Maximum value");
  if (left >= maximum || right >= maximum - left) {
    return maximum;
  }
  return left + right;
}

export function multiplyCapped(left: number, right: number, maximum: number): number {
  validateNonNegativeSafeInteger(left, "Left value");
  validateNonNegativeSafeInteger(right, "Right value");
  validateNonNegativeSafeInteger(maximum, "Maximum value");
  if (left === 0 || right === 0) {
    return 0;
  }
  if (left >= maximum || right > Math.floor(maximum / left)) {
    return maximum;
  }
  return left * right;
}

function validateNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}
