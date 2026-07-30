import { describe, expect, it } from "vitest";
import type { BonusSymbolId, Cell, FreeSpinState, Grid } from "../core/types";
import { BonusEngine } from "../math/BonusEngine";
import { ControlledRandomSource } from "./testUtils";

const CIGARETTE_RANGE = { minimumTenths: 5, maximumTenths: 500 } as const;
const BEER_RANGE = { minimumTenths: 5, maximumTenths: 250 } as const;
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
  return new BonusEngine(random, 10, 10, 5, CIGARETTE_RANGE, BEER_RANGE);
}

function activeState(overrides: Partial<FreeSpinState> = {}): FreeSpinState {
  return {
    mode: "beer",
    remainingSpins: 10,
    totalSpinsPlayed: 0,
    multiplier: 5,
    triggeringBetCents: 500,
    accumulatedWinCents: 0,
    ...overrides,
  };
}

describe("BonusEngine", () => {
  it("starts Beer and combined spins at x5 while Cigarette starts at x1", () => {
    const bonusEngine = engine();
    const beer = bonusEngine.resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER"]));
    const cigarette = bonusEngine.resolveBaseTrigger(gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]));
    const combined = bonusEngine.resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]));

    if (beer.kind !== "free-spins" || cigarette.kind !== "free-spins" || combined.kind !== "free-spins") {
      throw new Error("Expected free-spin triggers");
    }
    expect(bonusEngine.startFreeSpins(beer, 500).multiplier).toBe(5);
    expect(bonusEngine.startFreeSpins(cigarette, 500).multiplier).toBe(1);
    expect(bonusEngine.startFreeSpins(combined, 500).multiplier).toBe(5);
  });

  it("awards every Cigarette on a Cigarette spin in 0.5x steps and adds 10 spins", () => {
    const random = new ControlledRandomSource([], [0, 99, 4]);
    const result = engine(random).applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 3, multiplier: 1 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result.cashAwards.map((award) => award.baseAmountCents)).toEqual([250, 25_000, 1_250]);
    expect(result.cashAwards.map((award) => award.amountCents)).toEqual([250, 25_000, 1_250]);
    expect(result).toMatchObject({
      waysWinCents: 100,
      cashAwardWinCents: 26_500,
      spinWinCents: 26_600,
      cigaretteRetriggered: true,
      addedSpins: 10,
    });
    expect(result.state).toMatchObject({ remainingSpins: 12, multiplier: 1, accumulatedWinCents: 26_600 });
    expect(random.integerCalls).toBe(3);
  });

  it("applies Beer x5 to both ways and every cash symbol in a combined spin", () => {
    const result = engine(new ControlledRandomSource([], [0, 49, 0, 99, 0])).applyFreeSpin(
      activeState({ mode: "combined", remainingSpins: 2, multiplier: 5 }),
      gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result.cashAwards.map((award) => [award.symbol, award.baseAmountCents, award.amountCents])).toEqual([
      ["BEER", 250, 1_250],
      ["BEER", 12_500, 62_500],
      ["BEER", 250, 1_250],
      ["CIGARETTE", 25_000, 125_000],
      ["CIGARETTE", 250, 1_250],
    ]);
    expect(result).toMatchObject({
      waysWinCents: 500,
      cashAwardWinCents: 191_250,
      spinWinCents: 191_750,
      beerRetriggered: true,
      cigaretteRetriggered: false,
      addedSpins: 10,
    });
  });

  it("adds 10 spins for three Cigarettes during a combined feature", () => {
    const result = engine(new ControlledRandomSource([], [0, 0, 0])).applyFreeSpin(
      activeState({ mode: "combined", remainingSpins: 2, multiplier: 5 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      0,
    );

    expect(result).toMatchObject({ cigaretteRetriggered: true, addedSpins: 10 });
    expect(result.state.remainingSpins).toBe(11);
  });

  it("starts x5 on the spin after a Cigarette feature converts through three Beer symbols", () => {
    const result = engine().applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 2, multiplier: 1 }),
      gridWith(["BEER", "BEER", "BEER"]),
      100,
    );

    expect(result).toMatchObject({ waysWinCents: 100, cashAwardWinCents: 0, beerRetriggered: true, addedSpins: 10 });
    expect(result.state).toMatchObject({ mode: "combined", multiplier: 5, remainingSpins: 11 });
  });

  it("does not award cash on a Beer-to-combined conversion spin", () => {
    const result = engine().applyFreeSpin(
      activeState({ mode: "beer", remainingSpins: 2, multiplier: 5 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result).toMatchObject({ cashAwardWinCents: 0, cigaretteRetriggered: true, addedSpins: 10 });
    expect(result.state).toMatchObject({ mode: "combined", multiplier: 5, remainingSpins: 11 });
  });

  it("suppresses retriggers but not resolved Cigarette cash awards when Sword launches", () => {
    const result = engine(new ControlledRandomSource([], [0, 0, 0])).applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 2, multiplier: 1 }),
      gridWith(["SWORD", "SWORD", "SWORD", "CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      0,
    );

    expect(result).toMatchObject({ swordTriggered: true, cigaretteRetriggered: false, addedSpins: 0, cashAwardWinCents: 750 });
  });

  it("validates cash-award ranges and safe integer payouts", () => {
    expect(() => new BonusEngine(new ControlledRandomSource(), 10, 10, 5, { minimumTenths: 4, maximumTenths: 500 }, BEER_RANGE)).toThrow(
      "Cigarette cash award range is invalid",
    );
    expect(() => engine(new ControlledRandomSource([], [99])).applyFreeSpin(
      activeState({ mode: "cigarette", multiplier: 1, triggeringBetCents: Number.MAX_SAFE_INTEGER }),
      gridWith(["CIGARETTE"]),
      0,
    )).toThrow("Free-spin cash award exceeds the safe integer range");
  });

  it("summarizes a completed free-spin feature", () => {
    expect(engine().summarize(activeState({
      mode: "combined",
      remainingSpins: 0,
      totalSpinsPlayed: 14,
      multiplier: 5,
      accumulatedWinCents: 42_000,
    }))).toEqual({
      kind: "free-spins",
      mode: "combined",
      spinsPlayed: 14,
      payoutCents: 42_000,
      finalMultiplier: 5,
    });
  });
});
