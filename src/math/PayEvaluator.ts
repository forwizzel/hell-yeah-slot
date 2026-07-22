import type { MatchLength, Paytable } from "../config/paytable";
import type { Grid, PayEvaluation, Position, RegularSymbolId, SymbolWin } from "../core/types";

const REGULAR_SYMBOLS: readonly RegularSymbolId[] = ["A", "B", "C", "D"];

export function evaluateWays(grid: Grid, paytable: Paytable, bet: number): PayEvaluation {
  validateGrid(grid);
  if (!Number.isSafeInteger(bet) || bet <= 0) {
    throw new RangeError("Bet must be a positive integer");
  }

  const wins: SymbolWin[] = [];
  const allWinningPositions = new Map<string, Position>();

  for (const symbol of REGULAR_SYMBOLS) {
    const columnPositions: Position[][] = [];

    for (let column = 0; column < grid[0]!.length; column += 1) {
      const positions: Position[] = [];
      for (let row = 0; row < grid.length; row += 1) {
        const cell = grid[row]?.[column];
        if (cell?.kind === "regular" && cell.symbol === symbol) {
          positions.push({ row, column });
        }
      }
      if (positions.length === 0) {
        break;
      }
      columnPositions.push(positions);
    }

    if (columnPositions.length < 3) {
      continue;
    }

    const columns = Math.min(columnPositions.length, 5) as MatchLength;
    const qualifyingColumns = columnPositions.slice(0, columns);
    const ways = qualifyingColumns.reduce((total, positions) => total * positions.length, 1);
    const multiplier = paytable[symbol][columns];
    const positions = qualifyingColumns.flat();
    for (const position of positions) {
      allWinningPositions.set(`${position.row}:${position.column}`, position);
    }
    wins.push({ symbol, columns, ways, multiplier, amount: ways * multiplier * bet, positions });
  }

  return {
    totalWin: wins.reduce((total, win) => total + win.amount, 0),
    wins,
    winningPositions: [...allWinningPositions.values()],
  };
}

function validateGrid(grid: Grid): void {
  if (grid.length === 0 || grid[0]?.length === 0) {
    throw new Error("Grid must contain at least one cell");
  }
  const columns = grid[0]!.length;
  if (grid.some((row) => row.length !== columns)) {
    throw new Error("Grid rows must have equal lengths");
  }
}
