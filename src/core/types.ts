export type GamePhase =
  | "idle"
  | "base-spinning"
  | "base-evaluation"
  | "bonus-intro"
  | "bonus-respin"
  | "bonus-evaluation"
  | "bonus-complete";

export type RegularSymbolId = "A" | "B" | "C" | "D";

export interface RegularCell {
  readonly kind: "regular";
  readonly symbol: RegularSymbolId;
}

export interface BonusCell {
  readonly kind: "bonus";
  readonly value: number;
}

export type Cell = RegularCell | BonusCell;
export type Grid = Cell[][];

export interface Position {
  readonly row: number;
  readonly column: number;
}

export interface SymbolWin {
  readonly symbol: RegularSymbolId;
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

export interface SpinResult {
  readonly grid: Grid;
  readonly regularWin: number;
  readonly bonusTriggered: boolean;
  readonly triggerPositions: Position[];
  readonly winningPositions: Position[];
}

export interface BonusState {
  readonly cells: Array<BonusCell | null>;
  readonly remainingRespins: number;
  readonly totalRespinsPlayed: number;
  readonly triggeringBet: number;
}

export interface BonusRespinResult {
  readonly state: BonusState;
  readonly newPositions: Position[];
  readonly complete: boolean;
  readonly filled: boolean;
}

export interface BonusSummary {
  readonly symbolCount: number;
  readonly valueTotal: number;
  readonly payout: number;
  readonly respinsPlayed: number;
  readonly filled: boolean;
}

export interface GameViewModel {
  readonly credits: number;
  readonly bet: number;
  readonly lastWin: number;
  readonly phase: GamePhase;
  readonly grid: Grid;
  readonly winningPositions: Position[];
  readonly bonus: BonusState | null;
  readonly bonusSummary: BonusSummary | null;
}
