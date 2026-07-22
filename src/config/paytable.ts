import type { CardSymbolId } from "../core/types";

export type MatchLength = 3 | 4 | 5;
export type Paytable = Readonly<Record<CardSymbolId, Readonly<Record<MatchLength, number>>>>;

export const CARD_SYMBOLS: readonly CardSymbolId[] = ["10", "J", "Q", "K", "A"];

export const PAYTABLE: Paytable = {
  "10": { 3: 1, 4: 2, 5: 5 },
  J: { 3: 2, 4: 4, 5: 8 },
  Q: { 3: 3, 4: 6, 5: 12 },
  K: { 3: 4, 4: 8, 5: 16 },
  A: { 3: 5, 4: 10, 5: 20 },
};
