import { describe, expect, it } from "vitest";
import { PAYTABLE } from "../config/paytable";
import type { BonusSymbolId, CardSymbolId, Cell, Grid } from "../core/types";
import { evaluateWays } from "../math/PayEvaluator";

const bonus = (symbol: BonusSymbolId = "BEER"): Cell => ({ kind: "bonus", symbol });
const card = (symbol: CardSymbolId): Cell => ({ kind: "card", symbol });
const wild = (): Cell => ({ kind: "wild" });

function fromColumns(columns: Cell[][]): Grid {
  return Array.from({ length: 3 }, (_, row) => columns.map((column) => column[row] ?? bonus()));
}

describe("evaluateWays", () => {
  it("does not win when a match does not start in the leftmost column", () => {
    const grid = fromColumns([
      [card("10"), card("10"), card("10")],
      [card("A"), bonus(), bonus()],
      [card("A"), bonus(), bonus()],
      [card("A"), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);

    expect(evaluateWays(grid, PAYTABLE, 20).totalWinCents).toBe(0);
  });

  it.each([
    { columns: 3, multiplier: 5 },
    { columns: 4, multiplier: 10 },
    { columns: 5, multiplier: 20 },
  ] as const)("pays the configured amount for $columns A columns", ({ columns, multiplier }) => {
    const reelColumns = Array.from({ length: 5 }, (_, column) => [
      column < columns ? card("A") : bonus(),
      bonus(),
      bonus(),
    ]);

    expect(evaluateWays(fromColumns(reelColumns), PAYTABLE, 20).totalWinCents).toBe(multiplier * 20);
  });

  it("scales the same outcome from the minimum through the maximum configured bet", () => {
    const grid = fromColumns([
      [card("A")],
      [card("A")],
      [card("A")],
      [bonus()],
      [bonus()],
    ]);

    expect(evaluateWays(grid, PAYTABLE, 20).totalWinCents).toBe(100);
    expect(evaluateWays(grid, PAYTABLE, 50_000).totalWinCents).toBe(250_000);
  });

  it("multiplies matching symbol counts into the number of ways", () => {
    const grid = fromColumns([
      [card("10"), card("10"), bonus()],
      [card("10"), card("10"), card("10")],
      [card("10"), card("10"), bonus()],
      [bonus(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);
    const evaluation = evaluateWays(grid, PAYTABLE, 20);

    expect(evaluation.wins[0]?.ways).toBe(12);
    expect(evaluation.totalWinCents).toBe(240);
  });

  it("allows WILD cells to support every win containing a natural target symbol", () => {
    const mixedColumn = [card("A"), card("K"), wild()];
    const grid = fromColumns([mixedColumn, mixedColumn, mixedColumn, [bonus(), bonus(), bonus()], [bonus(), bonus(), bonus()]]);
    const evaluation = evaluateWays(grid, PAYTABLE, 20);

    expect(evaluation.wins.map((win) => win.symbol)).toEqual(["K", "A"]);
    expect(evaluation.wins.map((win) => win.ways)).toEqual([8, 8]);
    expect(evaluation.totalWinCents).toBe(1_440);
  });

  it("awards a pure-WILD result once as the highest-paying A symbol", () => {
    const grid = fromColumns([
      [wild(), bonus(), bonus()],
      [wild(), bonus(), bonus()],
      [wild(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);
    const evaluation = evaluateWays(grid, PAYTABLE, 20);

    expect(evaluation.wins).toHaveLength(1);
    expect(evaluation.wins[0]).toMatchObject({ symbol: "A", columns: 3, ways: 1, amountCents: 100 });
  });

  it("ignores all bonus symbols in card wins", () => {
    const symbols: BonusSymbolId[] = ["BEER", "CIGARETTE", "SWORD"];
    const grid = fromColumns(Array.from({ length: 5 }, (_, column) => [
      bonus(symbols[column % symbols.length]),
      bonus(),
      bonus(),
    ]));

    expect(evaluateWays(grid, PAYTABLE, 20)).toMatchObject({ totalWinCents: 0, wins: [] });
  });

  it("rejects payouts outside the safe integer range", () => {
    const grid = fromColumns([
      [card("A")],
      [card("A")],
      [card("A")],
      [bonus()],
      [bonus()],
    ]);

    expect(() => evaluateWays(grid, PAYTABLE, Number.MAX_SAFE_INTEGER)).toThrow(
      "Ways payout exceeds the safe integer range",
    );
  });
});
