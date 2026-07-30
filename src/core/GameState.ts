import { GAME_CONFIG } from "../config/gameConfig";
import type {
  BonusSummary,
  FreeSpinCashAward,
  FreeSpinState,
  GamePhase,
  GameViewModel,
  Grid,
  LargeWin,
  Position,
  SwordFeatureState,
} from "./types";

export class GameState {
  balanceCents: number = GAME_CONFIG.startingBalanceCents;
  betCents: number = GAME_CONFIG.defaultBetCents;
  lastWinCents: number = 0;
  phase: GamePhase = "idle";
  grid: Grid = createInitialGrid();
  winningPositions: Position[] = [];
  cashAwards: FreeSpinCashAward[] = [];
  freeSpins: FreeSpinState | null = null;
  sword: SwordFeatureState | null = null;
  bonusSummary: BonusSummary | null = null;
  largeWin: LargeWin | null = null;

  reset(): void {
    this.balanceCents = GAME_CONFIG.startingBalanceCents;
    this.betCents = GAME_CONFIG.defaultBetCents;
    this.lastWinCents = 0;
    this.phase = "idle";
    this.grid = createInitialGrid();
    this.winningPositions = [];
    this.cashAwards = [];
    this.freeSpins = null;
    this.sword = null;
    this.bonusSummary = null;
    this.largeWin = null;
  }

  toViewModel(): GameViewModel {
    return {
      balanceCents: this.balanceCents,
      betCents: this.betCents,
      lastWinCents: this.lastWinCents,
      phase: this.phase,
      grid: this.grid.map((row) => row.map((cell) => ({ ...cell }))),
      winningPositions: this.winningPositions.map((position) => ({ ...position })),
      cashAwards: this.cashAwards.map((award) => ({ ...award, position: { ...award.position } })),
      freeSpins: this.freeSpins === null ? null : { ...this.freeSpins },
      sword: this.sword === null ? null : {
        ...this.sword,
        board: this.sword.board.map((row) => row.map((cell) => ({ ...cell }))),
      },
      bonusSummary: this.bonusSummary === null ? null : { ...this.bonusSummary },
      largeWin: this.largeWin === null ? null : { ...this.largeWin },
    };
  }
}

function createInitialGrid(): Grid {
  const symbols = ["10", "J", "Q", "K", "A", "GUN", "KNIGHT"] as const;
  return Array.from({ length: GAME_CONFIG.rows }, (_, row) =>
    Array.from({ length: GAME_CONFIG.columns }, (_, column) => ({
      kind: "card" as const,
      symbol: symbols[(row + column) % symbols.length]!,
    })),
  );
}
