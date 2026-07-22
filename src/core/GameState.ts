import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusState, BonusSummary, GamePhase, GameViewModel, Grid, Position } from "./types";

export class GameState {
  credits: number = GAME_CONFIG.startingCredits;
  bet: number = GAME_CONFIG.defaultBet;
  lastWin: number = 0;
  phase: GamePhase = "idle";
  grid: Grid = createInitialGrid();
  winningPositions: Position[] = [];
  bonus: BonusState | null = null;
  bonusSummary: BonusSummary | null = null;

  reset(): void {
    this.credits = GAME_CONFIG.startingCredits;
    this.bet = GAME_CONFIG.defaultBet;
    this.lastWin = 0;
    this.phase = "idle";
    this.grid = createInitialGrid();
    this.winningPositions = [];
    this.bonus = null;
    this.bonusSummary = null;
  }

  toViewModel(): GameViewModel {
    return {
      credits: this.credits,
      bet: this.bet,
      lastWin: this.lastWin,
      phase: this.phase,
      grid: this.grid.map((row) => row.map((cell) => ({ ...cell }))),
      winningPositions: this.winningPositions.map((position) => ({ ...position })),
      bonus: this.bonus === null
        ? null
        : { ...this.bonus, cells: this.bonus.cells.map((cell) => cell === null ? null : { ...cell }) },
      bonusSummary: this.bonusSummary === null ? null : { ...this.bonusSummary },
    };
  }
}

function createInitialGrid(): Grid {
  const symbols = ["A", "B", "C", "D"] as const;
  return Array.from({ length: GAME_CONFIG.rows }, (_, row) =>
    Array.from({ length: GAME_CONFIG.columns }, (_, column) => ({
      kind: "regular" as const,
      symbol: symbols[(row + column) % symbols.length]!,
    })),
  );
}
