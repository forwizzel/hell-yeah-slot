import type { RandomSource } from "./RandomSource";

export interface WeightedValue<T> {
  readonly value: T;
  readonly weight: number;
}

export class WeightedPicker<T> {
  private readonly entries: ReadonlyArray<WeightedValue<T>>;
  private readonly totalWeight: number;

  constructor(entries: ReadonlyArray<WeightedValue<T>>) {
    if (entries.length === 0) {
      throw new Error("Weighted collection must not be empty");
    }
    for (const entry of entries) {
      if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
        throw new RangeError("Every weight must be a positive finite number");
      }
    }

    this.totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
    if (!Number.isFinite(this.totalWeight)) {
      throw new RangeError("Total weight must be finite");
    }
    this.entries = [...entries];
  }

  pick(random: RandomSource): T {
    const target = random.nextFloat() * this.totalWeight;
    let cumulativeWeight = 0;

    for (const entry of this.entries) {
      cumulativeWeight += entry.weight;
      if (target < cumulativeWeight) {
        return entry.value;
      }
    }

    const fallback = this.entries[this.entries.length - 1];
    if (fallback === undefined) {
      throw new Error("Weighted collection unexpectedly became empty");
    }
    return fallback.value;
  }
}
