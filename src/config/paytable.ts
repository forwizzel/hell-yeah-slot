import type { CardSymbolId } from "../core/types";

export type MatchLength = 3 | 4 | 5;
export type Paytable = Readonly<Record<CardSymbolId, Readonly<Record<MatchLength, number>>>>;
export const PAYOUT_MULTIPLIER_SCALE = 10;

export const CARD_SYMBOLS: readonly CardSymbolId[] = ["10", "J", "Q", "K", "A"];

// Values are multiplier tenths, so 1 is x0.1 and 52 is x5.2.
export const PAYTABLE: Paytable = {
  "10": { 3: 1, 4: 1, 5: 1 },
  J: { 3: 1, 4: 1, 5: 2 },
  Q: { 3: 2, 4: 2, 5: 4 },
  K: { 3: 2, 4: 4, 5: 8 },
  A: { 3: 5, 4: 8, 5: 52 },
};
