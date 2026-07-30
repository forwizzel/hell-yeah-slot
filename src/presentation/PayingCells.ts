import type { FreeSpinCashAward, Position } from "../core/types";

export function payingPositionKeys(
  winningPositions: ReadonlyArray<Position>,
  cashAwards: ReadonlyArray<FreeSpinCashAward> = [],
): ReadonlySet<string> {
  const keys = new Set(winningPositions.map(positionKey));
  for (const award of cashAwards) {
    keys.add(positionKey(award.position));
  }
  return keys;
}

export function positionKey(position: Position): string {
  return `${position.row}:${position.column}`;
}
