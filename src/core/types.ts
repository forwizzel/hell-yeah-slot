export type GamePhase =
  | "idle"
  | "base-spinning"
  | "base-evaluation"
  | "bonus-intro"
  | "free-spin-spinning"
  | "free-spin-evaluation"
  | "sword-bonus"
  | "bonus-complete";

export type CardSymbolId = "10" | "J" | "Q" | "K" | "A";
export type BonusSymbolId = "BEER" | "CIGARETTE" | "SWORD";

export interface CardCell {
  readonly kind: "card";
  readonly symbol: CardSymbolId;
}

export interface WildCell {
  readonly kind: "wild";
}

export interface BonusCell {
  readonly kind: "bonus";
  readonly symbol: BonusSymbolId;
}

export type Cell = CardCell | WildCell | BonusCell;
export type Grid = Cell[][];

export interface Position {
  readonly row: number;
  readonly column: number;
}

export interface SymbolWin {
  readonly symbol: CardSymbolId;
  readonly columns: number;
  readonly ways: number;
  readonly multiplierTenths: number;
  readonly amountCents: number;
  readonly positions: Position[];
}

export interface PayEvaluation {
  readonly totalWinCents: number;
  readonly wins: SymbolWin[];
  readonly winningPositions: Position[];
}

export type BonusTriggerSource = "natural" | "chance";
export type FreeSpinMode = "beer" | "cigarette" | "combined";

export interface BonusActivation {
  readonly symbol: "BEER" | "CIGARETTE";
  readonly source: BonusTriggerSource;
  readonly symbolCount: number;
  readonly positions: Position[];
}

export type BonusTrigger =
  | { readonly kind: "none" }
  | {
      readonly kind: "sword";
      readonly positions: Position[];
    }
  | {
      readonly kind: "free-spins";
      readonly mode: FreeSpinMode;
      readonly startingSpins: number;
      readonly multiplier: number;
      readonly beer: BonusActivation | null;
      readonly cigarette: BonusActivation | null;
    };

export interface SpinResult {
  readonly grid: Grid;
  readonly regularWinCents: number;
  readonly bonusTrigger: BonusTrigger;
  readonly winningPositions: Position[];
}

export interface FreeSpinState {
  readonly mode: FreeSpinMode;
  readonly remainingSpins: number;
  readonly totalSpinsPlayed: number;
  readonly multiplier: number;
  readonly triggeringBetCents: number;
  readonly accumulatedWinCents: number;
}

export interface FreeSpinResult {
  readonly state: FreeSpinState;
  readonly spinWinCents: number;
  readonly beerRetriggered: boolean;
  readonly cigaretteRetriggered: boolean;
  readonly swordTriggered: boolean;
  readonly addedSpins: number;
  readonly awardedMultiplier: number | null;
  readonly complete: boolean;
}

export interface FreeSpinSummary {
  readonly kind: "free-spins";
  readonly mode: FreeSpinMode;
  readonly spinsPlayed: number;
  readonly payoutCents: number;
  readonly finalMultiplier: number;
}

export interface SwordSummary {
  readonly kind: "sword";
}

export type BonusSummary = FreeSpinSummary | SwordSummary;

export interface GameViewModel {
  readonly balanceCents: number;
  readonly betCents: number;
  readonly lastWinCents: number;
  readonly phase: GamePhase;
  readonly grid: Grid;
  readonly winningPositions: Position[];
  readonly freeSpins: FreeSpinState | null;
  readonly bonusSummary: BonusSummary | null;
}
