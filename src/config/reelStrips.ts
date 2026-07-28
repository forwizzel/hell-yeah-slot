import type { BonusSymbolId, CardSymbolId } from "../core/types";

export type ReelSymbol = CardSymbolId | "WILD" | BonusSymbolId;

const REEL_LENGTH = 64;
// Higher-paying regular symbols are progressively rarer on the base/free-spin strips.
const CARD_DISTRIBUTION: readonly CardSymbolId[] = [
  "10", "J", "Q", "K", "A", "COIN", "SKULL", "10", "J", "Q", "K", "A", "COIN",
  "10", "J", "Q", "K", "A", "10", "J", "Q", "K", "10", "J", "Q", "COIN", "J", "10",
  "10", "J", "Q", "K", "COIN", "SKULL", "Q", "10", "J", "10", "10", "J", "Q", "K", "COIN",
  "J", "Q", "10", "J", "COIN", "SKULL", "J", "Q",
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

// Sword reels isolate SWORD by two stops in either direction. Since only three
// reels contain SWORD, a Sword trigger leaves at most two reels for other bonuses.
export const REEL_STRIPS: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
  createReel(0, [[0, "SWORD"], [10, "BEER"], [11, "CIGARETTE"], [22, "WILD"], [31, "BEER"], [50, "BEER"]]),
  createReel(3, [[8, "BEER"], [9, "CIGARETTE"], [29, "BEER"], [47, "BEER"], [60, "WILD"]]),
  createReel(6, [[3, "BEER"], [4, "CIGARETTE"], [16, "SWORD"], [23, "WILD"], [31, "BEER"], [50, "BEER"]]),
  createReel(9, [[12, "BEER"], [26, "WILD"], [35, "BEER"], [53, "BEER"]]),
  createReel(12, [[7, "BEER"], [8, "CIGARETTE"], [20, "WILD"], [32, "SWORD"], [44, "BEER"], [57, "BEER"]]),
];
