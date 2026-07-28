import { describe, expect, it } from "vitest";
import { createGuaranteedFeatureSymbols } from "../core/GuaranteedFeatureSymbols";
import { ControlledRandomSource } from "./testUtils";

describe("createGuaranteedFeatureSymbols", () => {
  it.each([
    ["beer", ["BEER", "BEER", "BEER"]],
    ["cigarette", ["CIGARETTE", "CIGARETTE", "CIGARETTE"]],
    ["sword", ["SWORD", "SWORD", "SWORD"]],
  ] as const)("creates a qualifying %s grid without an extra random choice", (feature, expected) => {
    const random = new ControlledRandomSource();

    expect(createGuaranteedFeatureSymbols(feature, random)).toEqual(expected);
    expect(random.integerCalls).toBe(0);
  });

  it.each([
    [0, ["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]],
    [1, ["BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE"]],
  ] as const)("randomizes which combined symbol appears three times", (selection, expected) => {
    const random = new ControlledRandomSource([], [selection]);

    expect(createGuaranteedFeatureSymbols("combined", random)).toEqual(expected);
    expect(random.integerCalls).toBe(1);
  });
});
