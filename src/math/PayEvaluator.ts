import {
  CARD_SYMBOLS,
  PAYOUT_MULTIPLIER_SCALE,
  type MatchLength,
  type Paytable,
} from "../config/paytable";
import type { CardSymbolId, PayEvaluation, Position, SymbolWin, WaysGrid } from "../core/types";
import { safeAdd, safeMultiply } from "./safeInteger";

export function evaluateWays(grid: WaysGrid, paytable: Paytable, betCents: number): PayEvaluation {
  validateGrid(grid);
  if (!Number.isSafeInteger(betCents) || betCents <= 0) {
    throw new RangeError("Bet must be a positive integer number of cents");
  }
  if (betCents % PAYOUT_MULTIPLIER_SCALE !== 0) {
    throw new RangeError(`Bet must be divisible by ${PAYOUT_MULTIPLIER_SCALE} cents`);
  }

  const wins: SymbolWin[] = [];
  const allWinningPositions = new Map<string, Position>();

  for (const symbol of CARD_SYMBOLS) {
    const columnPositions = collectConsecutivePositions(
      grid,
      (cell) => cell.kind === "wild" || (cell.kind === "card" && cell.symbol === symbol),
    );
    if (columnPositions.length < 3) {
      continue;
    }

    const qualifyingColumns = columnPositions.slice(0, 5);
    const hasNaturalSymbol = qualifyingColumns.flat().some(({ row, column }) => {
      const cell = grid[row]?.[column];
      return cell?.kind === "card" && cell.symbol === symbol;
    });
    if (!hasNaturalSymbol) {
      continue;
    }

    const win = createWin(symbol, qualifyingColumns, paytable, betCents);
    if (win.amountCents > 0) {
      wins.push(win);
    }
  }

  // A result established only by WILD cells is awarded once as the highest card.
  if (wins.length === 0) {
    const wildColumns = collectConsecutivePositions(grid, (cell) => cell.kind === "wild").slice(0, 5);
    if (wildColumns.length >= 3) {
      const win = createWin("A", wildColumns, paytable, betCents);
      if (win.amountCents > 0) {
        wins.push(win);
      }
    }
  }

  for (const win of wins) {
    for (const position of win.positions) {
      allWinningPositions.set(`${position.row}:${position.column}`, position);
    }
  }

  return {
    totalWinCents: wins.reduce(
      (total, win) => safeAdd(total, win.amountCents, "Total ways win exceeds the safe integer range"),
      0,
    ),
    wins,
    winningPositions: [...allWinningPositions.values()],
  };
}

function collectConsecutivePositions(
  grid: WaysGrid,
  matches: (cell: WaysGrid[number][number]) => boolean,
): Position[][] {
  const columns: Position[][] = [];
  for (let column = 0; column < grid[0]!.length; column += 1) {
    const positions: Position[] = [];
    for (let row = 0; row < grid.length; row += 1) {
      const cell = grid[row]?.[column];
      if (cell !== undefined && matches(cell)) {
        positions.push({ row, column });
      }
    }
    if (positions.length === 0) {
      break;
    }
    columns.push(positions);
  }
  return columns;
}

function createWin(
  symbol: CardSymbolId,
  columnPositions: Position[][],
  paytable: Paytable,
  betCents: number,
): SymbolWin {
  const columns = columnPositions.length as MatchLength;
  const ways = columnPositions.reduce((total, positions) => total * positions.length, 1);
  const multiplierTenths = paytable[symbol][columns];
  if (!Number.isSafeInteger(multiplierTenths) || multiplierTenths < 0) {
    throw new RangeError("Paytable multipliers must be non-negative integer tenths");
  }
  const waysAwardTenths = safeMultiply(
    ways,
    multiplierTenths,
    "Ways award exceeds the safe integer range",
  );
  return {
    symbol,
    columns,
    ways,
    multiplierTenths,
    amountCents: safeMultiply(
      waysAwardTenths,
      betCents / PAYOUT_MULTIPLIER_SCALE,
      "Ways payout exceeds the safe integer range",
    ),
    positions: columnPositions.flat(),
  };
}

function validateGrid(grid: WaysGrid): void {
  if (grid.length === 0 || grid[0]?.length === 0) {
    throw new Error("Grid must contain at least one cell");
  }
  const columns = grid[0]!.length;
  if (columns > 5 || grid.some((row) => row.length !== columns)) {
    throw new Error("Grid must contain equal rows of no more than five columns");
  }
}
