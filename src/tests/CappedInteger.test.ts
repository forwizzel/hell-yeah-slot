import { describe, expect, it } from "vitest";
import { addCapped, multiplyCapped } from "../math/cappedInteger";

describe("capped integer arithmetic", () => {
  it("caps additions before unsafe intermediate values are created", () => {
    expect(addCapped(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 10_000)).toBe(10_000);
    expect(addCapped(4_000, 5_000, 10_000)).toBe(9_000);
  });

  it("caps multiplications before unsafe intermediate values are created", () => {
    expect(multiplyCapped(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 10_000)).toBe(10_000);
    expect(multiplyCapped(20, 30, 10_000)).toBe(600);
  });
});
