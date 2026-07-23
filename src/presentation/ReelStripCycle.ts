import type { ReelSymbol } from "../config/reelStrips";
import type { Cell } from "../core/types";

export class ReelStripCycle {
  private nextIndex: number;

  constructor(
    private readonly strip: ReadonlyArray<ReelSymbol>,
    startingIndex: number,
  ) {
    if (strip.length === 0) {
      throw new Error("Animated reel strip must contain at least one symbol");
    }
    if (!Number.isSafeInteger(startingIndex) || startingIndex < 0 || startingIndex >= strip.length) {
      throw new RangeError("Animated reel starting index is outside the strip");
    }
    this.nextIndex = startingIndex;
  }

  takeNextCell(): Cell {
    const symbol = this.strip[this.nextIndex];
    if (symbol === undefined) {
      throw new Error("Animated reel strip lookup failed");
    }

    // New cells enter above the viewport, so walking backward keeps the visible
    // top-to-bottom window in the strip's forward order.
    this.nextIndex = (this.nextIndex - 1 + this.strip.length) % this.strip.length;
    return reelSymbolToCell(symbol);
  }
}

function reelSymbolToCell(symbol: ReelSymbol): Cell {
  if (symbol === "WILD") {
    return { kind: "wild" };
  }
  if (symbol === "BEER" || symbol === "CIGARETTE" || symbol === "SWORD") {
    return { kind: "bonus", symbol };
  }
  return { kind: "card", symbol };
}
