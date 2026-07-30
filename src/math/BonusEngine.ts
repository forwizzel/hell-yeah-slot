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
import type { RandomSource } from "./RandomSource";
import { safeAdd, safeMultiply } from "./safeInteger";

export interface CashAwardRange {
  readonly minimumTenths: number;
  readonly maximumTenths: number;
}

export class BonusEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly beerFreeSpins: number,
    private readonly cigaretteFreeSpins: number,
    private readonly beerFreeSpinMultiplier: number,
    private readonly cigaretteCashAwardRange: CashAwardRange,
    private readonly beerCashAwardRange: CashAwardRange,
  ) {
    if (!Number.isSafeInteger(beerFreeSpins) || beerFreeSpins <= 0
      || !Number.isSafeInteger(cigaretteFreeSpins) || cigaretteFreeSpins <= 0) {
      throw new RangeError("Free-spin awards must be positive integers");
    }
    if (!Number.isSafeInteger(beerFreeSpinMultiplier) || beerFreeSpinMultiplier < 1) {
      throw new RangeError("Beer free-spin multiplier must be a positive integer");
    }
    validateCashAwardRange(cigaretteCashAwardRange, "Cigarette");
    validateCashAwardRange(beerCashAwardRange, "Beer");
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

  startFreeSpins(trigger: Extract<BonusTrigger, { kind: "free-spins" }>, triggeringBetCents: number): FreeSpinState {
    if (!Number.isSafeInteger(triggeringBetCents) || triggeringBetCents <= 0) {
      throw new RangeError("Triggering bet must be a positive integer number of cents");
    }
    return {
      mode: trigger.mode,
      remainingSpins: trigger.startingSpins,
      totalSpinsPlayed: 0,
      multiplier: this.multiplierForMode(trigger.mode),
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

    const waysWinCents = safeMultiply(baseWinCents, state.multiplier, "Free-spin ways payout exceeds the safe integer range");
    const swordTriggered = findDistinctColumnPositions(grid, "SWORD").length >= 3;
    const beerRetriggered = !swordTriggered && findDistinctColumnPositions(grid, "BEER").length >= 3;
    const cigaretteRetriggered = !swordTriggered && findDistinctColumnPositions(grid, "CIGARETTE").length >= 3;
    const cashAwards = this.resolveCashAwards(state, grid);
    const cashAwardWinCents = cashAwards.reduce(
      (total, award) => safeAdd(total, award.amountCents, "Free-spin cash award exceeds the safe integer range"),
      0,
    );
    const spinWinCents = safeAdd(waysWinCents, cashAwardWinCents, "Free-spin payout exceeds the safe integer range");
    const accumulatedWinCents = safeAdd(
      state.accumulatedWinCents,
      spinWinCents,
      "Accumulated free-spin win exceeds the safe integer range",
    );
    const addedSpins = beerRetriggered || cigaretteRetriggered ? this.beerFreeSpins : 0;
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

  private resolveCashAwards(state: FreeSpinState, grid: Grid): FreeSpinCashAward[] {
    const symbols = cashAwardSymbols(state.mode);
    const multiplier = state.mode === "combined" ? this.beerFreeSpinMultiplier : 1;
    const awards: FreeSpinCashAward[] = [];
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
        const cell = grid[row]?.[column];
        if (cell?.kind !== "bonus" || (cell.symbol !== "BEER" && cell.symbol !== "CIGARETTE") || !symbols.has(cell.symbol)) {
          continue;
        }
        const range = cell.symbol === "CIGARETTE" ? this.cigaretteCashAwardRange : this.beerCashAwardRange;
        const baseAmountCents = cashAwardAmountCents(
          state.triggeringBetCents,
          range.minimumTenths + this.random.nextInt(cashAwardChoices(range)) * 5,
        );
        awards.push({
          position: { row, column },
          symbol: cell.symbol,
          baseAmountCents,
          multiplier,
          amountCents: safeMultiply(baseAmountCents, multiplier, "Free-spin cash award exceeds the safe integer range"),
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

function cashAwardSymbols(mode: FreeSpinMode): ReadonlySet<CashAwardSymbolId> {
  if (mode === "cigarette") {
    return new Set(["CIGARETTE"]);
  }
  if (mode === "combined") {
    return new Set(["BEER", "CIGARETTE"]);
  }
  return new Set();
}

function validateCashAwardRange(range: CashAwardRange, symbol: string): void {
  if (!Number.isSafeInteger(range.minimumTenths)
    || !Number.isSafeInteger(range.maximumTenths)
    || range.minimumTenths < 5
    || range.minimumTenths % 5 !== 0
    || range.maximumTenths < range.minimumTenths
    || range.maximumTenths % 5 !== 0) {
    throw new RangeError(`${symbol} cash award range is invalid`);
  }
}

function cashAwardChoices(range: CashAwardRange): number {
  return ((range.maximumTenths - range.minimumTenths) / 5) + 1;
}

function cashAwardAmountCents(betCents: number, multiplierTenths: number): number {
  const amountTenths = safeMultiply(betCents, multiplierTenths, "Free-spin cash award exceeds the safe integer range");
  if (amountTenths % 10 !== 0) {
    throw new RangeError("Cash award cannot be represented as an integer number of cents");
  }
  return amountTenths / 10;
}
