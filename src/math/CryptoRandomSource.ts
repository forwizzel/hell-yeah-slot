import { validateMaxExclusive, type RandomSource } from "./RandomSource";

const UINT32_RANGE = 0x1_0000_0000;

export class CryptoRandomSource implements RandomSource {
  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  nextInt(maxExclusive: number): number {
    validateMaxExclusive(maxExclusive);
    if (maxExclusive > UINT32_RANGE) {
      return Math.floor(this.nextFloat() * maxExclusive);
    }

    // Discard the short tail so each possible result has equal probability.
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let value = this.nextUint32();
    while (value >= limit) {
      value = this.nextUint32();
    }
    return value % maxExclusive;
  }

  private nextUint32(): number {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    const value = values[0];
    if (value === undefined) {
      throw new Error("Web Crypto did not return a random value");
    }
    return value;
  }
}
