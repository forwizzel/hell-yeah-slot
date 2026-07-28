import { describe, expect, it } from "vitest";
import type { BonusSymbolId, Cell, Grid } from "../core/types";
import { createBonusLandingAudioPlan, swordColumnAudioEffect } from "../presentation/BonusLandingAudio";

const regular: Cell = { kind: "card", symbol: "10" };

describe("bonus landing audio", () => {
  it("plays clicks for columns without bonus symbols", () => {
    expect(createBonusLandingAudioPlan(gridWithColumns([null, null, null, null, null]), [])).toEqual([
      ["click"], ["click"], ["click"], ["click"], ["click"],
    ]);
  });

  it("counts interleaved symbol types independently and replaces column clicks", () => {
    expect(createBonusLandingAudioPlan(
      gridWithColumns(["BEER", "CIGARETTE", "BEER", "SWORD", "BEER"]),
      ["BEER"],
    )).toEqual([
      ["symbol-beer-1"],
      ["symbol-cig-1"],
      ["symbol-beer-2"],
      ["symbol-sword-1"],
      ["symbol-beer-3", "win-beer"],
    ]);
  });

  it("plays every combination hit without an individual win stinger", () => {
    expect(createBonusLandingAudioPlan(
      gridWithColumns(["BEER", "CIGARETTE", "BEER", "CIGARETTE", "BEER"]),
      [],
    )).toEqual([
      ["symbol-beer-1"],
      ["symbol-cig-1"],
      ["symbol-beer-2"],
      ["symbol-cig-2"],
      ["symbol-beer-3"],
    ]);
  });

  it.each([
    ["CIGARETTE", "symbol-cig-3", "win-cig"],
    ["SWORD", "symbol-sword-3", "win-sword"],
  ] as const)("plays the %s win with its third hit", (symbol, thirdEffect, winEffect) => {
    const plan = createBonusLandingAudioPlan(gridWithColumns([symbol, null, symbol, null, symbol]), [symbol]);

    expect(plan[4]).toEqual([thirdEffect, winEffect]);
  });

  it("uses the first Sword sound only on a Sword expansion column", () => {
    const expansion = { row: 1, column: 3 };

    expect(Array.from({ length: 5 }, (_, column) => swordColumnAudioEffect(column, expansion))).toEqual([
      "click", "click", "click", "symbol-sword-1", "click",
    ]);
  });
});

function gridWithColumns(symbols: ReadonlyArray<BonusSymbolId | null>): Grid {
  return Array.from({ length: 3 }, (_, row) => symbols.map((symbol, column) =>
    symbol !== null && row === column % 3 ? { kind: "bonus", symbol } : regular,
  ));
}
