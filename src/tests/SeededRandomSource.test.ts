import { describe, expect, it } from "vitest";
import { SeededRandomSource } from "../math/SeededRandomSource";

describe("SeededRandomSource", () => {
  it("produces the same sequence for the same seed", () => {
    const first = new SeededRandomSource("repeatable");
    const second = new SeededRandomSource("repeatable");

    expect(Array.from({ length: 20 }, () => first.nextFloat())).toEqual(
      Array.from({ length: 20 }, () => second.nextFloat()),
    );
  });

  it("generally produces different sequences for different seeds", () => {
    const first = new SeededRandomSource("alpha");
    const second = new SeededRandomSource("beta");

    expect(Array.from({ length: 10 }, () => first.nextFloat())).not.toEqual(
      Array.from({ length: 10 }, () => second.nextFloat()),
    );
  });

  it("keeps nextInt values inside the requested bounds", () => {
    const random = new SeededRandomSource(42);
    const values = Array.from({ length: 1_000 }, () => random.nextInt(7));

    expect(values.every((value) => value >= 0 && value < 7)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid nextInt bound %s",
    (bound) => {
      expect(() => new SeededRandomSource(1).nextInt(bound)).toThrow(RangeError);
    },
  );
});
