import { describe, expect, it } from "vitest";
import { PAYTABLE } from "../config/paytable";
import type { BonusCell, Cell, Grid, RegularSymbolId } from "../core/types";
import { evaluateWays } from "../math/PayEvaluator";

const bonus = (value = 1): BonusCell => ({ kind: "bonus", value });
const regular = (symbol: RegularSymbolId): Cell => ({ kind: "regular", symbol });

function fromColumns(columns: Cell[][]): Grid {
  return Array.from({ length: 3 }, (_, row) => columns.map((column) => column[row] ?? bonus()));
}

describe("evaluateWays", () => {
  it("does not win when a match does not start in the leftmost column", () => {
    const grid = fromColumns([
      [regular("A"), regular("A"), regular("A")],
      [regular("D"), bonus(), bonus()],
      [regular("D"), bonus(), bonus()],
      [regular("D"), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);

    expect(evaluateWays(grid, PAYTABLE, 10).totalWin).toBe(0);
  });

  it.each([
    { columns: 3, multiplier: 5 },
    { columns: 4, multiplier: 10 },
    { columns: 5, multiplier: 20 },
  ] as const)("pays the configured amount for $columns D columns", ({ columns, multiplier }) => {
    const reelColumns = Array.from({ length: 5 }, (_, column) => [
      column < columns ? regular("D") : bonus(),
      bonus(),
      bonus(),
    ]);

    expect(evaluateWays(fromColumns(reelColumns), PAYTABLE, 10).totalWin).toBe(multiplier * 10);
  });

  it("multiplies matching symbol counts into the number of ways", () => {
    const grid = fromColumns([
      [regular("A"), regular("A"), bonus()],
      [regular("A"), regular("A"), regular("A")],
      [regular("A"), regular("A"), bonus()],
      [bonus(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);
    const evaluation = evaluateWays(grid, PAYTABLE, 2);

    expect(evaluation.wins[0]?.ways).toBe(12);
    expect(evaluation.totalWin).toBe(24);
  });

  it("awards multiple different symbols in one result", () => {
    const mixedColumn = [regular("A"), regular("B"), bonus()];
    const grid = fromColumns([mixedColumn, mixedColumn, mixedColumn, [bonus(), bonus(), bonus()], [bonus(), bonus(), bonus()]]);
    const evaluation = evaluateWays(grid, PAYTABLE, 10);

    expect(evaluation.wins.map((win) => win.symbol)).toEqual(["A", "B"]);
    expect(evaluation.totalWin).toBe(30);
  });

  it("ignores BONUS symbols in regular wins", () => {
    const grid = fromColumns(Array.from({ length: 5 }, () => [bonus(), bonus(), bonus()]));

    expect(evaluateWays(grid, PAYTABLE, 10)).toMatchObject({ totalWin: 0, wins: [] });
  });
});
