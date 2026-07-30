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

  it("creates purchased spins with exactly the requested bonus symbols", () => {
    const grid = new ReelEngine(REEL_STRIPS, new ControlledRandomSource([], [0, 0, 0, 0, 0, 14, 11, 8, 5, 2]))
      .spinWithGuaranteedBonusSymbols([
        "BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE",
      ]);
    const bonusCells = grid.flat().flatMap((cell, index) => cell.kind === "bonus" ? [{ cell, index }] : []);
    const bonusSymbols = bonusCells.map(({ cell }) => cell.symbol);

    expect(bonusSymbols).toHaveLength(5);
    expect(bonusSymbols.filter((symbol) => symbol === "BEER")).toHaveLength(3);
    expect(bonusSymbols.filter((symbol) => symbol === "CIGARETTE")).toHaveLength(2);
    expect(bonusSymbols).not.toContain("SWORD");
    expect(new Set(bonusCells.map(({ index }) => index % 5)).size).toBe(5);
    expect(bonusCells.map(({ index }) => index)).toEqual([10, 11, 12, 13, 14]);
  });

  it("rejects guaranteed spins that violate symbol limits", () => {
    const reelEngine = new ReelEngine(REEL_STRIPS, new ControlledRandomSource());

    expect(() => reelEngine.spinWithGuaranteedBonusSymbols([
      "BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE",
    ])).toThrow("Guaranteed bonus symbols exceed the column count");
    expect(() => reelEngine.spinWithGuaranteedBonusSymbols([
      "BEER", "BEER", "BEER", "BEER",
    ])).toThrow("Guaranteed BEER symbols exceed the matching-symbol limit");
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
    expect(REEL_STRIPS.map((strip) => count(strip, "BEER"))).toEqual([4, 7, 9, 0, 0]);
    expect(REEL_STRIPS.map((strip) => count(strip, "CIGARETTE"))).toEqual([0, 0, 3, 3, 9]);
    expect(REEL_STRIPS.map((strip) => count(strip, "SWORD"))).toEqual([3, 4, 0, 4, 0]);
  });

  it("targets the configured natural feature trigger rates", () => {
    const rates = featureTriggerRates();

    expect(rates.beer + rates.combined).toBeCloseTo(2.64684744, 7);
    expect(rates.cigarette + rates.combined).toBeCloseTo(0.98825656, 7);
    expect(rates.sword).toBeCloseTo(0.49438477, 7);
    expect(rates.combined).toBeCloseTo(0.20530969, 7);
  });

  it("includes visible GUN and KNIGHT symbols on every base and free-spin reel", () => {
    for (const strip of REEL_STRIPS) {
      expect(count(strip, "GUN")).toBeGreaterThanOrEqual(5);
      expect(count(strip, "KNIGHT")).toBeGreaterThanOrEqual(3);
      expect(count(strip, "10")).toBeGreaterThan(count(strip, "GUN"));
      expect(count(strip, "J")).toBeGreaterThan(count(strip, "KNIGHT"));
    }
  });

  it("allows at most one bonus symbol per column and three matching symbols per grid", () => {
    for (const strip of REEL_STRIPS) {
      for (let stop = 0; stop < strip.length; stop += 1) {
        const window = visibleWindow(strip, stop);
        expect(window.filter(isBonusSymbol)).toHaveLength(window.some(isBonusSymbol) ? 1 : 0);
      }
    }
    for (const symbol of ["BEER", "CIGARETTE", "SWORD"] as const) {
      expect(REEL_STRIPS.filter((strip) => strip.includes(symbol))).toHaveLength(3);
    }
  });

  it.each([
    [[4, 2, 2, 5, 4], 3, 2],
    [[4, 2, 12, 5, 4], 2, 3],
  ] as const)("keeps both natural 3+2 combinations reachable", (combinationStops, beerCount, cigaretteCount) => {
    const grid = new ReelEngine(REEL_STRIPS, new ControlledRandomSource([], [...combinationStops])).spin();
    const cells = grid.flat();

    expect(cells.filter((cell) => cell.kind === "bonus" && cell.symbol === "BEER")).toHaveLength(beerCount);
    expect(cells.filter((cell) => cell.kind === "bonus" && cell.symbol === "CIGARETTE")).toHaveLength(cigaretteCount);
  });
});

function visibleWindow(strip: ReadonlyArray<ReelSymbol>, stop: number): ReelSymbol[] {
  return Array.from({ length: 3 }, (_, row) => strip[(stop + row) % strip.length]!);
}

function count(symbols: ReadonlyArray<ReelSymbol>, symbol: ReelSymbol): number {
  return symbols.filter((candidate) => candidate === symbol).length;
}

function isBonusSymbol(symbol: ReelSymbol): boolean {
  return symbol === "BEER" || symbol === "CIGARETTE" || symbol === "SWORD";
}

function featureTriggerRates(): Record<"beer" | "cigarette" | "combined" | "sword", number> {
  let distributions = new Map<string, number>([["0:0:0", 1]]);
  for (const strip of REEL_STRIPS) {
    const windows = new Map<ReelSymbol | "NONE", number>();
    for (let stop = 0; stop < strip.length; stop += 1) {
      const symbol = visibleWindow(strip, stop).find(isBonusSymbol) ?? "NONE";
      windows.set(symbol, (windows.get(symbol) ?? 0) + 1);
    }

    const next = new Map<string, number>();
    for (const [key, currentWays] of distributions) {
      const [beer = 0, cigarette = 0, sword = 0] = key.split(":").map(Number);
      for (const [symbol, windowWays] of windows) {
        const nextKey = [
          beer + Number(symbol === "BEER"),
          cigarette + Number(symbol === "CIGARETTE"),
          sword + Number(symbol === "SWORD"),
        ].join(":");
        next.set(nextKey, (next.get(nextKey) ?? 0) + currentWays * windowWays);
      }
    }
    distributions = next;
  }

  const outcomes = { beer: 0, cigarette: 0, combined: 0, sword: 0 };
  for (const [key, ways] of distributions) {
    const [beer = 0, cigarette = 0, sword = 0] = key.split(":").map(Number);
    if (sword >= 3) {
      outcomes.sword += ways;
    } else if ((beer === 3 && cigarette === 2) || (beer === 2 && cigarette === 3)) {
      outcomes.combined += ways;
    } else if (beer >= 3) {
      outcomes.beer += ways;
    } else if (cigarette >= 3) {
      outcomes.cigarette += ways;
    }
  }

  const totalStops = REEL_STRIPS.reduce((total, strip) => total * strip.length, 1);
  return Object.fromEntries(
    Object.entries(outcomes).map(([outcome, ways]) => [outcome, ways / totalStops * 100]),
  ) as Record<"beer" | "cigarette" | "combined" | "sword", number>;
}
