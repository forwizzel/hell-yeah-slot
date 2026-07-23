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
  it("does not include COIN or SKULL in its board symbol weights", () => {
    expect(SWORD_CONFIG.boardSymbols.map(({ symbol }) => symbol)).not.toContain("COIN");
    expect(SWORD_CONFIG.boardSymbols.map(({ symbol }) => symbol)).not.toContain("SKULL");
  });

  it("starts at three rows, three spins, and a x1 active multiplier", () => {
    expect(engine().start(20)).toEqual(activeState());
  });

  it("draws a no-blank board and pays it with the active multiplier", () => {
    const random = new ControlledRandomSource([0.99], Array.from({ length: 15 }, () => 0));
    const result = engine(random).playSpin(activeState({ activeMultiplier: 3 }));

    expect(result.baseWinCents).toBe(486);
    expect(result.spinWinCents).toBe(1_458);
    expect(result.spinBoard).toHaveLength(3);
    expect(result.spinBoard.flat().every((cell) => cell.kind === "card" && cell.symbol === "10")).toBe(true);
    expect(result.winningPositions).toHaveLength(15);
    expect(result.state.board).toHaveLength(3);
    expect(result.state.board.flat().every((cell) => cell.kind === "card" && cell.symbol === "10")).toBe(true);
    expect(random.floatCalls).toBe(1);
    expect(random.integerCalls).toBe(15);
  });

  it("replaces a drawn symbol with SWORD, reveals a populated expansion row, and resets spins", () => {
    const random = new ControlledRandomSource([0], [
      7,
      ...Array.from({ length: 15 }, () => 0),
      3,
      ...Array.from({ length: 5 }, () => 0),
    ]);
    const result = engine(random).playSpin(activeState({ activeMultiplier: 4 }));

    expect(result).toMatchObject({
      baseWinCents: 324,
      spinWinCents: 1_296,
      expansion: {
        position: { row: 1, column: 2 },
        destinationRows: 4,
        destinationMultiplier: 8,
      },
    });
    expect(result.state).toMatchObject({ rows: 4, remainingSpins: 3, activeMultiplier: 8 });
    expect(result.spinBoard[1]?.[2]).toEqual({ kind: "bonus", symbol: "SWORD" });
    expect(result.winningPositions).toHaveLength(14);
    expect(result.winningPositions).not.toContainEqual({ row: 1, column: 2 });
    expect(result.spinBoard).toHaveLength(3);
    expect(result.state.board).toHaveLength(4);
    expect(result.state.board[3]).toEqual([
      { kind: "card", symbol: "10" },
      { kind: "card", symbol: "10" },
      { kind: "card", symbol: "10" },
      { kind: "card", symbol: "10" },
      { kind: "card", symbol: "10" },
    ]);
    expect(result.state.board.flat().some((cell) => cell.kind === "blank")).toBe(false);
    expect(evaluateWays(result.spinBoard, SWORD_PAYTABLE, 20).totalWinCents).toBe(324);
    expect(random.floatCalls).toBe(1);
    expect(random.integerCalls).toBe(22);
  });

  it("uses decreasing expansion chances by stage", () => {
    expect(engine(new ControlledRandomSource([0.39])).playSpin(activeState()).expansion).toMatchObject({ destinationRows: 4 });
    expect(engine(new ControlledRandomSource([0.24])).playSpin(activeState({ rows: 4 })).expansion).toMatchObject({ destinationRows: 5 });
    expect(engine(new ControlledRandomSource([0.09])).playSpin(activeState({ rows: 5 })).expansion).toMatchObject({ destinationRows: 6 });
    expect(engine(new ControlledRandomSource([0.4])).playSpin(activeState()).expansion).toBeNull();
  });

  it("does not roll expansion at six rows and applies the weighted final strike after its third spin", () => {
    const random = new ControlledRandomSource([], [...Array.from({ length: 90 }, () => 0), 99]);
    let state = activeState({ rows: 6, remainingSpins: 3, activeMultiplier: 2, accumulatedWinCents: 100 });

    state = engine(random).playSpin(state).state;
    state = engine(random).playSpin(state).state;
    const result = engine(random).playSpin(state);

    expect(result).toMatchObject({ complete: true, finalStrikeMultiplier: 100, finalPayoutCents: 9_341_200 });
    expect(result.state).toMatchObject({ remainingSpins: 0, accumulatedWinCents: 93_412, finalPayoutCents: 9_341_200 });
    expect(random.floatCalls).toBe(0);
    expect(random.integerCalls).toBe(91);
    expect(engine().summarize(result.state)).toEqual({
      kind: "sword",
      spinsPlayed: 3,
      payoutCents: 9_341_200,
      reachedFinalStage: true,
      finalStrikeMultiplier: 100,
    });
  });

  it("ends without a final strike when three spins expire below six rows", () => {
    const random = new ControlledRandomSource([0.99, 0.99, 0.99], Array.from({ length: 45 }, () => 0));
    let state = activeState({ remainingSpins: 3, accumulatedWinCents: 40 });

    state = engine(random).playSpin(state).state;
    state = engine(random).playSpin(state).state;
    const result = engine(random).playSpin(state);

    expect(result).toMatchObject({ complete: true, finalStrikeMultiplier: null, finalPayoutCents: 1_498 });
    expect(random.floatCalls).toBe(3);
    expect(random.integerCalls).toBe(45);
  });

  it("rejects a triggering bet that cannot pay exact tenths", () => {
    expect(() => engine().start(21)).toThrow("Triggering bet must be divisible by 10 cents");
  });
});
