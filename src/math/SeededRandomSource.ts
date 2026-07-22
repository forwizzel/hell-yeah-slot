import { validateMaxExclusive, type RandomSource } from "./RandomSource";

export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: string | number) {
    const normalizedSeed = String(seed);
    if (normalizedSeed.length === 0) {
      throw new Error("Seed must not be empty");
    }
    this.state = hashSeed(normalizedSeed);
  }

  nextFloat(): number {
    // Mulberry32 is compact, deterministic, and suitable for repeatable local tests.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  nextInt(maxExclusive: number): number {
    validateMaxExclusive(maxExclusive);
    return Math.floor(this.nextFloat() * maxExclusive);
  }
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
