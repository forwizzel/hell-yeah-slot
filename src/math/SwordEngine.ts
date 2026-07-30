import { PAYOUT_MULTIPLIER_SCALE, SWORD_PAYTABLE } from "../config/paytable";
import {
  SWORD_CONFIG,
  type SwordBoardSymbol,
  type SwordConfig,
  type SwordExpansionRows,
  type SwordMultiplierBand,
  type SwordStageRows,
} from "../config/swordConfig";
import type {
  SwordExpansion,
  SwordFeatureState,
  SwordFeatureSummary,
  SwordSpinResult,
  SymbolWin,
  WaysCell,
  WaysGrid,
} from "../core/types";
import { evaluateWays } from "./PayEvaluator";
import type { RandomSource } from "./RandomSource";
import { safeAdd, safeMultiply } from "./safeInteger";

export class SwordEngine {
  constructor(
    private readonly random: RandomSource,
    private readonly config: SwordConfig = SWORD_CONFIG,
  ) {
    validateConfig(config);
  }

  start(triggeringBetCents: number): SwordFeatureState {
    if (!Number.isSafeInteger(triggeringBetCents) || triggeringBetCents <= 0) {
      throw new RangeError("Triggering bet must be a positive integer number of cents");
    }
    if (triggeringBetCents % PAYOUT_MULTIPLIER_SCALE !== 0) {
      throw new RangeError(`Triggering bet must be divisible by ${PAYOUT_MULTIPLIER_SCALE} cents`);
    }

    return {
      triggeringBetCents,
      rows: this.config.startingRows,
      remainingSpins: this.config.startingSpins,
      totalSpinsPlayed: 0,
      activeMultiplier: this.config.initialMultiplier,
      accumulatedWinCents: 0,
      board: [],
      finalStrikeMultiplier: null,
      finalPayoutCents: null,
    };
  }

  playSpin(state: SwordFeatureState): SwordSpinResult {
    validateState(state, this.config);
    if (state.remainingSpins === 0) {
      throw new Error("Cannot play a completed Sword feature");
    }

    // An in-play expansion always has priority. A second same-chance roll can place a cosmetic
    // SWORD in a locked row only after that expansion chance has failed.
    const expansionChance = state.rows < this.config.maximumRows
      ? this.config.expansionChances[state.rows as SwordExpansionRows]
      : null;
    const expands = expansionChance !== null && this.random.nextFloat() < expansionChance;
    const lockedRows = this.config.maximumRows - state.rows;
    const expansionTarget = expands
      ? this.toBoardIndex(this.random.nextInt(state.rows * this.config.columns), lockedRows)
      : null;
    const cosmeticSwordTarget = !expands
      && expansionChance !== null
      && this.random.nextFloat() < expansionChance
      ? this.random.nextInt(lockedRows * this.config.columns)
      : null;
    const swordTarget = expansionTarget ?? cosmeticSwordTarget;
    const board = this.drawBoard(swordTarget);
    const evaluation = evaluateWays(board.slice(lockedRows), SWORD_PAYTABLE, state.triggeringBetCents);
    const winningWins = offsetWinningRows(evaluation.wins, lockedRows);
    const baseWinCents = evaluation.totalWinCents;
    const spinWinCents = safeMultiply(
      baseWinCents,
      state.activeMultiplier,
      "Sword spin payout exceeds the safe integer range",
    );
    const accumulatedWinCents = safeAdd(
      state.accumulatedWinCents,
      spinWinCents,
      "Accumulated Sword win exceeds the safe integer range",
    );

    const expansion = expands ? this.createExpansion(state.rows, expansionTarget!) : null;
    const remainingSpins = expansion === null
      ? state.remainingSpins - 1
      : safeAdd(
          state.remainingSpins - 1,
          this.config.startingSpins,
          "Remaining Sword spins exceed the safe integer range",
        );
    const complete = remainingSpins === 0;
    const finalStrikeMultiplier = complete && state.rows === this.config.maximumRows
      ? this.pickFinalStrikeMultiplier()
      : null;
    const finalPayoutCents = complete
      ? Math.min(
          finalStrikeMultiplier === null
            ? accumulatedWinCents
            : safeMultiply(
                accumulatedWinCents,
                finalStrikeMultiplier,
                "Sword final strike payout exceeds the safe integer range",
              ),
          safeMultiply(
            state.triggeringBetCents,
            this.config.maximumPayoutMultiplier,
            "Maximum Sword payout exceeds the safe integer range",
          ),
        )
      : null;
    const nextState: SwordFeatureState = {
      triggeringBetCents: state.triggeringBetCents,
      rows: expansion?.destinationRows ?? state.rows,
      remainingSpins,
      totalSpinsPlayed: safeAdd(state.totalSpinsPlayed, 1, "Sword spin count exceeds the safe integer range"),
      activeMultiplier: expansion?.destinationMultiplier ?? state.activeMultiplier,
      accumulatedWinCents,
      board,
      finalStrikeMultiplier,
      finalPayoutCents,
    };

    return {
      state: nextState,
      spinBoard: board,
      winningWins,
      winningPositions: evaluation.winningPositions.map((position) => ({
        row: position.row + lockedRows,
        column: position.column,
      })),
      baseWinCents,
      spinWinCents,
      expansion,
      complete,
      finalStrikeMultiplier,
      finalPayoutCents,
    };
  }

  summarize(state: SwordFeatureState): SwordFeatureSummary {
    validateState(state, this.config);
    if (state.remainingSpins !== 0 || state.finalPayoutCents === null) {
      throw new Error("Cannot summarize an active Sword feature");
    }
    return {
      kind: "sword",
      spinsPlayed: state.totalSpinsPlayed,
      payoutCents: state.finalPayoutCents,
      reachedFinalStage: state.rows === this.config.maximumRows,
      finalStrikeMultiplier: state.finalStrikeMultiplier,
    };
  }

  private drawBoard(swordTarget: number | null): WaysGrid {
    const board: WaysGrid = Array.from({ length: this.config.maximumRows }, () => []);
    for (let row = 0; row < this.config.maximumRows; row += 1) {
      const boardRow = board[row];
      if (boardRow === undefined) {
        throw new Error("Sword board row lookup failed");
      }
      for (let column = 0; column < this.config.columns; column += 1) {
        const index = row * this.config.columns + column;
        // Draw the underlying card/WILD before replacing the selected position with SWORD.
        const cell = this.drawCell();
        boardRow.push(index === swordTarget ? { kind: "bonus", symbol: "SWORD" } : cell);
      }
    }
    return board;
  }

  private drawCell(): WaysCell {
    let selection = this.random.nextInt(totalWeight(this.config.boardSymbols));
    for (const entry of this.config.boardSymbols) {
      if (selection < entry.weight) {
        return cellFor(entry.symbol);
      }
      selection -= entry.weight;
    }
    throw new Error("Sword board weight selection failed");
  }

  private createExpansion(rows: number, target: number): SwordExpansion {
    const destinationRows = rows + 1;
    const band = this.config.multiplierBands[destinationRows as SwordStageRows];
    if (band === undefined) {
      throw new Error("Sword multiplier band is missing");
    }
    return {
      position: { row: Math.floor(target / this.config.columns), column: target % this.config.columns },
      destinationRows,
      destinationMultiplier: pickBandMultiplier(this.random, band),
    };
  }

  private toBoardIndex(unlockedIndex: number, lockedRows: number): number {
    const row = Math.floor(unlockedIndex / this.config.columns) + lockedRows;
    return row * this.config.columns + unlockedIndex % this.config.columns;
  }

  private pickFinalStrikeMultiplier(): number {
    let selection = this.random.nextInt(totalWeight(this.config.finalStrikes));
    for (const strike of this.config.finalStrikes) {
      if (selection < strike.weight) {
        return strike.multiplier;
      }
      selection -= strike.weight;
    }
    throw new Error("Sword final strike weight selection failed");
  }
}

function offsetWinningRows(wins: ReadonlyArray<SymbolWin>, rowOffset: number): SymbolWin[] {
  return wins.map((win) => ({
    ...win,
    positions: win.positions.map((position) => ({
      ...position,
      row: position.row + rowOffset,
    })),
  }));
}

function cellFor(symbol: SwordBoardSymbol): WaysCell {
  if (symbol === "WILD") {
    return { kind: "wild" };
  }
  return { kind: "card", symbol };
}

function pickBandMultiplier(random: RandomSource, band: SwordMultiplierBand): number {
  return random.nextInt(band.maximum - band.minimum + 1) + band.minimum;
}

function totalWeight(entries: ReadonlyArray<{ readonly weight: number }>): number {
  return entries.reduce(
    (total, entry) => safeAdd(total, entry.weight, "Sword weight total exceeds the safe integer range"),
    0,
  );
}

function validateConfig(config: SwordConfig): void {
  const integerValues = [
    config.columns,
    config.startingRows,
    config.maximumRows,
    config.startingSpins,
    config.initialMultiplier,
  ];
  if (integerValues.some((value) => !Number.isSafeInteger(value) || value <= 0)
    || config.columns !== 5
    || config.startingRows !== 3
    || config.maximumRows !== 6
    || config.startingSpins !== 3) {
    throw new RangeError("Sword dimensions, spins, and initial multiplier are invalid");
  }
  if (!Number.isSafeInteger(config.maximumPayoutMultiplier) || config.maximumPayoutMultiplier <= 0) {
    throw new RangeError("Sword maximum payout multiplier is invalid");
  }
  if (config.expansionChances[3] !== 0.4
    || config.expansionChances[4] !== 0.25
    || config.expansionChances[5] !== 0.1) {
    throw new RangeError("Sword expansion chances are invalid");
  }
  if (totalWeight(config.boardSymbols) !== 100 || totalWeight(config.finalStrikes) !== 100) {
    throw new RangeError("Sword weight totals must equal 100");
  }
  for (let rows = config.startingRows + 1; rows <= config.maximumRows; rows += 1) {
    const band = config.multiplierBands[rows as SwordStageRows];
    if (band === undefined
      || !Number.isSafeInteger(band.minimum)
      || !Number.isSafeInteger(band.maximum)
      || band.minimum < 1
      || band.maximum < band.minimum) {
      throw new RangeError("Sword multiplier band is invalid");
    }
  }
  if (config.finalStrikes.some((strike) => !Number.isSafeInteger(strike.multiplier)
    || !Number.isSafeInteger(strike.weight)
    || strike.multiplier < 1
    || strike.weight <= 0)) {
    throw new RangeError("Sword final strike is invalid");
  }
  if (config.boardSymbols.some((entry) => !Number.isSafeInteger(entry.weight) || entry.weight <= 0)) {
    throw new RangeError("Sword board symbol weight is invalid");
  }
}

function validateState(state: SwordFeatureState, config: SwordConfig): void {
  const values = [
    state.triggeringBetCents,
    state.rows,
    state.remainingSpins,
    state.totalSpinsPlayed,
    state.activeMultiplier,
    state.accumulatedWinCents,
  ];
  if (values.some((value) => !Number.isSafeInteger(value))
    || state.triggeringBetCents <= 0
    || state.triggeringBetCents % PAYOUT_MULTIPLIER_SCALE !== 0
    || state.rows < config.startingRows
    || state.rows > config.maximumRows
    || state.remainingSpins < 0
    || state.remainingSpins > config.startingSpins * 3
    || state.totalSpinsPlayed < 0
    || state.activeMultiplier < 1
    || state.accumulatedWinCents < 0
    || !Number.isSafeInteger(state.finalStrikeMultiplier ?? 0)
    || (state.finalPayoutCents !== null && (!Number.isSafeInteger(state.finalPayoutCents) || state.finalPayoutCents < 0))) {
    throw new Error("Sword feature state is invalid");
  }
}
