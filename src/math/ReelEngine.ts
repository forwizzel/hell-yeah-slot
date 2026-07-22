import type { ReelSymbol } from "../config/reelStrips";
import type { Cell, Grid } from "../core/types";
import type { RandomSource } from "./RandomSource";

export class ReelEngine {
  constructor(
    private readonly reelStrips: ReadonlyArray<ReadonlyArray<ReelSymbol>>,
    private readonly random: RandomSource,
    private readonly rows = 3,
  ) {
    if (reelStrips.length === 0 || reelStrips.some((strip) => strip.length === 0)) {
      throw new Error("Every reel strip must contain at least one symbol");
    }
    if (!Number.isInteger(rows) || rows <= 0) {
      throw new RangeError("Row count must be a positive integer");
    }
  }

  spin(): Grid {
    const grid: Grid = Array.from({ length: this.rows }, () => []);

    for (const strip of this.reelStrips) {
      const stop = this.random.nextInt(strip.length);
      for (let row = 0; row < this.rows; row += 1) {
        const symbol = strip[(stop + row) % strip.length];
        if (symbol === undefined) {
          throw new Error("Reel strip lookup failed");
        }
        const targetRow = grid[row];
        if (targetRow === undefined) {
          throw new Error("Grid row lookup failed");
        }
        targetRow.push(createCell(symbol));
      }
    }

    return grid;
  }
}

function createCell(symbol: ReelSymbol): Cell {
  if (symbol === "WILD") {
    return { kind: "wild" };
  }
  if (symbol === "BEER" || symbol === "CIGARETTE" || symbol === "SWORD") {
    return { kind: "bonus", symbol };
  }
  return { kind: "card", symbol };
}
