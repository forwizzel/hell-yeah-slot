import type { RegularSymbolId } from "../core/types";

export type MatchLength = 3 | 4 | 5;
export type Paytable = Readonly<Record<RegularSymbolId, Readonly<Record<MatchLength, number>>>>;

export const PAYTABLE: Paytable = {
  A: { 3: 1, 4: 2, 5: 5 },
  B: { 3: 2, 4: 4, 5: 8 },
  C: { 3: 3, 4: 6, 5: 12 },
  D: { 3: 5, 4: 10, 5: 20 },
};
