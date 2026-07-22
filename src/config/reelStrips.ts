import type { RegularSymbolId } from "../core/types";

export type ReelSymbol = RegularSymbolId | "BONUS";

export const REEL_STRIPS: ReadonlyArray<ReadonlyArray<ReelSymbol>> = [
  ["A", "B", "C", "A", "D", "B", "A", "C", "BONUS", "B", "D", "A", "C", "B", "A", "D", "C", "B", "A", "BONUS", "D", "C", "A", "B"],
  ["B", "A", "D", "C", "B", "A", "C", "B", "D", "BONUS", "A", "C", "B", "D", "A", "B", "C", "A", "D", "B", "BONUS", "C", "A", "B"],
  ["C", "B", "A", "D", "C", "B", "BONUS", "A", "D", "C", "B", "A", "C", "D", "B", "A", "C", "B", "D", "A", "C", "BONUS", "B", "A"],
  ["D", "C", "B", "A", "D", "BONUS", "C", "B", "A", "D", "C", "B", "A", "C", "D", "B", "A", "BONUS", "C", "D", "B", "A", "C", "B"],
  ["A", "D", "C", "B", "A", "D", "C", "BONUS", "B", "A", "D", "C", "B", "A", "C", "D", "B", "A", "C", "D", "BONUS", "B", "A", "C"],
] as const;
