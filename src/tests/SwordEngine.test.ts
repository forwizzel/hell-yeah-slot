import { describe, expect, it } from "vitest";
import { SWORD_PAYTABLE } from "../config/paytable";
import { SWORD_CONFIG } from "../config/swordConfig";
import type { SwordFeatureState } from "../core/types";
import { evaluateWays } from "../math/PayEvaluator";
import { SwordEngine } from "../math/SwordEngine";
import { ControlledRandomSource } from "./testUtils";

function engine(random = new ControlledRandomSource()): SwordEngine {
  return new SwordEngine(random);
}

function activeState(overrides: Partial<SwordFeatureState> = {}): SwordFeatureState {
  return {
    triggeringBetCents: 20,
    maximumWinCents: 200_000,
    rows: 3,
    remainingSpins: 3,
    totalSpinsPlayed: 0,
    activeMultiplier: 1,
    accumulatedWinCents: 0,
    board: [],
    finalStrikeMultiplier: null,
    finalPayoutCents: null,
    ...overrides,
  };
}

describe("SwordEngine", () => {
  it("includes GUN and KNIGHT in its board symbol weights", () => {
    expect(SWORD_CONFIG.boardSymbols.map(({ symbol }) => symbol)).toContain("GUN");
    expect(SWORD_CONFIG.boardSymbols.map(({ symbol }) => symbol)).toContain("KNIGHT");
    expect(SWORD_CONFIG).not.toHaveProperty("maximumPayoutMultiplier");
  });

  it("starts at three rows, three spins, and a x1 active multiplier", () => {
    expect(engine().start(20)).toEqual(activeState());
  });

  it("draws a full no-blank board and pays only its unlocked bottom rows", () => {
    const random = new ControlledRandomSource([0.99, 0.99], Array.from({ length: 30 }, () => 0));
    const result = engine(random).playSpin(activeState({ activeMultiplier: 3 }));

    expect(result.baseWinCents).toBe(486);
    expect(result.spinWinCents).toBe(1_458);
    expect(result.spinBoard).toHaveLength(6);
    expect(result.spinBoard.flat().every((cell) => cell.kind === "card" && cell.symbol === "10")).toBe(true);
    expect(result.winningPositions).toHaveLength(15);
    expect(result.winningPositions[0]).toEqual({ row: 3, column: 0 });
    expect(result.winningWins[0]?.positions[0]).toEqual({ row: 3, column: 0 });
    expect(result.state.board).toHaveLength(6);
    expect(result.state.board.flat().every((cell) => cell.kind === "card" && cell.symbol === "10")).toBe(true);
    expect(random.floatCalls).toBe(2);
    expect(random.integerCalls).toBe(30);
  });

  it("places an in-play SWORD in the unlocked rows and adds three spins", () => {
    const random = new ControlledRandomSource([0], [
      7,
      ...Array.from({ length: 30 }, () => 0),
      1,
    ]);
    const result = engine(random).playSpin(activeState({ activeMultiplier: 4 }));

    expect(result).toMatchObject({
      baseWinCents: 324,
      spinWinCents: 1_296,
      expansion: {
        position: { row: 4, column: 2 },
        destinationRows: 4,
        destinationMultiplier: 3,
      },
    });
    expect(result.state).toMatchObject({ rows: 4, remainingSpins: 5, activeMultiplier: 3 });
    expect(result.spinBoard[4]?.[2]).toEqual({ kind: "bonus", symbol: "SWORD" });
    expect(result.winningPositions).toHaveLength(14);
    expect(result.winningPositions).not.toContainEqual({ row: 4, column: 2 });
    expect(result.winningWins.flatMap((win) => win.positions)).not.toContainEqual({ row: 4, column: 2 });
    expect(result.spinBoard).toHaveLength(6);
    expect(result.state.board).toHaveLength(6);
    expect(result.state.board.flat().some((cell) => cell.kind === "blank")).toBe(false);
    expect(evaluateWays(result.spinBoard.slice(3), SWORD_PAYTABLE, 20).totalWinCents).toBe(324);
    expect(random.floatCalls).toBe(1);
    expect(random.integerCalls).toBe(32);
  });

  it("can place a cosmetic SWORD in a locked row only after a failed expansion roll", () => {
    const random = new ControlledRandomSource([0.99, 0], [7, ...Array.from({ length: 30 }, () => 0)]);
    const result = engine(random).playSpin(activeState());

    expect(result.expansion).toBeNull();
    expect(result.state).toMatchObject({ rows: 3, remainingSpins: 2, activeMultiplier: 1 });
    expect(result.spinBoard[1]?.[2]).toEqual({ kind: "bonus", symbol: "SWORD" });
    expect(result.winningPositions).toHaveLength(15);
    expect(result.winningPositions).not.toContainEqual({ row: 1, column: 2 });
    expect(random.floatCalls).toBe(2);
    expect(random.integerCalls).toBe(31);
  });

  it("uses decreasing expansion chances by stage", () => {
    expect(engine(new ControlledRandomSource([0.39])).playSpin(activeState()).expansion).toMatchObject({ destinationRows: 4 });
    expect(engine(new ControlledRandomSource([0.24])).playSpin(activeState({ rows: 4 })).expansion).toMatchObject({ destinationRows: 5 });
    expect(engine(new ControlledRandomSource([0.09])).playSpin(activeState({ rows: 5 })).expansion).toMatchObject({ destinationRows: 6 });
    expect(engine(new ControlledRandomSource([0.4, 0.99])).playSpin(activeState()).expansion).toBeNull();
  });

  it("does not roll expansion at six rows and applies the weighted final strike after its third spin", () => {
    const random = new ControlledRandomSource([], [...Array.from({ length: 90 }, () => 0), 99]);
    let state = activeState({ rows: 6, remainingSpins: 3, activeMultiplier: 2, accumulatedWinCents: 100 });

    state = engine(random).playSpin(state).state;
    state = engine(random).playSpin(state).state;
    const result = engine(random).playSpin(state);

    expect(result).toMatchObject({ complete: true, finalStrikeMultiplier: 25, finalPayoutCents: 200_000 });
    expect(result.state).toMatchObject({ remainingSpins: 0, accumulatedWinCents: 93_412, finalPayoutCents: 200_000 });
    expect(random.floatCalls).toBe(0);
    expect(random.integerCalls).toBe(91);
    expect(engine().summarize(result.state)).toEqual({
      kind: "sword",
      spinsPlayed: 3,
      payoutCents: 200_000,
      reachedFinalStage: true,
      finalStrikeMultiplier: 25,
    });
  });

  it("ends without a final strike when three spins expire below six rows", () => {
    const random = new ControlledRandomSource([0.99, 0.99, 0.99, 0.99, 0.99, 0.99], Array.from({ length: 90 }, () => 0));
    let state = activeState({ remainingSpins: 3, accumulatedWinCents: 40 });

    state = engine(random).playSpin(state).state;
    state = engine(random).playSpin(state).state;
    const result = engine(random).playSpin(state);

    expect(result).toMatchObject({ complete: true, finalStrikeMultiplier: null, finalPayoutCents: 1_498 });
    expect(random.floatCalls).toBe(6);
    expect(random.integerCalls).toBe(90);
  });

  it("rejects a triggering bet that cannot pay exact tenths", () => {
    expect(() => engine().start(21)).toThrow("Triggering bet must be divisible by 10 cents");
  });
});
