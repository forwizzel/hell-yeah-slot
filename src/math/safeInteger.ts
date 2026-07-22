export function safeAdd(left: number, right: number, message: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(message);
  }
  return result;
}

export function safeMultiply(left: number, right: number, message: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(message);
  }
  return result;
}
