import type { ReelSymbol } from "../config/reelStrips";
import type { Cell, Grid } from "../core/types";
import type { RandomSource } from "./RandomSource";
import { WeightedPicker, type WeightedValue } from "./WeightedPicker";

export class ReelEngine {
  private readonly bonusValuePicker: WeightedPicker<number>;

  constructor(
    private readonly reelStrips: ReadonlyArray<ReadonlyArray<ReelSymbol>>,
    bonusValueWeights: ReadonlyArray<WeightedValue<number>>,
    private readonly random: RandomSource,
    private readonly rows = 3,
  ) {
    if (reelStrips.length === 0 || reelStrips.some((strip) => strip.length === 0)) {
      throw new Error("Every reel strip must contain at least one symbol");
    }
    if (!Number.isInteger(rows) || rows <= 0) {
      throw new RangeError("Row count must be a positive integer");
    }
    this.bonusValuePicker = new WeightedPicker(bonusValueWeights);
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
        targetRow.push(this.createCell(symbol));
      }
    }

    return grid;
  }

  private createCell(symbol: ReelSymbol): Cell {
    if (symbol === "BONUS") {
      return { kind: "bonus", value: this.bonusValuePicker.pick(this.random) };
    }
    return { kind: "regular", symbol };
  }
}
