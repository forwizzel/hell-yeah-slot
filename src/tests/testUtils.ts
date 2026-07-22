import type { RandomSource } from "../math/RandomSource";

export class ControlledRandomSource implements RandomSource {
  floatCalls = 0;
  integerCalls = 0;

  constructor(
    private readonly floats: number[] = [],
    private readonly integers: number[] = [],
    private readonly fallbackFloat = 0.99,
  ) {}

  nextFloat(): number {
    this.floatCalls += 1;
    return this.floats.shift() ?? this.fallbackFloat;
  }

  nextInt(maxExclusive: number): number {
    this.integerCalls += 1;
    const value = this.integers.shift() ?? 0;
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError("Controlled integer is outside the requested range");
    }
    return value;
  }
}
