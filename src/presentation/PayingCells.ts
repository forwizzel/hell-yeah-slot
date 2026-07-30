import type { FreeSpinCashAward, Position, SymbolWin } from "../core/types";

export interface PayingCellGroup {
  readonly keys: ReadonlySet<string>;
}

export function createPayingCellGroups(
  winningWins: ReadonlyArray<SymbolWin>,
  cashAwards: ReadonlyArray<FreeSpinCashAward> = [],
): ReadonlyArray<PayingCellGroup> {
  const cashAwardKeys = new Set(cashAwards.map((award) => positionKey(award.position)));
  return [
    ...(cashAwardKeys.size > 0 ? [{ keys: cashAwardKeys }] : []),
    ...winningWins.map((win) => ({ keys: new Set(win.positions.map(positionKey)) })),
  ].filter((group) => group.keys.size > 0);
}

export function allPayingPositionKeys(groups: ReadonlyArray<PayingCellGroup>): ReadonlySet<string> {
  return new Set(groups.flatMap((group) => [...group.keys]));
}

export function activePayingCellGroupIndex(
  groupCount: number,
  elapsedMs: number,
  groupDurationMs: number,
): number {
  if (!Number.isInteger(groupCount) || groupCount <= 0 || !Number.isFinite(elapsedMs) || groupDurationMs <= 0) {
    throw new RangeError("Paying-cell focus requires a positive group count and duration");
  }
  return Math.floor(Math.max(elapsedMs, 0) / groupDurationMs) % groupCount;
}

export function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}
