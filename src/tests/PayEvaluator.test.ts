import { describe, expect, it } from "vitest";
import { PAYTABLE, PAYOUT_MULTIPLIER_SCALE } from "../config/paytable";
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
    { columns: 3, multiplierTenths: 0 },
    { columns: 4, multiplierTenths: 7 },
    { columns: 5, multiplierTenths: 52 },
  ] as const)("pays the configured amount for $columns A columns", ({ columns, multiplierTenths }) => {
    const reelColumns = Array.from({ length: 5 }, (_, column) => [
      column < columns ? card("A") : bonus(),
      bonus(),
      bonus(),
    ]);

    expect(evaluateWays(fromColumns(reelColumns), PAYTABLE, 20).totalWinCents).toBe(
      multiplierTenths * (20 / PAYOUT_MULTIPLIER_SCALE),
    );
  });

  it("scales the same outcome from the minimum through the maximum configured bet", () => {
    const grid = fromColumns([
      [card("A")],
      [card("A")],
      [card("A")],
      [card("A")],
      [card("A")],
    ]);

    expect(evaluateWays(grid, PAYTABLE, 20).totalWinCents).toBe(104);
    expect(evaluateWays(grid, PAYTABLE, 50_000).totalWinCents).toBe(260_000);
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
    expect(evaluation.totalWinCents).toBe(24);
  });

  it("allows WILD cells to support every win containing a natural target symbol", () => {
    const mixedColumn = [card("A"), card("K"), wild()];
    const grid = fromColumns([mixedColumn, mixedColumn, mixedColumn, [bonus(), bonus(), bonus()], [bonus(), bonus(), bonus()]]);
    const evaluation = evaluateWays(grid, PAYTABLE, 20);

    expect(evaluation.wins.map((win) => win.symbol)).toEqual(["K"]);
    expect(evaluation.wins.map((win) => win.ways)).toEqual([8]);
    expect(evaluation.totalWinCents).toBe(32);
  });

  it("awards a pure-WILD result once as the highest-paying SKULL symbol", () => {
    const grid = fromColumns([
      [wild(), bonus(), bonus()],
      [wild(), bonus(), bonus()],
      [wild(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
      [bonus(), bonus(), bonus()],
    ]);
    const evaluation = evaluateWays(grid, PAYTABLE, 20);

    expect(evaluation).toMatchObject({
      totalWinCents: 30,
      wins: [{ symbol: "SKULL", columns: 3, ways: 1, multiplierTenths: 15 }],
    });
  });

  it("pays COIN and SKULL as the two highest regular symbols", () => {
    const coinGrid = fromColumns([
      [card("COIN")], [card("COIN")], [card("COIN")], [bonus()], [bonus()],
    ]);
    const skullGrid = fromColumns([
      [card("SKULL")], [card("SKULL")], [card("SKULL")], [bonus()], [bonus()],
    ]);

    expect(evaluateWays(coinGrid, PAYTABLE, 20).totalWinCents).toBe(16);
    expect(evaluateWays(skullGrid, PAYTABLE, 20).totalWinCents).toBe(30);
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
      [card("A")],
      [card("A")],
    ]);

    expect(() => evaluateWays(grid, PAYTABLE, Number.MAX_SAFE_INTEGER - 1)).toThrow(
      "Ways payout exceeds the safe integer range",
    );
  });

  it("rejects bets that cannot produce exact tenth-step payouts", () => {
    const grid = fromColumns([
      [card("A")],
      [card("A")],
      [card("A")],
      [bonus()],
      [bonus()],
    ]);

    expect(() => evaluateWays(grid, PAYTABLE, 21)).toThrow("Bet must be divisible by 10 cents");
  });

  it("rejects fractional paytable units", () => {
    const grid = fromColumns([
      [card("A")],
      [card("A")],
      [card("A")],
      [bonus()],
      [bonus()],
    ]);
    const invalidPaytable = {
      ...PAYTABLE,
      A: { ...PAYTABLE.A, 3: 0.5 },
    };

    expect(() => evaluateWays(grid, invalidPaytable, 20)).toThrow(
      "Paytable multipliers must be non-negative integer tenths",
    );
  });
});
