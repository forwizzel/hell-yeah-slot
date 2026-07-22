import type { RandomSource } from "../math/RandomSource";

export class ControlledRandomSource implements RandomSource {
  constructor(
    private readonly floats: number[] = [],
    private readonly integers: number[] = [],
    private readonly fallbackFloat = 0.99,
  ) {}

  nextFloat(): number {
    return this.floats.shift() ?? this.fallbackFloat;
  }

  nextInt(maxExclusive: number): number {
    const value = this.integers.shift() ?? 0;
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError("Controlled integer is outside the requested range");
    }
    return value;
  }
}
