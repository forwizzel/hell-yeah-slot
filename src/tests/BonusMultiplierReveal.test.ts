import { describe, expect, it } from "vitest";
import { createMultiplierRollValues } from "../presentation/BonusMultiplierReveal";

describe("createMultiplierRollValues", () => {
  it("cycles valid effective multipliers and ends on the resolved award", () => {
    const values = createMultiplierRollValues(42);

    expect(values).toHaveLength(9);
    expect(values).toContain(12);
    expect(values).toContain(60);
    expect(values.at(-1)).toBe(42);
    expect(values.slice(0, -1)).not.toContain(42);
  });

  it("uses the supplied result instead of selecting a new multiplier", () => {
    expect(createMultiplierRollValues(12).at(-1)).toBe(12);
    expect(createMultiplierRollValues(60).at(-1)).toBe(60);
  });

  it("rejects values outside the resolved Cigarette range", () => {
    expect(() => createMultiplierRollValues(6)).toThrow("Cigarette multiplier is outside the configured range");
    expect(() => createMultiplierRollValues(13)).toThrow("Effective free-spin multiplier is invalid");
  });
});
