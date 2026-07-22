import { describe, expect, it } from "vitest";
import type { BonusCell, BonusState, Cell, Grid } from "../core/types";
import { BonusEngine } from "../math/BonusEngine";
import { SeededRandomSource } from "../math/SeededRandomSource";
import { ControlledRandomSource } from "./testUtils";

const VALUES = [{ value: 1, weight: 1 }, { value: 5, weight: 1 }] as const;
const regular: Cell = { kind: "regular", symbol: "A" };
const bonus = (value: number): BonusCell => ({ kind: "bonus", value });

function triggerGrid(bonuses: ReadonlyArray<{ index: number; value: number }>): Grid {
  const flat: Cell[] = Array.from({ length: 15 }, () => regular);
  for (const entry of bonuses) {
    flat[entry.index] = bonus(entry.value);
  }
  return Array.from({ length: 3 }, (_, row) => flat.slice(row * 5, row * 5 + 5));
}

function engine(random = new ControlledRandomSource(), probability = 0.5): BonusEngine {
  return new BonusEngine(random, VALUES, probability);
}

describe("BonusEngine", () => {
  it("copies and locks initial triggering symbols", () => {
    const state = engine().start(triggerGrid([{ index: 0, value: 2 }, { index: 7, value: 10 }]), 5);

    expect(state.cells[0]).toEqual(bonus(2));
    expect(state.cells[7]).toEqual(bonus(10));
    expect(state.cells.filter(Boolean)).toHaveLength(2);
    expect(state.remainingRespins).toBe(3);
  });

  it("preserves existing symbols and locks new hits", () => {
    const random = new ControlledRandomSource([0.1, 0, ...Array.from({ length: 13 }, () => 0.9)]);
    const initial = engine(random).start(triggerGrid([{ index: 0, value: 10 }]), 10);
    const result = engine(random).respin(initial);

    expect(result.state.cells[0]).toEqual(bonus(10));
    expect(result.state.cells[1]).toEqual(bonus(1));
    expect(result.newPositions).toEqual([{ row: 0, column: 1 }]);
    expect(result.state.remainingRespins).toBe(3);
  });

  it("reduces respins by one after a miss", () => {
    const initial = engine().start(triggerGrid([{ index: 0, value: 1 }]), 1);
    const result = engine().respin(initial);

    expect(result.newPositions).toEqual([]);
    expect(result.state.remainingRespins).toBe(2);
  });

  it("ends after three consecutive misses", () => {
    const bonusEngine = engine();
    let state = bonusEngine.start(triggerGrid([{ index: 0, value: 1 }]), 1);
    let complete = false;

    for (let count = 0; count < 3; count += 1) {
      const result = bonusEngine.respin(state);
      state = result.state;
      complete = result.complete;
    }

    expect(state.remainingRespins).toBe(0);
    expect(complete).toBe(true);
  });

  it("ends immediately when all 15 positions fill", () => {
    const entries = Array.from({ length: 14 }, (_, index) => ({ index, value: 1 }));
    const random = new ControlledRandomSource([0.1, 0]);
    const result = engine(random).respin(engine(random).start(triggerGrid(entries), 1));

    expect(result.filled).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.state.cells.every(Boolean)).toBe(true);
  });

  it("recognizes an initially full trigger grid without playing a respin", () => {
    const entries = Array.from({ length: 15 }, (_, index) => ({ index, value: 1 }));
    const state = engine().start(triggerGrid(entries), 1);

    expect(engine().isComplete(state)).toBe(true);
    expect(state.totalRespinsPlayed).toBe(0);
  });

  it("calculates final payout from values and the triggering bet", () => {
    const state = engine().start(triggerGrid([{ index: 0, value: 2 }, { index: 1, value: 5 }, { index: 2, value: 10 }]), 4);

    expect(engine().summarize(state)).toMatchObject({ symbolCount: 3, valueTotal: 17, payout: 68 });
  });

  it("is deterministic with a controlled seeded source", () => {
    const playOnce = (): BonusState => {
      const bonusEngine = new BonusEngine(new SeededRandomSource("bonus-seed"), VALUES, 0.25);
      let state = bonusEngine.start(triggerGrid([{ index: 0, value: 2 }, { index: 5, value: 1 }, { index: 10, value: 5 }]), 3);
      for (let count = 0; count < 4; count += 1) {
        state = bonusEngine.respin(state).state;
      }
      return state;
    };

    expect(playOnce()).toEqual(playOnce());
  });
});
