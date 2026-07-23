import { describe, expect, it } from "vitest";
import type { BonusSymbolId, Cell, FreeSpinState, Grid } from "../core/types";
import { BonusEngine, type TriggerChances } from "../math/BonusEngine";
import { ControlledRandomSource } from "./testUtils";

const CHANCES: TriggerChances = {
  BEER: { 1: 0.002, 2: 0.008 },
  CIGARETTE: { 1: 0.005, 2: 0.01 },
};
const regular: Cell = { kind: "card", symbol: "10" };

function bonus(symbol: BonusSymbolId): Cell {
  return { kind: "bonus", symbol };
}

function gridWith(symbols: ReadonlyArray<BonusSymbolId>): Grid {
  const flat: Cell[] = Array.from({ length: 15 }, () => regular);
  symbols.forEach((symbol, index) => { flat[index] = bonus(symbol); });
  return Array.from({ length: 3 }, (_, row) => flat.slice(row * 5, row * 5 + 5));
}

function engine(random = new ControlledRandomSource()): BonusEngine {
  return new BonusEngine(random, CHANCES, 10, 3, 6, 2, 10);
}

function activeState(overrides: Partial<FreeSpinState> = {}): FreeSpinState {
  return {
    mode: "beer",
    remainingSpins: 10,
    totalSpinsPlayed: 0,
    multiplier: 1,
    triggeringBetCents: 500,
    accumulatedWinCents: 0,
    ...overrides,
  };
}

describe("BonusEngine", () => {
  it("starts Beer Bonus with 10 free spins and no multiplier", () => {
    const trigger = engine().resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER"]));

    expect(trigger).toMatchObject({ kind: "free-spins", mode: "beer", startingSpins: 10, multiplier: 1 });
  });

  it("starts Cigarette Bonus with 3 free spins and one uniform 2-10 multiplier", () => {
    const trigger = engine(new ControlledRandomSource([], [8])).resolveBaseTrigger(
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
    );

    expect(trigger).toMatchObject({ kind: "free-spins", mode: "cigarette", startingSpins: 3, multiplier: 10 });
  });

  it("starts a natural combination with Beer spins and a Cigarette multiplier", () => {
    const trigger = engine(new ControlledRandomSource([], [3])).resolveBaseTrigger(
      gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE"]),
    );

    expect(trigger).toMatchObject({ kind: "free-spins", mode: "combined", startingSpins: 10, multiplier: 5 });
  });

  it("independently rolls below-three Beer and Cigarette triggers", () => {
    const trigger = engine(new ControlledRandomSource([0.001, 0.004], [4])).resolveBaseTrigger(
      gridWith(["BEER", "CIGARETTE"]),
    );

    expect(trigger).toMatchObject({
      kind: "free-spins",
      mode: "combined",
      multiplier: 6,
      beer: { source: "chance", symbolCount: 1 },
      cigarette: { source: "chance", symbolCount: 1 },
    });
  });

  it("does not roll a chance trigger when no matching symbol appears", () => {
    const random = new ControlledRandomSource([0]);
    expect(engine(random).resolveBaseTrigger(gridWith([]))).toEqual({ kind: "none" });
    expect(random.floatCalls).toBe(0);
    expect(random.integerCalls).toBe(0);
  });

  it("gives Sword priority over every other base trigger", () => {
    const random = new ControlledRandomSource([0]);
    const trigger = engine(random).resolveBaseTrigger(
      gridWith(["SWORD", "SWORD", "SWORD", "BEER", "CIGARETTE"]),
    );

    expect(trigger).toMatchObject({ kind: "sword" });
    expect(random.floatCalls).toBe(0);
    expect(random.integerCalls).toBe(0);
  });

  it("uses the triggering bet and resolved awards to initialize free spins", () => {
    const bonusEngine = engine();
    const trigger = bonusEngine.resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER"]));
    if (trigger.kind !== "free-spins") {
      throw new Error("Expected free spins");
    }

    expect(bonusEngine.startFreeSpins(trigger, 700)).toEqual(activeState({
      triggeringBetCents: 700,
      multiplier: 6,
    }));
  });

  it("combines the x6 free-spin baseline with the initial Cigarette multiplier", () => {
    const bonusEngine = engine(new ControlledRandomSource([], [8]));
    const trigger = bonusEngine.resolveBaseTrigger(gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]));
    if (trigger.kind !== "free-spins") {
      throw new Error("Expected free spins");
    }

    expect(bonusEngine.startFreeSpins(trigger, 500).multiplier).toBe(60);
  });

  it("pays with the multiplier active before retrigger changes", () => {
    const result = engine(new ControlledRandomSource([], [3])).applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 3, multiplier: 4 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      200,
    );

    expect(result).toMatchObject({ spinWinCents: 800, cigaretteRetriggered: true, awardedMultiplier: 5 });
    expect(result.state).toMatchObject({ remainingSpins: 2, multiplier: 20, accumulatedWinCents: 800 });
  });

  it("adds 10 Beer spins rather than resetting the counter", () => {
    const result = engine().applyFreeSpin(
      activeState({ remainingSpins: 4 }),
      gridWith(["BEER", "BEER", "BEER"]),
      0,
    );

    expect(result).toMatchObject({ beerRetriggered: true, addedSpins: 10 });
    expect(result.state.remainingSpins).toBe(13);
  });

  it("stacks Beer and Cigarette retriggers and enters combined mode", () => {
    const result = engine(new ControlledRandomSource([], [1])).applyFreeSpin(
      activeState({ remainingSpins: 2, multiplier: 1 }),
      gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      1_000,
    );

    expect(result).toMatchObject({
      spinWinCents: 1_000,
      beerRetriggered: true,
      cigaretteRetriggered: true,
      addedSpins: 10,
      awardedMultiplier: 3,
    });
    expect(result.state).toMatchObject({ mode: "combined", remainingSpins: 11, multiplier: 3 });
  });

  it("treats Sword as an interstitial and suppresses malformed same-grid retriggers", () => {
    const result = engine().applyFreeSpin(
      activeState({ remainingSpins: 2 }),
      gridWith(["SWORD", "SWORD", "SWORD", "BEER", "BEER", "BEER"]),
      300,
    );

    expect(result).toMatchObject({
      swordTriggered: true,
      beerRetriggered: false,
      cigaretteRetriggered: false,
      spinWinCents: 300,
    });
    expect(result.state).toMatchObject({ remainingSpins: 1, multiplier: 1 });
  });

  it("summarizes only a completed free-spin feature", () => {
    const summary = engine().summarize(activeState({
      mode: "combined",
      remainingSpins: 0,
      totalSpinsPlayed: 14,
      multiplier: 12,
      accumulatedWinCents: 42_000,
    }));

    expect(summary).toEqual({
      kind: "free-spins",
      mode: "combined",
      spinsPlayed: 14,
      payoutCents: 42_000,
      finalMultiplier: 12,
    });
  });

  it("rejects a retrigger multiplier outside the safe integer range", () => {
    expect(() => engine(new ControlledRandomSource([], [1])).applyFreeSpin(
      activeState({ mode: "cigarette", multiplier: Number.MAX_SAFE_INTEGER }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      0,
    )).toThrow("Free-spin multiplier exceeds the safe integer range");
  });

  it("validates the free-spin baseline multiplier", () => {
    expect(() => new BonusEngine(new ControlledRandomSource(), CHANCES, 10, 3, 0, 2, 10)).toThrow(
      "Free-spin base multiplier must be a positive integer",
    );
  });

  it("rejects an initial effective multiplier outside the safe integer range", () => {
    const trigger = {
      kind: "free-spins",
      mode: "cigarette",
      startingSpins: 3,
      multiplier: Number.MAX_SAFE_INTEGER,
      beer: null,
      cigarette: null,
    } as const;

    expect(() => engine().startFreeSpins(trigger, 500)).toThrow(
      "Initial free-spin multiplier exceeds the safe integer range",
    );
  });
});
