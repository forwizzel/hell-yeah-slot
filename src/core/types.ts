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
  readonly multiplier: number;
  readonly amount: number;
  readonly positions: Position[];
}

export interface PayEvaluation {
  readonly totalWin: number;
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
  readonly regularWin: number;
  readonly bonusTrigger: BonusTrigger;
  readonly winningPositions: Position[];
}

export interface FreeSpinState {
  readonly mode: FreeSpinMode;
  readonly remainingSpins: number;
  readonly totalSpinsPlayed: number;
  readonly multiplier: number;
  readonly triggeringBet: number;
  readonly accumulatedWin: number;
}

export interface FreeSpinResult {
  readonly state: FreeSpinState;
  readonly spinWin: number;
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
  readonly payout: number;
  readonly finalMultiplier: number;
}

export interface SwordSummary {
  readonly kind: "sword";
}

export type BonusSummary = FreeSpinSummary | SwordSummary;

export interface GameViewModel {
  readonly credits: number;
  readonly bet: number;
  readonly lastWin: number;
  readonly phase: GamePhase;
  readonly grid: Grid;
  readonly winningPositions: Position[];
  readonly freeSpins: FreeSpinState | null;
  readonly bonusSummary: BonusSummary | null;
}
