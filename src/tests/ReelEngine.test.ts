import { describe, expect, it } from "vitest";
import { REEL_STRIPS, type ReelSymbol } from "../config/reelStrips";
import { ReelEngine } from "../math/ReelEngine";
import { SeededRandomSource } from "../math/SeededRandomSource";
import { ControlledRandomSource } from "./testUtils";

const SIMPLE_STRIPS: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
  ["10", "J", "Q"],
  ["J", "Q", "K"],
  ["Q", "K", "A"],
  ["K", "A", "WILD"],
  ["A", "BEER", "SWORD"],
];

describe("ReelEngine", () => {
  it("always creates a 3 x 5 grid", () => {
    const grid = new ReelEngine(REEL_STRIPS, new SeededRandomSource(7)).spin();

    expect(grid).toHaveLength(3);
    expect(grid.every((row) => row.length === 5)).toBe(true);
  });

  it("wraps consecutive symbols around the end of a strip", () => {
    const random = new ControlledRandomSource([], [2, 0, 0, 0, 0]);
    const grid = new ReelEngine(SIMPLE_STRIPS, random).spin();

    expect(grid.map((row) => row[0])).toEqual([
      { kind: "card", symbol: "Q" },
      { kind: "card", symbol: "10" },
      { kind: "card", symbol: "J" },
    ]);
  });

  it("maps wild and named bonus symbols to distinct cell types", () => {
    const strips: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
      ["WILD", "BEER", "CIGARETTE"],
      ["BEER", "CIGARETTE", "SWORD"],
      ["CIGARETTE", "SWORD", "10"],
      ["SWORD", "WILD", "J"],
      ["A", "K", "Q"],
    ];
    const grid = new ReelEngine(strips, new ControlledRandomSource([], [0, 0, 0, 0, 0])).spin();

    expect(grid[0]).toEqual([
      { kind: "wild" },
      { kind: "bonus", symbol: "BEER" },
      { kind: "bonus", symbol: "CIGARETTE" },
      { kind: "bonus", symbol: "SWORD" },
      { kind: "card", symbol: "A" },
    ]);
  });

  it("is deterministic with a seeded source", () => {
    const first = new ReelEngine(REEL_STRIPS, new SeededRandomSource("reels"));
    const second = new ReelEngine(REEL_STRIPS, new SeededRandomSource("reels"));

    expect(Array.from({ length: 10 }, () => first.spin())).toEqual(
      Array.from({ length: 10 }, () => second.spin()),
    );
  });

  it("takes every column from its corresponding strip", () => {
    const stops = [1, 2, 0, 1, 2];
    const grid = new ReelEngine(SIMPLE_STRIPS, new ControlledRandomSource([], [...stops])).spin();

    for (let column = 0; column < SIMPLE_STRIPS.length; column += 1) {
      const strip = SIMPLE_STRIPS[column]!;
      const expected = Array.from({ length: 3 }, (_, row) => strip[(stops[column]! + row) % strip.length]);
      const actual = grid.map((row) => {
        const cell = row[column]!;
        return cell.kind === "card" ? cell.symbol : cell.kind === "wild" ? "WILD" : cell.symbol;
      });
      expect(actual).toEqual(expected);
    }
  });

  it("configures the requested relative bonus rarity", () => {
    expect(REEL_STRIPS.every((strip) => count(strip, "BEER") === 3)).toBe(true);
    expect(REEL_STRIPS.every((strip) => count(strip, "CIGARETTE") === 1)).toBe(true);
    expect(REEL_STRIPS.filter((strip) => count(strip, "SWORD") === 1)).toHaveLength(3);
  });

  it("makes a Sword trigger structurally exclusive", () => {
    const swordReels = REEL_STRIPS.filter((strip) => strip.includes("SWORD"));
    expect(swordReels).toHaveLength(3);

    for (const strip of REEL_STRIPS) {
      for (let stop = 0; stop < strip.length; stop += 1) {
        const window = visibleWindow(strip, stop);
        expect(count(window, "BEER")).toBeLessThanOrEqual(1);
        expect(count(window, "CIGARETTE")).toBeLessThanOrEqual(1);
        if (window.includes("SWORD")) {
          expect(window).not.toContain("BEER");
          expect(window).not.toContain("CIGARETTE");
        }
      }
    }
  });

  it("keeps a natural Beer and Cigarette combination reachable", () => {
    const combinationStops = REEL_STRIPS.map((strip) => {
      const stop = Array.from({ length: strip.length }, (_, index) => index)
        .find((index) => visibleWindow(strip, index).includes("BEER")
          && visibleWindow(strip, index).includes("CIGARETTE"));
      expect(stop).toBeDefined();
      return stop!;
    });
    const grid = new ReelEngine(REEL_STRIPS, new ControlledRandomSource([], combinationStops)).spin();
    const cells = grid.flat();

    expect(cells.filter((cell) => cell.kind === "bonus" && cell.symbol === "BEER")).toHaveLength(5);
    expect(cells.filter((cell) => cell.kind === "bonus" && cell.symbol === "CIGARETTE")).toHaveLength(5);
  });
});

function visibleWindow(strip: ReadonlyArray<ReelSymbol>, stop: number): ReelSymbol[] {
  return Array.from({ length: 3 }, (_, row) => strip[(stop + row) % strip.length]!);
}

function count(symbols: ReadonlyArray<ReelSymbol>, symbol: ReelSymbol): number {
  return symbols.filter((candidate) => candidate === symbol).length;
}
