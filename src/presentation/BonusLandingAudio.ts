import type { BonusSymbolId, Grid, Position } from "../core/types";
import type { GameSoundEffect } from "./GameAudio";

const SOUND_NAMES = {
  BEER: "beer",
  CIGARETTE: "cig",
  SWORD: "sword",
} as const;

export function createBonusLandingAudioPlan(
  grid: Grid,
  winSymbols: ReadonlyArray<BonusSymbolId>,
): ReadonlyArray<ReadonlyArray<GameSoundEffect>> {
  const counts: Record<BonusSymbolId, number> = { BEER: 0, CIGARETTE: 0, SWORD: 0 };
  const wins = new Set(winSymbols);
  const columnCount = grid[0]?.length ?? 0;

  return Array.from({ length: columnCount }, (_, column) => {
    const bonusCells = grid.flatMap((row) => {
      const cell = row[column];
      return cell?.kind === "bonus" ? [cell] : [];
    });
    if (bonusCells.length === 0) {
      return ["click"];
    }

    const cell = bonusCells[0];
    if (cell === undefined) {
      return [];
    }
    const count = counts[cell.symbol] + 1;
    counts[cell.symbol] = count;
    if (count > 3) {
      return [];
    }

    const soundName = SOUND_NAMES[cell.symbol];
    const effects: GameSoundEffect[] = [`symbol-${soundName}-${count as 1 | 2 | 3}`];
    if (count === 3 && wins.has(cell.symbol)) {
      effects.push(`win-${soundName}`);
    }
    return effects;
  });
}

export function swordColumnAudioEffect(column: number, expansionPosition: Position | null): GameSoundEffect {
  return expansionPosition?.column === column ? "symbol-sword-1" : "click";
}
