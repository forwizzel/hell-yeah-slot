import { describe, expect, it } from "vitest";
import type { FreeSpinCashAward, Position, SymbolWin } from "../core/types";
import { activePayingCellGroupIndex, allPayingPositionKeys, createPayingCellGroups, positionKey } from "../presentation/PayingCells";

const position = (row: number, column: number): Position => ({ row, column });

const cashAward = (row: number, column: number): FreeSpinCashAward => ({
  position: position(row, column),
  symbol: "CIGARETTE",
  baseAmountCents: 100,
  multiplier: 5,
  amountCents: 500,
});

const symbolWin = (...positions: Position[]): SymbolWin => ({
  symbol: "A",
  columns: 3,
  ways: 1,
  multiplierTenths: 1,
  amountCents: 10,
  positions,
});

describe("createPayingCellGroups", () => {
  it("keeps resolved ways wins as distinct groups", () => {
    const groups = createPayingCellGroups([
      symbolWin(position(0, 0), position(1, 1)),
      symbolWin(position(2, 0), position(2, 1)),
    ]);

    expect(groups.map((group) => group.keys)).toEqual([
      new Set(["0:0", "1:1"]),
      new Set(["2:0", "2:1"]),
    ]);
  });

  it("creates an individual group for every cash award", () => {
    const groups = createPayingCellGroups([], [cashAward(1, 3), cashAward(2, 4)]);

    expect(groups.map((group) => group.keys)).toEqual([
      new Set(["1:3"]),
      new Set(["2:4"]),
    ]);
  });

  it("keeps a shared paying cell in each outcome group while aggregating all payers", () => {
    const groups = createPayingCellGroups([
      symbolWin(position(1, 2)),
      symbolWin(position(1, 2), position(2, 4)),
    ], [cashAward(1, 2)]);

    expect(allPayingPositionKeys(groups)).toEqual(new Set(["1:2", "2:4"]));
    expect(groups).toHaveLength(3);
  });

  it("creates stable position keys for base and Sword board coordinates", () => {
    expect(positionKey(position(0, 4))).toBe("0:4");
    expect(positionKey(position(5, 0))).toBe("5:0");
  });

  it("cycles focus groups in a stable order", () => {
    expect(activePayingCellGroupIndex(3, 0, 620)).toBe(0);
    expect(activePayingCellGroupIndex(3, 619, 620)).toBe(0);
    expect(activePayingCellGroupIndex(3, 620, 620)).toBe(1);
    expect(activePayingCellGroupIndex(3, 1_860, 620)).toBe(0);
  });
});
