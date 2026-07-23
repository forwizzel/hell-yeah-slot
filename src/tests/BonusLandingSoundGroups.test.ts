import { describe, expect, it } from "vitest";
import type { BonusSymbolId, Cell, Grid } from "../core/types";
import { bonusLandingSoundGroups } from "../presentation/BonusLandingSoundGroups";

const regular: Cell = { kind: "card", symbol: "10" };

describe("bonusLandingSoundGroups", () => {
  it.each([
    ["BEER", 1],
    ["BEER", 2],
    ["BEER", 3],
    ["BEER", 4],
    ["CIGARETTE", 1],
    ["CIGARETTE", 2],
    ["CIGARETTE", 3],
    ["SWORD", 1],
    ["SWORD", 2],
  ] as const)("groups all %s landings, including partial tease counts", (symbol, count) => {
    const groups = bonusLandingSoundGroups(gridWith(Array.from({ length: count }, () => symbol)));

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(count);
  });

  it("keeps different special symbols in independent ordinal groups", () => {
    const groups = bonusLandingSoundGroups(gridWith(["BEER", "BEER", "CIGARETTE", "SWORD"]));

    expect(groups.map((positions) => positions.length)).toEqual([2, 1, 1]);
    expect(groups).toEqual([
      [{ row: 0, column: 0 }, { row: 0, column: 1 }],
      [{ row: 0, column: 2 }],
      [{ row: 0, column: 3 }],
    ]);
  });

  it("keeps three-or-more SWORD symbols exclusive", () => {
    const groups = bonusLandingSoundGroups(gridWith([
      "SWORD", "SWORD", "SWORD", "BEER", "CIGARETTE",
    ]));

    expect(groups).toEqual([[{ row: 0, column: 0 }, { row: 0, column: 1 }, { row: 0, column: 2 }]]);
  });

  it("does not create sound groups without special-symbol landings", () => {
    expect(bonusLandingSoundGroups(gridWith([]))).toEqual([]);
  });
});

function gridWith(symbols: ReadonlyArray<BonusSymbolId>): Grid {
  const cells: Cell[] = Array.from({ length: 15 }, () => regular);
  symbols.forEach((symbol, index) => {
    cells[index] = { kind: "bonus", symbol };
  });
  return Array.from({ length: 3 }, (_, row) => cells.slice(row * 5, row * 5 + 5));
}
