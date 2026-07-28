import type {
  BonusActivation,
  BonusSymbolId,
  BonusTrigger,
  FreeSpinMode,
  FreeSpinResult,
  FreeSpinState,
  FreeSpinSummary,
  Grid,
  Position,
} from "../core/types";
import type { RandomSource } from "./RandomSource";
import { safeAdd, safeMultiply } from "./safeInteger";

export interface TriggerChances {
  readonly BEER: Readonly<Record<1 | 2, number>>;
  readonly CIGARETTE: Readonly<Record<1 | 2, number>>;
}

export interface MultiplierWeight {
  readonly multiplier: number;
  readonly weight: number;
}

export class BonusEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly triggerChances: TriggerChances,
    private readonly beerFreeSpins: number,
    private readonly cigaretteFreeSpins: number,
    private readonly freeSpinBaseMultiplier: number,
    private readonly multiplierWeights: ReadonlyArray<MultiplierWeight>,
  ) {
    const configuredChances = [
      triggerChances.BEER[1],
      triggerChances.BEER[2],
      triggerChances.CIGARETTE[1],
      triggerChances.CIGARETTE[2],
    ];
    for (const chance of configuredChances) {
      if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
        throw new RangeError("Trigger chances must be between 0 and 1");
      }
    }
    if (!Number.isSafeInteger(beerFreeSpins) || beerFreeSpins <= 0
      || !Number.isSafeInteger(cigaretteFreeSpins) || cigaretteFreeSpins <= 0) {
      throw new RangeError("Free-spin awards must be positive integers");
    }
    if (!Number.isSafeInteger(freeSpinBaseMultiplier) || freeSpinBaseMultiplier < 1) {
      throw new RangeError("Free-spin base multiplier must be a positive integer");
    }
    validateMultiplierWeights(multiplierWeights);
  }

  resolveBaseTrigger(grid: Grid): BonusTrigger {
    const swordPositions = findPositions(grid, "SWORD");
    if (swordPositions.length >= 3) {
      return { kind: "sword", positions: swordPositions };
    }

    const beer = this.resolveActivation(grid, "BEER");
    const cigarette = this.resolveActivation(grid, "CIGARETTE");
    if (beer === null && cigarette === null) {
      return { kind: "none" };
    }

    const mode = featureMode(beer !== null, cigarette !== null);
    return {
      kind: "free-spins",
      mode,
      startingSpins: beer === null ? this.cigaretteFreeSpins : this.beerFreeSpins,
      multiplier: cigarette === null ? 1 : this.pickMultiplier(),
      beer,
      cigarette,
    };
  }

  startFreeSpins(trigger: Extract<BonusTrigger, { kind: "free-spins" }>, triggeringBetCents: number): FreeSpinState {
    if (!Number.isSafeInteger(triggeringBetCents) || triggeringBetCents <= 0) {
      throw new RangeError("Triggering bet must be a positive integer number of cents");
    }
    const multiplier = safeMultiply(
      this.freeSpinBaseMultiplier,
      trigger.multiplier,
      "Initial free-spin multiplier exceeds the safe integer range",
    );
    return {
      mode: trigger.mode,
      remainingSpins: trigger.startingSpins,
      totalSpinsPlayed: 0,
      multiplier,
      triggeringBetCents,
      accumulatedWinCents: 0,
    };
  }

  applyFreeSpin(state: FreeSpinState, grid: Grid, baseWinCents: number): FreeSpinResult {
    validateFreeSpinState(state);
    if (state.remainingSpins <= 0) {
      throw new Error("Cannot play a completed free-spin feature");
    }
    if (!Number.isSafeInteger(baseWinCents) || baseWinCents < 0) {
      throw new RangeError("Base win must be a non-negative integer number of cents");
    }

    const spinWinCents = safeMultiply(baseWinCents, state.multiplier, "Free-spin payout exceeds the safe integer range");
    const accumulatedWinCents = safeAdd(
      state.accumulatedWinCents,
      spinWinCents,
      "Accumulated free-spin win exceeds the safe integer range",
    );
    const swordTriggered = findPositions(grid, "SWORD").length >= 3;
    const beerRetriggered = !swordTriggered && findPositions(grid, "BEER").length >= 3;
    const cigaretteRetriggered = !swordTriggered && findPositions(grid, "CIGARETTE").length >= 3;
    const addedSpins = beerRetriggered ? this.beerFreeSpins : 0;
    const awardedMultiplier = cigaretteRetriggered ? this.pickMultiplier() : null;
    const multiplier = awardedMultiplier === null
      ? state.multiplier
      : safeMultiply(state.multiplier, awardedMultiplier, "Free-spin multiplier exceeds the safe integer range");
    const remainingSpins = safeAdd(
      state.remainingSpins - 1,
      addedSpins,
      "Remaining free spins exceed the safe integer range",
    );
    const mode = nextMode(state.mode, beerRetriggered, cigaretteRetriggered);
    const nextState: FreeSpinState = {
      mode,
      remainingSpins,
      totalSpinsPlayed: safeAdd(state.totalSpinsPlayed, 1, "Free-spin count exceeds the safe integer range"),
      multiplier,
      triggeringBetCents: state.triggeringBetCents,
      accumulatedWinCents,
    };

    return {
      state: nextState,
      spinWinCents,
      beerRetriggered,
      cigaretteRetriggered,
      swordTriggered,
      addedSpins,
      awardedMultiplier,
      complete: remainingSpins === 0,
    };
  }

  summarize(state: FreeSpinState): FreeSpinSummary {
    validateFreeSpinState(state);
    if (state.remainingSpins !== 0) {
      throw new Error("Cannot summarize an active free-spin feature");
    }
    return {
      kind: "free-spins",
      mode: state.mode,
      spinsPlayed: state.totalSpinsPlayed,
      payoutCents: state.accumulatedWinCents,
      finalMultiplier: state.multiplier,
    };
  }

  private resolveActivation(grid: Grid, symbol: "BEER" | "CIGARETTE"): BonusActivation | null {
    const positions = findPositions(grid, symbol);
    if (positions.length >= 3) {
      return { symbol, source: "natural", symbolCount: positions.length, positions };
    }
    if (positions.length === 0) {
      return null;
    }
    const count = positions.length as 1 | 2;
    return this.random.nextFloat() < this.triggerChances[symbol][count]
      ? { symbol, source: "chance", symbolCount: count, positions }
      : null;
  }

  private pickMultiplier(): number {
    const totalWeight = multiplierWeightsTotal(this.multiplierWeights);
    let selection = this.random.nextInt(totalWeight);
    for (const entry of this.multiplierWeights) {
      if (selection < entry.weight) {
        return entry.multiplier;
      }
      selection -= entry.weight;
    }
    throw new Error("Cigarette multiplier weight selection failed");
  }
}

function findPositions(grid: Grid, symbol: BonusSymbolId): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
      const cell = grid[row]?.[column];
      if (cell?.kind === "bonus" && cell.symbol === symbol) {
        positions.push({ row, column });
      }
    }
  }
  return positions;
}

function featureMode(beer: boolean, cigarette: boolean): FreeSpinMode {
  if (beer && cigarette) {
    return "combined";
  }
  return beer ? "beer" : "cigarette";
}

function nextMode(mode: FreeSpinMode, beer: boolean, cigarette: boolean): FreeSpinMode {
  if (mode === "combined" || (mode === "beer" && cigarette) || (mode === "cigarette" && beer)) {
    return "combined";
  }
  return mode;
}

function validateFreeSpinState(state: FreeSpinState): void {
  const values = [
    state.remainingSpins,
    state.totalSpinsPlayed,
    state.multiplier,
    state.triggeringBetCents,
    state.accumulatedWinCents,
  ];
  if (values.some((value) => !Number.isSafeInteger(value))
    || state.remainingSpins < 0
    || state.totalSpinsPlayed < 0
    || state.multiplier < 1
    || state.triggeringBetCents <= 0
    || state.accumulatedWinCents < 0) {
    throw new Error("Free-spin state is invalid");
  }
}

function validateMultiplierWeights(weights: ReadonlyArray<MultiplierWeight>): void {
  if (weights.length !== 9) {
    throw new RangeError("Cigarette multiplier weights must include x2 through x10");
  }
  const multipliers = new Set<number>();
  for (const entry of weights) {
    if (!Number.isSafeInteger(entry.multiplier) || entry.multiplier < 2 || entry.multiplier > 10
      || multipliers.has(entry.multiplier)
      || !Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
      throw new RangeError("Cigarette multiplier weights are invalid");
    }
    multipliers.add(entry.multiplier);
  }
  for (let multiplier = 2; multiplier <= 10; multiplier += 1) {
    if (!multipliers.has(multiplier)) {
      throw new RangeError("Cigarette multiplier weights must include x2 through x10");
    }
  }
  multiplierWeightsTotal(weights);
}

function multiplierWeightsTotal(weights: ReadonlyArray<MultiplierWeight>): number {
  return weights.reduce(
    (total, entry) => safeAdd(total, entry.weight, "Cigarette multiplier weight total exceeds the safe integer range"),
    0,
  );
}
