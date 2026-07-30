import { describe, expect, it } from "vitest";
import type { FreeSpinCashAward, Position } from "../core/types";
import { payingPositionKeys, positionKey } from "../presentation/PayingCells";

const position = (row: number, column: number): Position => ({ row, column });

const cashAward = (row: number, column: number): FreeSpinCashAward => ({
  position: position(row, column),
  symbol: "CIGARETTE",
  baseAmountCents: 100,
  multiplier: 5,
  amountCents: 500,
});

describe("payingPositionKeys", () => {
  it("includes resolved ways positions", () => {
    const keys = payingPositionKeys([position(0, 0), position(2, 4)]);

    expect(keys).toEqual(new Set(["0:0", "2:4"]));
  });

  it("includes cash awards even without a ways win", () => {
    const keys = payingPositionKeys([], [cashAward(1, 3)]);

    expect(keys).toEqual(new Set(["1:3"]));
  });

  it("deduplicates cells that pay through both ways and a cash award", () => {
    const keys = payingPositionKeys([position(1, 2)], [cashAward(1, 2), cashAward(2, 4)]);

    expect(keys).toEqual(new Set(["1:2", "2:4"]));
  });

  it("creates stable position keys for base and Sword board coordinates", () => {
    expect(positionKey(position(0, 4))).toBe("0:4");
    expect(positionKey(position(5, 0))).toBe("5:0");
  });
});
