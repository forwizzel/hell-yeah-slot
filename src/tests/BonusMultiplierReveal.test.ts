import { describe, expect, it } from "vitest";
import { createBandMultiplierRollValues } from "../presentation/BonusMultiplierReveal";

describe("BonusMultiplierReveal", () => {
  it("cycles a Sword stage band before its resolved multiplier", () => {
    expect(createBandMultiplierRollValues(8, 5, 10)).toEqual([5, 6, 7, 9, 10, 8]);
  });

  it("rejects a multiplier outside its Sword stage band", () => {
    expect(() => createBandMultiplierRollValues(4, 5, 10)).toThrow("Sword multiplier is outside the configured stage band");
  });
});
