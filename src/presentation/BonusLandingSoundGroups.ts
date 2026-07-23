import type { BonusSymbolId, Grid, Position } from "../core/types";

const SOUND_GROUP_ORDER: readonly BonusSymbolId[] = ["BEER", "CIGARETTE", "SWORD"];

export function bonusLandingSoundGroups(grid: Grid): ReadonlyArray<ReadonlyArray<Position>> {
  const positionsBySymbol = new Map<BonusSymbolId, Position[]>(
    SOUND_GROUP_ORDER.map((symbol) => [symbol, []]),
  );

  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
      const cell = grid[row]?.[column];
      if (cell?.kind !== "bonus") {
        continue;
      }
      positionsBySymbol.get(cell.symbol)?.push({ row, column });
    }
  }

  const swordPositions = positionsBySymbol.get("SWORD");
  if (swordPositions === undefined) {
    throw new Error("SWORD sound group was not initialized");
  }
  if (swordPositions.length >= 3) {
    return [swordPositions];
  }

  return SOUND_GROUP_ORDER
    .map((symbol) => positionsBySymbol.get(symbol))
    .filter((positions): positions is Position[] => positions !== undefined && positions.length > 0);
}
