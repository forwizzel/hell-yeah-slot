import type { BonusCell, BonusRespinResult, BonusState, BonusSummary, Grid, Position } from "../core/types";
import type { RandomSource } from "./RandomSource";
import { WeightedPicker, type WeightedValue } from "./WeightedPicker";

export class BonusEngine {
  private readonly valuePicker: WeightedPicker<number>;

  constructor(
    private readonly random: RandomSource,
    bonusValueWeights: ReadonlyArray<WeightedValue<number>>,
    private readonly landingProbability: number,
    private readonly rows = 3,
    private readonly columns = 5,
    private readonly startingRespins = 3,
  ) {
    if (landingProbability < 0 || landingProbability > 1 || !Number.isFinite(landingProbability)) {
      throw new RangeError("Landing probability must be between 0 and 1");
    }
    if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(columns) || columns <= 0) {
      throw new RangeError("Bonus dimensions must be positive integers");
    }
    if (!Number.isInteger(startingRespins) || startingRespins <= 0) {
      throw new RangeError("Starting respins must be a positive integer");
    }
    this.valuePicker = new WeightedPicker(bonusValueWeights);
  }

  findTriggerPositions(grid: Grid): Position[] {
    const positions: Position[] = [];
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
        if (grid[row]?.[column]?.kind === "bonus") {
          positions.push({ row, column });
        }
      }
    }
    return positions;
  }

  start(grid: Grid, triggeringBet: number): BonusState {
    if (!Number.isSafeInteger(triggeringBet) || triggeringBet <= 0) {
      throw new RangeError("Triggering bet must be a positive integer");
    }
    if (grid.length !== this.rows || grid.some((row) => row.length !== this.columns)) {
      throw new Error(`Trigger grid must be ${this.rows} x ${this.columns}`);
    }

    const cells: Array<BonusCell | null> = Array.from({ length: this.rows * this.columns }, () => null);
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const cell = grid[row]?.[column];
        if (cell?.kind === "bonus") {
          cells[this.toIndex(row, column)] = { kind: "bonus", value: cell.value };
        }
      }
    }

    return { cells, remainingRespins: this.startingRespins, totalRespinsPlayed: 0, triggeringBet };
  }

  respin(state: BonusState): BonusRespinResult {
    this.validateState(state);
    const cells = state.cells.map((cell) => (cell === null ? null : { ...cell }));
    const newPositions: Position[] = [];

    for (let index = 0; index < cells.length; index += 1) {
      if (cells[index] === null && this.random.nextFloat() < this.landingProbability) {
        cells[index] = { kind: "bonus", value: this.valuePicker.pick(this.random) };
        newPositions.push(this.toPosition(index));
      }
    }

    const filled = cells.every((cell) => cell !== null);
    const remainingRespins = newPositions.length > 0
      ? this.startingRespins
      : Math.max(0, state.remainingRespins - 1);
    const nextState: BonusState = {
      cells,
      remainingRespins,
      totalRespinsPlayed: state.totalRespinsPlayed + 1,
      triggeringBet: state.triggeringBet,
    };

    return {
      state: nextState,
      newPositions,
      complete: filled || remainingRespins === 0,
      filled,
    };
  }

  isComplete(state: BonusState): boolean {
    this.validateState(state);
    return state.remainingRespins === 0 || state.cells.every((cell) => cell !== null);
  }

  summarize(state: BonusState): BonusSummary {
    this.validateState(state);
    const lockedCells = state.cells.filter((cell): cell is BonusCell => cell !== null);
    const valueTotal = lockedCells.reduce((total, cell) => total + cell.value, 0);
    return {
      symbolCount: lockedCells.length,
      valueTotal,
      payout: valueTotal * state.triggeringBet,
      respinsPlayed: state.totalRespinsPlayed,
      filled: lockedCells.length === state.cells.length,
    };
  }

  private validateState(state: BonusState): void {
    if (state.cells.length !== this.rows * this.columns) {
      throw new Error("Bonus state has an invalid cell count");
    }
    if (!Number.isInteger(state.remainingRespins) || state.remainingRespins < 0) {
      throw new Error("Bonus state has invalid remaining respins");
    }
    if (!Number.isSafeInteger(state.triggeringBet) || state.triggeringBet <= 0) {
      throw new Error("Bonus state has an invalid triggering bet");
    }
  }

  private toIndex(row: number, column: number): number {
    return row * this.columns + column;
  }

  private toPosition(index: number): Position {
    return { row: Math.floor(index / this.columns), column: index % this.columns };
  }
}
