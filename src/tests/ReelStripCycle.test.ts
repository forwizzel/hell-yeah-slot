import { describe, expect, it } from "vitest";
import { REEL_STRIPS, type ReelSymbol } from "../config/reelStrips";
import type { Cell } from "../core/types";
import { ReelStripCycle } from "../presentation/ReelStripCycle";

describe("ReelStripCycle", () => {
  it("walks backward with wraparound as cells enter above the viewport", () => {
    const cycle = new ReelStripCycle(["10", "J", "Q"], 0);

    expect(takeSymbols(cycle, 4)).toEqual(["10", "Q", "J", "10"]);
  });

  it("creates the correct cell type for every reel symbol", () => {
    const symbols: ReelSymbol[] = ["10", "J", "Q", "K", "A", "WILD", "BEER", "CIGARETTE", "SWORD"];
    const cycle = new ReelStripCycle(symbols, symbols.length - 1);

    expect(Array.from({ length: symbols.length }, () => cycle.takeNextCell())).toEqual([
      { kind: "bonus", symbol: "SWORD" },
      { kind: "bonus", symbol: "CIGARETTE" },
      { kind: "bonus", symbol: "BEER" },
      { kind: "wild" },
      { kind: "card", symbol: "A" },
      { kind: "card", symbol: "K" },
      { kind: "card", symbol: "Q" },
      { kind: "card", symbol: "J" },
      { kind: "card", symbol: "10" },
    ]);
  });

  it("reproduces each reel's exact frequencies over a complete cycle", () => {
    for (const strip of REEL_STRIPS) {
      const animatedSymbols = takeSymbols(new ReelStripCycle(strip, 0), strip.length);

      for (const symbol of new Set(strip)) {
        expect(count(animatedSymbols, symbol)).toBe(count(strip, symbol));
      }
    }
  });

  it("never animates SWORD on reels where SWORD cannot land", () => {
    for (const column of [1, 3]) {
      const strip = REEL_STRIPS[column]!;
      expect(takeSymbols(new ReelStripCycle(strip, 0), strip.length)).not.toContain("SWORD");
    }
  });

  it("rejects an empty strip or invalid starting index", () => {
    expect(() => new ReelStripCycle([], 0)).toThrow("Animated reel strip must contain at least one symbol");
    expect(() => new ReelStripCycle(["10"], 1)).toThrow("Animated reel starting index is outside the strip");
  });
});

function takeSymbols(cycle: ReelStripCycle, countToTake: number): ReelSymbol[] {
  return Array.from({ length: countToTake }, () => cellToSymbol(cycle.takeNextCell()));
}

function cellToSymbol(cell: Cell): ReelSymbol {
  return cell.kind === "card" ? cell.symbol : cell.kind === "wild" ? "WILD" : cell.symbol;
}

function count(symbols: ReadonlyArray<ReelSymbol>, symbol: ReelSymbol): number {
  return symbols.filter((candidate) => candidate === symbol).length;
}
