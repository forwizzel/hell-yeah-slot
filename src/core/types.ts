export type GamePhase =
  | "idle"
  | "base-spinning"
  | "base-evaluation"
  | "bonus-start"
  | "bonus-intro"
  | "free-spin-spinning"
  | "free-spin-evaluation"
  | "sword-intro"
  | "sword-spinning"
  | "sword-evaluation"
  | "sword-final-strike"
  | "sword-complete"
  | "bonus-complete"
  | "large-win";

export type CardSymbolId = "10" | "J" | "Q" | "K" | "A" | "GUN" | "KNIGHT";
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

export interface BlankCell {
  readonly kind: "blank";
}

export type WaysCell = Cell | BlankCell;
export type WaysGrid = WaysCell[][];

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

export type FreeSpinMode = "beer" | "cigarette" | "combined";

export type CashAwardSymbolId = "BEER" | "CIGARETTE";

export interface FreeSpinCashAward {
  readonly position: Position;
  readonly symbol: CashAwardSymbolId;
  readonly baseAmountCents: number;
  readonly multiplier: number;
  readonly amountCents: number;
}

export interface BonusActivation {
  readonly symbol: "BEER" | "CIGARETTE";
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
      readonly beer: BonusActivation | null;
      readonly cigarette: BonusActivation | null;
    };

export interface SpinResult {
  readonly grid: Grid;
  readonly regularWinCents: number;
  readonly bonusTrigger: BonusTrigger;
  readonly winningPositions: Position[];
  readonly winningWins: SymbolWin[];
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
  readonly waysWinCents: number;
  readonly cashAwardWinCents: number;
  readonly cashAwards: ReadonlyArray<FreeSpinCashAward>;
  readonly beerRetriggered: boolean;
  readonly cigaretteRetriggered: boolean;
  readonly swordTriggered: boolean;
  readonly addedSpins: number;
  readonly complete: boolean;
}

export interface FreeSpinSummary {
  readonly kind: "free-spins";
  readonly mode: FreeSpinMode;
  readonly spinsPlayed: number;
  readonly payoutCents: number;
  readonly finalMultiplier: number;
}

export interface SwordFeatureState {
  readonly triggeringBetCents: number;
  readonly rows: number;
  readonly remainingSpins: number;
  readonly totalSpinsPlayed: number;
  readonly activeMultiplier: number;
  readonly accumulatedWinCents: number;
  readonly board: WaysGrid;
  readonly finalStrikeMultiplier: number | null;
  readonly finalPayoutCents: number | null;
}

export interface SwordExpansion {
  readonly position: Position;
  readonly destinationRows: number;
  readonly destinationMultiplier: number;
}

export interface SwordSpinResult {
  readonly state: SwordFeatureState;
  readonly spinBoard: WaysGrid;
  readonly winningPositions: Position[];
  readonly winningWins: SymbolWin[];
  readonly baseWinCents: number;
  readonly spinWinCents: number;
  readonly expansion: SwordExpansion | null;
  readonly complete: boolean;
  readonly finalStrikeMultiplier: number | null;
  readonly finalPayoutCents: number | null;
}

export interface SwordFeatureSummary {
  readonly kind: "sword";
  readonly spinsPlayed: number;
  readonly payoutCents: number;
  readonly reachedFinalStage: boolean;
  readonly finalStrikeMultiplier: number | null;
}

export type BonusSummary = FreeSpinSummary | SwordFeatureSummary;

export interface LargeWin {
  readonly payoutCents: number;
  readonly triggeringBetCents: number;
}

export interface AutoSpinViewState {
  readonly active: boolean;
  readonly stopping: boolean;
  readonly remainingSpins: number;
  readonly status: string;
}

export interface GameViewModel {
  readonly balanceCents: number;
  readonly betCents: number;
  readonly lastWinCents: number;
  readonly phase: GamePhase;
  readonly grid: Grid;
  readonly winningPositions: Position[];
  readonly winningWins: SymbolWin[];
  readonly cashAwards: ReadonlyArray<FreeSpinCashAward>;
  readonly freeSpins: FreeSpinState | null;
  readonly sword: SwordFeatureState | null;
  readonly bonusSummary: BonusSummary | null;
  readonly largeWin: LargeWin | null;
}
