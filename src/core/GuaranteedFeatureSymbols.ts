import type { FeatureBuyId } from "../config/gameConfig";
import type { RandomSource } from "../math/RandomSource";
import type { BonusSymbolId } from "./types";

export function createGuaranteedFeatureSymbols(
  feature: FeatureBuyId,
  random: RandomSource,
): ReadonlyArray<BonusSymbolId> {
  switch (feature) {
    case "beer":
      return ["BEER", "BEER", "BEER"];
    case "cigarette":
      return ["CIGARETTE", "CIGARETTE", "CIGARETTE"];
    case "sword":
      return ["SWORD", "SWORD", "SWORD"];
    case "combined":
      return random.nextInt(2) === 0
        ? ["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]
        : ["BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE"];
  }
}
