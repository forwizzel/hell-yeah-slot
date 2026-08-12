import type {
  BonusActivation,
  BonusSymbolId,
  BonusTrigger,
  CashAwardSymbolId,
  FreeSpinCashAward,
  FreeSpinMode,
  FreeSpinResult,
  FreeSpinState,
  FreeSpinSummary,
  Grid,
  Position,
} from "../core/types";
import type { CashAwardPrize } from "../config/gameConfig";
import type { RandomSource } from "./RandomSource";
import { addCapped, multiplyCapped } from "./cappedInteger";
import { safeAdd, safeMultiply } from "./safeInteger";

export class BonusEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly beerFreeSpins: number,
    private readonly cigaretteFreeSpins: number,
    private readonly beerRetriggerSpins: number,
    private readonly cigaretteRetriggerSpins: number,
    private readonly beerFreeSpinMultiplier: number,
    private readonly maximumWinMultiplier: number,
    private readonly cigaretteCashAwards: ReadonlyArray<CashAwardPrize>,
    private readonly beerCashAwards: ReadonlyArray<CashAwardPrize>,
  ) {
    if (!Number.isSafeInteger(beerFreeSpins) || beerFreeSpins <= 0
      || !Number.isSafeInteger(cigaretteFreeSpins) || cigaretteFreeSpins <= 0) {
      throw new RangeError("Free-spin awards must be positive integers");
    }
    if (!Number.isSafeInteger(beerRetriggerSpins) || beerRetriggerSpins <= 0
      || !Number.isSafeInteger(cigaretteRetriggerSpins) || cigaretteRetriggerSpins <= 0) {
      throw new RangeError("Free-spin retrigger awards must be positive integers");
    }
    if (!Number.isSafeInteger(beerFreeSpinMultiplier) || beerFreeSpinMultiplier < 1
      || !Number.isSafeInteger(maximumWinMultiplier) || maximumWinMultiplier < 1) {
      throw new RangeError("Beer free-spin multiplier must be a positive integer");
    }
    validateCashAwards(cigaretteCashAwards, "Cigarette");
    validateCashAwards(beerCashAwards, "Beer");
  }

  resolveBaseTrigger(grid: Grid): BonusTrigger {
    const swordPositions = findDistinctColumnPositions(grid, "SWORD");
    if (swordPositions.length >= 3) {
      return { kind: "sword", positions: swordPositions };
    }

    const beerPositions = findDistinctColumnPositions(grid, "BEER");
    const cigarettePositions = findDistinctColumnPositions(grid, "CIGARETTE");
    const combined = (beerPositions.length === 3 && cigarettePositions.length === 2)
      || (beerPositions.length === 2 && cigarettePositions.length === 3);
    if (combined) {
      return {
        kind: "free-spins",
        mode: "combined",
        startingSpins: this.beerFreeSpins,
        beer: activation("BEER", beerPositions),
        cigarette: activation("CIGARETTE", cigarettePositions),
      };
    }

    if (beerPositions.length >= 3) {
      return {
        kind: "free-spins",
        mode: "beer",
        startingSpins: this.beerFreeSpins,
        beer: activation("BEER", beerPositions),
        cigarette: null,
      };
    }
    if (cigarettePositions.length >= 3) {
      return {
        kind: "free-spins",
        mode: "cigarette",
        startingSpins: this.cigaretteFreeSpins,
        beer: null,
        cigarette: activation("CIGARETTE", cigarettePositions),
      };
    }
    return { kind: "none" };
  }

  startFreeSpins(
    trigger: Extract<BonusTrigger, { kind: "free-spins" }>,
    triggeringBetCents: number,
    maximumWinCents = safeMultiply(
      triggeringBetCents,
      this.maximumWinMultiplier,
      "Maximum paid-round win exceeds the safe integer range",
    ),
  ): FreeSpinState {
    if (!Number.isSafeInteger(triggeringBetCents) || triggeringBetCents <= 0) {
      throw new RangeError("Triggering bet must be a positive integer number of cents");
    }
    if (!Number.isSafeInteger(maximumWinCents) || maximumWinCents < 0) {
      throw new RangeError("Maximum free-spin win must be a non-negative safe integer number of cents");
    }
    return {
      mode: trigger.mode,
      remainingSpins: trigger.startingSpins,
      totalSpinsPlayed: 0,
      multiplier: this.multiplierForMode(trigger.mode),
      triggeringBetCents,
      maximumWinCents,
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

    const remainingFeatureWinCents = state.maximumWinCents - state.accumulatedWinCents;
    const waysWinCents = multiplyCapped(baseWinCents, state.multiplier, remainingFeatureWinCents);
    const swordTriggered = findDistinctColumnPositions(grid, "SWORD").length >= 3;
    const beerRetriggered = !swordTriggered && findDistinctColumnPositions(grid, "BEER").length >= 3;
    const cigaretteRetriggered = !swordTriggered && findDistinctColumnPositions(grid, "CIGARETTE").length >= 3;
    const cashAwards = this.resolveCashAwards(state, grid, remainingFeatureWinCents - waysWinCents);
    const cashAwardWinCents = cashAwards.reduce(
      (total, award) => safeAdd(total, award.amountCents, "Free-spin cash award exceeds the safe integer range"),
      0,
    );
    const spinWinCents = addCapped(waysWinCents, cashAwardWinCents, remainingFeatureWinCents);
    const accumulatedWinCents = addCapped(state.accumulatedWinCents, spinWinCents, state.maximumWinCents);
    const addedSpins = beerRetriggered
      ? this.beerRetriggerSpins
      : cigaretteRetriggered ? this.cigaretteRetriggerSpins : 0;
    const remainingSpins = safeAdd(
      state.remainingSpins - 1,
      addedSpins,
      "Remaining free spins exceed the safe integer range",
    );
    const mode = nextMode(state.mode, beerRetriggered, cigaretteRetriggered);
    const multiplier = this.multiplierForMode(mode);
    const nextState: FreeSpinState = {
      mode,
      remainingSpins,
      totalSpinsPlayed: safeAdd(state.totalSpinsPlayed, 1, "Free-spin count exceeds the safe integer range"),
      multiplier,
      triggeringBetCents: state.triggeringBetCents,
      maximumWinCents: state.maximumWinCents,
      accumulatedWinCents,
    };

    return {
      state: nextState,
      spinWinCents,
      waysWinCents,
      cashAwardWinCents,
      cashAwards,
      beerRetriggered,
      cigaretteRetriggered,
      swordTriggered,
      addedSpins,
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

  private multiplierForMode(mode: FreeSpinMode): number {
    return mode === "cigarette" ? 1 : this.beerFreeSpinMultiplier;
  }

  private resolveCashAwards(state: FreeSpinState, grid: Grid, maximumAwardCents: number): FreeSpinCashAward[] {
    const symbols = cashAwardSymbols(state.mode);
    const multiplier = state.mode === "combined" ? this.beerFreeSpinMultiplier : 1;
    const awards: FreeSpinCashAward[] = [];
    let awardedCents = 0;
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
        const cell = grid[row]?.[column];
        if (cell?.kind !== "bonus" || (cell.symbol !== "BEER" && cell.symbol !== "CIGARETTE") || !symbols.has(cell.symbol)) {
          continue;
        }
        const prizes = cell.symbol === "CIGARETTE" ? this.cigaretteCashAwards : this.beerCashAwards;
        const multiplierTenths = pickCashAward(this.random, prizes);
        const baseAmountCents = cashAwardAmountCents(
          state.triggeringBetCents,
          multiplierTenths,
        );
        const amountCents = multiplyCapped(baseAmountCents, multiplier, maximumAwardCents - awardedCents);
        awardedCents = addCapped(awardedCents, amountCents, maximumAwardCents);
        awards.push({
          position: { row, column },
          symbol: cell.symbol,
          baseAmountCents,
          multiplier,
          amountCents,
        });
      }
    }
    return awards;
  }
}

function findDistinctColumnPositions(grid: Grid, symbol: BonusSymbolId): Position[] {
  const positions: Position[] = [];
  const occupiedColumns = new Set<number>();
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
      const cell = grid[row]?.[column];
      if (cell?.kind === "bonus" && cell.symbol === symbol && !occupiedColumns.has(column)) {
        occupiedColumns.add(column);
        positions.push({ row, column });
      }
    }
  }
  return positions;
}

function activation(symbol: "BEER" | "CIGARETTE", positions: Position[]): BonusActivation {
  return { symbol, symbolCount: positions.length, positions };
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
    state.maximumWinCents,
    state.accumulatedWinCents,
  ];
  if (values.some((value) => !Number.isSafeInteger(value))
    || state.remainingSpins < 0
    || state.totalSpinsPlayed < 0
    || state.multiplier < 1
    || state.triggeringBetCents <= 0
    || state.maximumWinCents < 0
    || state.accumulatedWinCents > state.maximumWinCents
    || state.accumulatedWinCents < 0) {
    throw new Error("Free-spin state is invalid");
  }
}

function cashAwardSymbols(mode: FreeSpinMode): ReadonlySet<CashAwardSymbolId> {
  if (mode === "cigarette") {
    return new Set(["CIGARETTE"]);
  }
  if (mode === "combined") {
    return new Set(["BEER", "CIGARETTE"]);
  }
  return new Set();
}

function validateCashAwards(prizes: ReadonlyArray<CashAwardPrize>, symbol: string): void {
  if (prizes.length === 0 || prizes.some((prize) => !Number.isSafeInteger(prize.multiplierTenths)
    || !Number.isSafeInteger(prize.weight)
    || prize.multiplierTenths <= 0
    || prize.weight <= 0)) {
    throw new RangeError(`${symbol} cash award table is invalid`);
  }
}

function pickCashAward(random: RandomSource, prizes: ReadonlyArray<CashAwardPrize>): number {
  const totalWeight = prizes.reduce(
    (total, prize) => safeAdd(total, prize.weight, "Cash award weight total exceeds the safe integer range"),
    0,
  );
  let selection = random.nextInt(totalWeight);
  for (const prize of prizes) {
    if (selection < prize.weight) {
      return prize.multiplierTenths;
    }
    selection -= prize.weight;
  }
  throw new Error("Cash award selection failed");
}

function cashAwardAmountCents(betCents: number, multiplierTenths: number): number {
  const amountTenths = safeMultiply(betCents, multiplierTenths, "Free-spin cash award exceeds the safe integer range");
  if (amountTenths % 10 !== 0) {
    throw new RangeError("Cash award cannot be represented as an integer number of cents");
  }
  return amountTenths / 10;
}
