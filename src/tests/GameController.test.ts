import { describe, expect, it } from "vitest";
import { GameController } from "../core/GameController";
import type { SpinResult } from "../core/types";
import type { GameSoundEffect } from "../presentation/GameAudio";
import type { GameView } from "../presentation/GameView";

describe("GameController Turbo transitions", () => {
  it("keeps Turbo enabled through a qualifying spin and disables it before its feature", async () => {
    const events: string[] = [];
    let turboEnabled = true;
    const view = {
      bindControls: () => undefined,
      render: () => undefined,
      addLog: () => undefined,
      playSound: () => undefined,
      animateBaseSpin: async (_grid: unknown, turbo: boolean) => { events.push(`spin:${turbo}`); },
      isQuickSpinEnabled: () => turboEnabled,
      setQuickSpinEnabled: (enabled: boolean) => {
        turboEnabled = enabled;
        events.push(`turbo:${enabled}`);
      },
      wait: async () => undefined,
    } as unknown as GameView;
    const controller = new GameController(view);
    const internals = controller as unknown as {
      spin: () => Promise<void>;
      createPaidSpinResult: () => SpinResult;
      playFreeSpins: () => Promise<void>;
    };
    const grid = Array.from({ length: 3 }, () =>
      Array.from({ length: 5 }, () => ({ kind: "card" as const, symbol: "10" as const })),
    );
    internals.createPaidSpinResult = () => ({
      grid,
      regularWinCents: 0,
      bonusTrigger: {
        kind: "free-spins",
        mode: "beer",
        startingSpins: 10,
        beer: { symbol: "BEER", symbolCount: 3, positions: [] },
        cigarette: null,
      },
      winningPositions: [],
      winningWins: [],
    });
    internals.playFreeSpins = async () => { events.push("feature"); };

    await internals.spin();

    expect(events).toEqual(["spin:true", "turbo:false", "feature"]);
  });
});

describe("GameController feature audio", () => {
  it("plays the combination stinger after a combined triggering spin settles", async () => {
    const events: string[] = [];
    const view = {
      bindControls: () => undefined,
      render: () => undefined,
      addLog: () => undefined,
      playSound: (effect: GameSoundEffect) => { events.push(`sound:${effect}`); },
      animateBaseSpin: async () => { events.push("spin-settled"); },
      isQuickSpinEnabled: () => false,
      wait: async () => undefined,
    } as unknown as GameView;
    const controller = new GameController(view);
    const internals = controller as unknown as {
      playTriggeringSpin: (result: SpinResult, triggeringBetCents: number, startLog: string) => Promise<void>;
    };
    const grid = Array.from({ length: 3 }, () =>
      Array.from({ length: 5 }, () => ({ kind: "card" as const, symbol: "10" as const })),
    );

    await internals.playTriggeringSpin({
      grid,
      regularWinCents: 0,
      bonusTrigger: {
        kind: "free-spins",
        mode: "combined",
        startingSpins: 10,
        beer: { symbol: "BEER", symbolCount: 3, positions: [] },
        cigarette: { symbol: "CIGARETTE", symbolCount: 2, positions: [] },
      },
      winningPositions: [],
      winningWins: [],
    }, 20, "Combined spin started.");

    expect(events).toEqual(["sound:spin", "spin-settled", "sound:win-combination"]);
  });
});
