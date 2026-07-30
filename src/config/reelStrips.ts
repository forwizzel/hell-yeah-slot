import type { BonusSymbolId, CardSymbolId } from "../core/types";

export type ReelSymbol = CardSymbolId | "WILD" | BonusSymbolId;

const REEL_LENGTH = 64;
// Higher-paying regular symbols are progressively rarer on the base/free-spin strips.
const CARD_DISTRIBUTION: readonly CardSymbolId[] = [
  "10", "J", "Q", "K", "A", "GUN", "KNIGHT", "10", "J", "Q", "K", "A", "GUN",
  "10", "J", "Q", "K", "A", "10", "J", "Q", "K", "10", "J", "Q", "GUN", "J", "10",
  "10", "J", "Q", "K", "GUN", "KNIGHT", "Q", "10", "J", "10", "10", "J", "Q", "K", "GUN",
  "J", "Q", "10", "J", "GUN", "KNIGHT", "J", "Q",
];

function createReel(offset: number, specials: ReadonlyArray<readonly [number, ReelSymbol]>): ReadonlyArray<ReelSymbol> {
  const reel: ReelSymbol[] = Array.from(
    { length: REEL_LENGTH },
    (_, index) => CARD_DISTRIBUTION[(index + offset) % CARD_DISTRIBUTION.length]!,
  );
  for (const [index, symbol] of specials) {
    reel[index] = symbol;
  }
  return reel;
}

// Bonus entries are separated by at least two stops, so a visible reel window
// contains at most one bonus symbol. Each type appears on only three reels.
export const REEL_STRIPS: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
  createReel(0, [[4, "BEER"], [5, "WILD"], [13, "SWORD"], [24, "BEER"], [32, "SWORD"], [43, "BEER"], [50, "SWORD"], [57, "BEER"]]),
  createReel(3, [[2, "BEER"], [3, "WILD"], [7, "SWORD"], [14, "BEER"], [19, "BEER"], [26, "SWORD"], [33, "BEER"], [37, "BEER"], [42, "SWORD"], [48, "BEER"], [53, "SWORD"], [58, "BEER"]]),
  createReel(6, [[2, "BEER"], [5, "BEER"], [12, "CIGARETTE"], [19, "BEER"], [24, "WILD"], [25, "BEER"], [28, "BEER"], [32, "CIGARETTE"], [40, "BEER"], [48, "BEER"], [54, "CIGARETTE"], [57, "BEER"], [62, "BEER"]]),
  createReel(9, [[5, "CIGARETTE"], [11, "SWORD"], [20, "SWORD"], [25, "WILD"], [26, "CIGARETTE"], [33, "SWORD"], [43, "CIGARETTE"], [58, "SWORD"]]),
  createReel(12, [[4, "CIGARETTE"], [15, "CIGARETTE"], [19, "WILD"], [22, "CIGARETTE"], [31, "CIGARETTE"], [41, "CIGARETTE"], [49, "CIGARETTE"], [52, "CIGARETTE"], [58, "CIGARETTE"], [63, "CIGARETTE"]]),
];
