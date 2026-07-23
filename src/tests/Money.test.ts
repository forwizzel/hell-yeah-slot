import { describe, expect, it } from "vitest";
import { BET_OPTIONS_CENTS, GAME_CONFIG, getAdjacentBetCents } from "../config/gameConfig";
import { formatUsd } from "../core/formatUsd";
import { GameState } from "../core/GameState";

describe("USD money configuration", () => {
  it("defines the exact ordered bet ladder in cents", () => {
    expect(BET_OPTIONS_CENTS).toEqual([
      20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250, 300,
      500, 1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 20_000,
      25_000, 30_000, 40_000, 50_000,
    ]);
    expect(BET_OPTIONS_CENTS).toContain(GAME_CONFIG.defaultBetCents);
  });

  it("moves between adjacent options and stops at the bounds", () => {
    expect(getAdjacentBetCents(20, -1)).toBe(20);
    expect(getAdjacentBetCents(200, 1)).toBe(250);
    expect(getAdjacentBetCents(500, -1)).toBe(300);
    expect(getAdjacentBetCents(50_000, 1)).toBe(50_000);
    expect(() => getAdjacentBetCents(30, 1)).toThrow("Current bet is not a configured option");
  });

  it("starts and resets at a $1,000 balance and $10 bet", () => {
    const state = new GameState();
    state.balanceCents = 20;
    state.betCents = 20;
    state.lastWinCents = 500;

    state.reset();

    expect(state.toViewModel()).toMatchObject({
      balanceCents: 100_000,
      betCents: 1_000,
      lastWinCents: 0,
    });
  });
});

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [20, "$0.20"],
    [100, "$1.00"],
    [12_345, "$123.45"],
    [100_000, "$1,000.00"],
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
