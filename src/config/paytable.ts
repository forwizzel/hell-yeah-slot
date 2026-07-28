import type { CardSymbolId } from "../core/types";

export type MatchLength = 3 | 4 | 5;
export type Paytable = Readonly<Record<CardSymbolId, Readonly<Record<MatchLength, number>>>>;
export const PAYOUT_MULTIPLIER_SCALE = 10;

export const CARD_SYMBOLS: readonly CardSymbolId[] = ["10", "J", "Q", "K", "A", "COIN", "SKULL"];

// Values are multiplier tenths, so 1 is x0.1 and 1600 is x160.
export const PAYTABLE: Paytable = {
  "10": { 3: 1, 4: 1, 5: 2 },
  J: { 3: 1, 4: 2, 5: 3 },
  Q: { 3: 2, 4: 3, 5: 5 },
  K: { 3: 2, 4: 4, 5: 5 },
  A: { 3: 0, 4: 7, 5: 52 },
  COIN: { 3: 8, 4: 23, 5: 150 },
  SKULL: { 3: 15, 4: 45, 5: 300 },
};

export const SWORD_PAYTABLE: Paytable = Object.freeze({
  "10": Object.freeze({ 3: 1, 4: 1, 5: 1 }),
  J: Object.freeze({ 3: 1, 4: 1, 5: 2 }),
  Q: Object.freeze({ 3: 2, 4: 2, 5: 4 }),
  K: Object.freeze({ 3: 2, 4: 4, 5: 8 }),
  A: Object.freeze({ 3: 5, 4: 8, 5: 52 }),
  COIN: Object.freeze({ 3: 5, 4: 8, 5: 52 }),
  SKULL: Object.freeze({ 3: 5, 4: 8, 5: 52 }),
});
