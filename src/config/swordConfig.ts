import type { CardSymbolId } from "../core/types";

export type SwordBoardSymbol = "WILD" | CardSymbolId;
export type SwordExpansionRows = 3 | 4 | 5;
export type SwordStageRows = 4 | 5 | 6;

export interface SwordMultiplierBand {
  readonly minimum: number;
  readonly maximum: number;
}

export interface WeightedSwordBoardSymbol {
  readonly symbol: SwordBoardSymbol;
  readonly weight: number;
}

export interface WeightedSwordFinalStrike {
  readonly multiplier: number;
  readonly weight: number;
}

export interface SwordConfig {
  readonly columns: number;
  readonly startingRows: number;
  readonly maximumRows: number;
  readonly startingSpins: number;
  readonly initialMultiplier: number;
  readonly maximumPayoutMultiplier: number;
  readonly expansionChances: Readonly<Record<SwordExpansionRows, number>>;
  readonly boardSymbols: ReadonlyArray<WeightedSwordBoardSymbol>;
  readonly multiplierBands: Readonly<Record<SwordStageRows, SwordMultiplierBand>>;
  readonly finalStrikes: ReadonlyArray<WeightedSwordFinalStrike>;
}

export const SWORD_CONFIG: SwordConfig = Object.freeze({
  columns: 5,
  startingRows: 3,
  maximumRows: 6,
  startingSpins: 3,
  initialMultiplier: 1,
  maximumPayoutMultiplier: 3_750,
  expansionChances: Object.freeze({
    3: 0.4,
    4: 0.25,
    5: 0.1,
  }),
  boardSymbols: Object.freeze([
    Object.freeze({ symbol: "10" as const, weight: 30 }),
    Object.freeze({ symbol: "J" as const, weight: 25 }),
    Object.freeze({ symbol: "Q" as const, weight: 20 }),
    Object.freeze({ symbol: "K" as const, weight: 18 }),
    Object.freeze({ symbol: "A" as const, weight: 6 }),
    Object.freeze({ symbol: "WILD" as const, weight: 1 }),
  ]),
  multiplierBands: Object.freeze({
    4: Object.freeze({ minimum: 5, maximum: 10 }),
    5: Object.freeze({ minimum: 14, maximum: 18 }),
    6: Object.freeze({ minimum: 25, maximum: 30 }),
  }),
  finalStrikes: Object.freeze([
    Object.freeze({ multiplier: 5, weight: 53 }),
    Object.freeze({ multiplier: 10, weight: 21 }),
    Object.freeze({ multiplier: 15, weight: 12 }),
    Object.freeze({ multiplier: 20, weight: 7 }),
    Object.freeze({ multiplier: 30, weight: 4 }),
    Object.freeze({ multiplier: 50, weight: 2 }),
    Object.freeze({ multiplier: 100, weight: 1 }),
  ]),
});
