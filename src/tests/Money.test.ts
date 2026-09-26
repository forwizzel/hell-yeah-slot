import { describe, expect, it } from "vitest";
import {
  BET_OPTIONS_CENTS,
  FEATURE_BUY_MULTIPLIER_TENTHS,
  GAME_CONFIG,
  getAdjacentBetCents,
  getFeatureBuyCostCents,
  type FeatureBuyId,
} from "../config/gameConfig";
import { PAYTABLE, PAYOUT_MULTIPLIER_SCALE } from "../config/paytable";
import { formatCompactUsd, formatUsd } from "../core/formatUsd";
import { GameState } from "../core/GameState";

describe("USD money configuration", () => {
  it("defines the exact ordered bet ladder in cents", () => {
    expect(BET_OPTIONS_CENTS).toEqual([
      20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250, 300,
      500, 1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 20_000,
      25_000, 30_000, 40_000, 50_000,
    ]);
    expect(BET_OPTIONS_CENTS).toContain(GAME_CONFIG.defaultBetCents);
    expect(BET_OPTIONS_CENTS.every((betCents) => betCents % PAYOUT_MULTIPLIER_SCALE === 0)).toBe(true);
  });

  it("moves between adjacent options and stops at the bounds", () => {
    expect(getAdjacentBetCents(20, -1)).toBe(20);
    expect(getAdjacentBetCents(200, 1)).toBe(250);
    expect(getAdjacentBetCents(500, -1)).toBe(300);
    expect(getAdjacentBetCents(50_000, 1)).toBe(50_000);
    expect(() => getAdjacentBetCents(30, 1)).toThrow("Current bet is not a configured option");
  });

  it("starts and resets at a $450,000 balance and $500 bet", () => {
    const state = new GameState();
    state.balanceCents = 20;
    state.betCents = 20;
    state.lastWinCents = 500;

    state.reset();

    expect(state.toViewModel()).toMatchObject({
      balanceCents: 45_000_000,
      betCents: 50_000,
      lastWinCents: 0,
    });
  });

  it("prices every feature buy as the configured multiple of the selected bet", () => {
    expect(FEATURE_BUY_MULTIPLIER_TENTHS).toEqual({ beer: 136, cigarette: 250, combined: 731, sword: 1_638 });
    expect(getFeatureBuyCostCents("beer", 50_000)).toBe(680_000);
    expect(getFeatureBuyCostCents("cigarette", 50_000)).toBe(1_250_000);
    expect(getFeatureBuyCostCents("combined", 50_000)).toBe(3_655_000);
    expect(getFeatureBuyCostCents("sword", 50_000)).toBe(8_190_000);
    const features: readonly FeatureBuyId[] = ["beer", "cigarette", "combined", "sword"];
    expect(BET_OPTIONS_CENTS.every((betCents) =>
      features.every((feature) => Number.isSafeInteger(getFeatureBuyCostCents(feature, betCents))))).toBe(true);
    expect(() => getFeatureBuyCostCents("beer", 0)).toThrow("Feature-buy bet must be a positive safe integer");
  });
});

describe("calibrated payout configuration", () => {
  it("uses the approved tenth-unit paytable and free-spin baseline", () => {
    expect(PAYOUT_MULTIPLIER_SCALE).toBe(10);
    expect(PAYTABLE).toEqual({
      "10": { 3: 0, 4: 1, 5: 3 },
      J: { 3: 0, 4: 2, 5: 5 },
      Q: { 3: 2, 4: 3, 5: 7 },
      K: { 3: 3, 4: 5, 5: 8 },
      A: { 3: 5, 4: 10, 5: 45 },
      GUN: { 3: 8, 4: 24, 5: 120 },
      KNIGHT: { 3: 15, 4: 45, 5: 240 },
    });
    expect(GAME_CONFIG.beerFreeSpinMultiplier).toBe(3);
    expect(GAME_CONFIG.normalMultiplierRevealDurationMs).toBe(2_400);
    expect(GAME_CONFIG.quickMultiplierRevealDurationMs).toBe(180);
  });
});

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [20, "$0.20"],
    [100, "$1.00"],
    [12_345, "$123.45"],
    [100_000, "$1,000.00"],
    [Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"],
    [-120, "-$1.20"],
  ] as const)("formats %i cents as %s", (cents, expected) => {
    expect(formatUsd(cents)).toBe(expected);
  });

  it("rejects fractional and unsafe amounts", () => {
    expect(() => formatUsd(20.5)).toThrow("USD amount must be a safe integer number of cents");
    expect(() => formatUsd(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "USD amount must be a safe integer number of cents",
    );
  });
});

describe("formatCompactUsd", () => {
  it.each([
    [104_700_000, "$1.05M"],
    [188_750_000, "$1.89M"],
    [Number.MAX_SAFE_INTEGER, "$90.1T"],
    [-188_750_000, "-$1.89M"],
  ] as const)("compacts %i cents as %s", (cents, expected) => {
    expect(formatCompactUsd(cents)).toBe(expected);
  });

  it("keeps ordinary amounts exact", () => {
    expect(formatCompactUsd(88_325_000)).toBe("$883,250.00");
  });
});
