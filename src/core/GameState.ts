import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusSummary, FreeSpinState, GamePhase, GameViewModel, Grid, Position } from "./types";

export class GameState {
  credits: number = GAME_CONFIG.startingCredits;
  bet: number = GAME_CONFIG.defaultBet;
  lastWin: number = 0;
  phase: GamePhase = "idle";
  grid: Grid = createInitialGrid();
  winningPositions: Position[] = [];
  freeSpins: FreeSpinState | null = null;
  bonusSummary: BonusSummary | null = null;

  reset(): void {
    this.credits = GAME_CONFIG.startingCredits;
    this.bet = GAME_CONFIG.defaultBet;
    this.lastWin = 0;
    this.phase = "idle";
    this.grid = createInitialGrid();
    this.winningPositions = [];
    this.freeSpins = null;
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
      freeSpins: this.freeSpins === null ? null : { ...this.freeSpins },
      bonusSummary: this.bonusSummary === null ? null : { ...this.bonusSummary },
    };
  }
}

function createInitialGrid(): Grid {
  const symbols = ["10", "J", "Q", "K", "A"] as const;
  return Array.from({ length: GAME_CONFIG.rows }, (_, row) =>
    Array.from({ length: GAME_CONFIG.columns }, (_, column) => ({
      kind: "card" as const,
      symbol: symbols[(row + column) % symbols.length]!,
    })),
  );
}
