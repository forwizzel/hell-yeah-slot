import { describe, expect, it } from "vitest";
import type { BonusSymbolId, Cell, FreeSpinState, Grid } from "../core/types";
import { BonusEngine } from "../math/BonusEngine";
import { ControlledRandomSource } from "./testUtils";

const CIGARETTE_PRIZES = [
  { multiplierTenths: 5, weight: 2 },
  { multiplierTenths: 500, weight: 1 },
] as const;
const BEER_PRIZES = [
  { multiplierTenths: 5, weight: 2 },
  { multiplierTenths: 250, weight: 1 },
] as const;
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
  return new BonusEngine(random, 10, 10, 5, 5, 3, 10_000, CIGARETTE_PRIZES, BEER_PRIZES);
}

function activeState(overrides: Partial<FreeSpinState> = {}): FreeSpinState {
  return {
    mode: "beer",
    remainingSpins: 10,
    totalSpinsPlayed: 0,
    multiplier: 3,
    triggeringBetCents: 500,
    maximumWinCents: 5_000_000,
    accumulatedWinCents: 0,
    ...overrides,
  };
}

describe("BonusEngine", () => {
  it("starts Beer and combined spins at x3 while Cigarette starts at x1", () => {
    const bonusEngine = engine();
    const beer = bonusEngine.resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER"]));
    const cigarette = bonusEngine.resolveBaseTrigger(gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]));
    const combined = bonusEngine.resolveBaseTrigger(gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]));

    if (beer.kind !== "free-spins" || cigarette.kind !== "free-spins" || combined.kind !== "free-spins") {
      throw new Error("Expected free-spin triggers");
    }
    expect(bonusEngine.startFreeSpins(beer, 500).multiplier).toBe(3);
    expect(bonusEngine.startFreeSpins(cigarette, 500).multiplier).toBe(1);
    expect(bonusEngine.startFreeSpins(combined, 500).multiplier).toBe(3);
  });

  it("awards every Cigarette from its weighted table and adds 5 spins", () => {
    const random = new ControlledRandomSource([], [0, 2, 0]);
    const result = engine(random).applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 3, multiplier: 1 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result.cashAwards.map((award) => award.baseAmountCents)).toEqual([250, 25_000, 250]);
    expect(result.cashAwards.map((award) => award.amountCents)).toEqual([250, 25_000, 250]);
    expect(result).toMatchObject({
      waysWinCents: 100,
      cashAwardWinCents: 25_500,
      spinWinCents: 25_600,
      cigaretteRetriggered: true,
      addedSpins: 5,
    });
    expect(result.state).toMatchObject({ remainingSpins: 7, multiplier: 1, accumulatedWinCents: 25_600 });
    expect(random.integerCalls).toBe(3);
  });

  it("applies Beer x3 to both ways and every cash symbol in a combined spin", () => {
    const result = engine(new ControlledRandomSource([], [0, 2, 0, 2, 0])).applyFreeSpin(
      activeState({ mode: "combined", remainingSpins: 2, multiplier: 3 }),
      gridWith(["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result.cashAwards.map((award) => [award.symbol, award.baseAmountCents, award.amountCents])).toEqual([
      ["BEER", 250, 750],
      ["BEER", 12_500, 37_500],
      ["BEER", 250, 750],
      ["CIGARETTE", 25_000, 75_000],
      ["CIGARETTE", 250, 750],
    ]);
    expect(result).toMatchObject({
      waysWinCents: 300,
      cashAwardWinCents: 114_750,
      spinWinCents: 115_050,
      beerRetriggered: true,
      cigaretteRetriggered: false,
      addedSpins: 5,
    });
  });

  it("adds 5 spins for three Cigarettes during a combined feature", () => {
    const result = engine(new ControlledRandomSource([], [0, 0, 0])).applyFreeSpin(
      activeState({ mode: "combined", remainingSpins: 2, multiplier: 3 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      0,
    );

    expect(result).toMatchObject({ cigaretteRetriggered: true, addedSpins: 5 });
    expect(result.state.remainingSpins).toBe(6);
  });

  it("starts x3 on the spin after a Cigarette feature converts through three Beer symbols", () => {
    const result = engine().applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 2, multiplier: 1 }),
      gridWith(["BEER", "BEER", "BEER"]),
      100,
    );

    expect(result).toMatchObject({ waysWinCents: 100, cashAwardWinCents: 0, beerRetriggered: true, addedSpins: 5 });
    expect(result.state).toMatchObject({ mode: "combined", multiplier: 3, remainingSpins: 6 });
  });

  it("does not award cash on a Beer-to-combined conversion spin", () => {
    const result = engine().applyFreeSpin(
      activeState({ mode: "beer", remainingSpins: 2, multiplier: 3 }),
      gridWith(["CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      100,
    );

    expect(result).toMatchObject({ cashAwardWinCents: 0, cigaretteRetriggered: true, addedSpins: 5 });
    expect(result.state).toMatchObject({ mode: "combined", multiplier: 3, remainingSpins: 6 });
  });

  it("suppresses retriggers but not resolved Cigarette cash awards when Sword launches", () => {
    const result = engine(new ControlledRandomSource([], [0, 0, 0])).applyFreeSpin(
      activeState({ mode: "cigarette", remainingSpins: 2, multiplier: 1 }),
      gridWith(["SWORD", "SWORD", "SWORD", "CIGARETTE", "CIGARETTE", "CIGARETTE"]),
      0,
    );

    expect(result).toMatchObject({ swordTriggered: true, cigaretteRetriggered: false, addedSpins: 0, cashAwardWinCents: 750 });
  });

  it("validates cash-award tables and caps payouts without overflow", () => {
    expect(() => new BonusEngine(new ControlledRandomSource(), 10, 10, 5, 5, 5, 10_000, [], BEER_PRIZES)).toThrow(
      "Cigarette cash award table is invalid",
    );
    const result = engine(new ControlledRandomSource([], [2])).applyFreeSpin(
      activeState({ mode: "cigarette", multiplier: 1, maximumWinCents: 1_000, accumulatedWinCents: 900 }),
      gridWith(["CIGARETTE"]),
      0,
    );
    expect(result.cashAwardWinCents).toBe(100);
    expect(result.state.accumulatedWinCents).toBe(1_000);
  });

  it("summarizes a completed free-spin feature", () => {
    expect(engine().summarize(activeState({
      mode: "combined",
      remainingSpins: 0,
      totalSpinsPlayed: 14,
      multiplier: 3,
      accumulatedWinCents: 42_000,
    }))).toEqual({
      kind: "free-spins",
      mode: "combined",
      spinsPlayed: 14,
      payoutCents: 42_000,
      finalMultiplier: 3,
    });
  });
});
