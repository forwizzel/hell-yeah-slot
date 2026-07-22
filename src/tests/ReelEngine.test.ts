import { describe, expect, it } from "vitest";
import { BONUS_VALUE_WEIGHTS } from "../config/gameConfig";
import { REEL_STRIPS, type ReelSymbol } from "../config/reelStrips";
import { ReelEngine } from "../math/ReelEngine";
import { SeededRandomSource } from "../math/SeededRandomSource";
import { ControlledRandomSource } from "./testUtils";

const SIMPLE_STRIPS: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
  ["A", "B", "C"],
  ["B", "C", "D"],
  ["C", "D", "A"],
  ["D", "A", "B"],
  ["A", "C", "D"],
];

describe("ReelEngine", () => {
  it("always creates a 3 x 5 grid", () => {
    const engine = new ReelEngine(REEL_STRIPS, BONUS_VALUE_WEIGHTS, new SeededRandomSource(7));
    const grid = engine.spin();

    expect(grid).toHaveLength(3);
    expect(grid.every((row) => row.length === 5)).toBe(true);
  });

  it("wraps consecutive symbols around the end of a strip", () => {
    const random = new ControlledRandomSource([], [2, 0, 0, 0, 0]);
    const grid = new ReelEngine(SIMPLE_STRIPS, [{ value: 1, weight: 1 }], random).spin();

    expect(grid.map((row) => row[0])).toEqual([
      { kind: "regular", symbol: "C" },
      { kind: "regular", symbol: "A" },
      { kind: "regular", symbol: "B" },
    ]);
  });

  it("is deterministic with a seeded source", () => {
    const first = new ReelEngine(REEL_STRIPS, BONUS_VALUE_WEIGHTS, new SeededRandomSource("reels"));
    const second = new ReelEngine(REEL_STRIPS, BONUS_VALUE_WEIGHTS, new SeededRandomSource("reels"));

    expect(Array.from({ length: 10 }, () => first.spin())).toEqual(
      Array.from({ length: 10 }, () => second.spin()),
    );
  });

  it("takes every column from its corresponding strip", () => {
    const stops = [1, 2, 0, 1, 2];
    const grid = new ReelEngine(
      SIMPLE_STRIPS,
      [{ value: 1, weight: 1 }],
      new ControlledRandomSource([], [...stops]),
    ).spin();

    for (let column = 0; column < SIMPLE_STRIPS.length; column += 1) {
      const strip = SIMPLE_STRIPS[column]!;
      const expected = Array.from({ length: 3 }, (_, row) => strip[(stops[column]! + row) % strip.length]);
      const actual = grid.map((row) => {
        const cell = row[column];
        return cell?.kind === "regular" ? cell.symbol : "BONUS";
      });
      expect(actual).toEqual(expected);
    }
  });
});
