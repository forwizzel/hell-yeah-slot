import { describe, expect, it } from "vitest";
import { WeightedPicker } from "../math/WeightedPicker";
import { ControlledRandomSource } from "./testUtils";

describe("WeightedPicker", () => {
  it("rejects an empty collection", () => {
    expect(() => new WeightedPicker([])).toThrow("must not be empty");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "explicitly rejects invalid weight %s",
    (weight) => {
      expect(() => new WeightedPicker([{ value: "A", weight }])).toThrow(RangeError);
    },
  );

  it("selects deterministic weighted ranges with a controlled source", () => {
    const picker = new WeightedPicker([
      { value: "low", weight: 1 },
      { value: "middle", weight: 2 },
      { value: "high", weight: 1 },
    ]);
    const random = new ControlledRandomSource([0, 0.25, 0.74, 0.99]);

    expect([picker.pick(random), picker.pick(random), picker.pick(random), picker.pick(random)]).toEqual([
      "low",
      "middle",
      "middle",
      "high",
    ]);
  });
});
