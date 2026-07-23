import { describe, expect, it } from "vitest";
import { createBandMultiplierRollValues, createMultiplierRollValues } from "../presentation/BonusMultiplierReveal";

describe("createMultiplierRollValues", () => {
  it("cycles valid effective multipliers and ends on the resolved award", () => {
    const values = createMultiplierRollValues(35);

    expect(values).toHaveLength(9);
    expect(values).toContain(10);
    expect(values).toContain(50);
    expect(values.at(-1)).toBe(35);
    expect(values.slice(0, -1)).not.toContain(35);
  });

  it("uses the supplied result instead of selecting a new multiplier", () => {
    expect(createMultiplierRollValues(10).at(-1)).toBe(10);
    expect(createMultiplierRollValues(50).at(-1)).toBe(50);
  });

  it("rejects values outside the resolved Cigarette range", () => {
    expect(() => createMultiplierRollValues(5)).toThrow("Cigarette multiplier is outside the configured range");
    expect(() => createMultiplierRollValues(13)).toThrow("Effective free-spin multiplier is invalid");
  });
});

describe("createBandMultiplierRollValues", () => {
  it("cycles a resolved Sword stage band and ends on the selected multiplier", () => {
    expect(createBandMultiplierRollValues(8, 5, 10)).toEqual([5, 6, 7, 9, 10, 8]);
  });

  it("rejects selections outside the configured Sword stage band", () => {
    expect(() => createBandMultiplierRollValues(4, 5, 10)).toThrow("Sword multiplier is outside the configured stage band");
    expect(() => createBandMultiplierRollValues(8, 10, 5)).toThrow("Sword multiplier is outside the configured stage band");
  });
});
