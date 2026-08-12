import { describe, expect, it, vi } from "vitest";
import { GameController } from "../core/GameController";
import type { AutoSpinViewState, GameViewModel, SpinResult } from "../core/types";
import type { ControlActions } from "../presentation/ControlPanel";
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

describe("GameController Auto Spin", () => {
  it("runs the selected number of paid spins at the selected bet", async () => {
    const harness = createAutoSpinHarness(() => noWinSpinResult());

    harness.actions.startAutoSpin(20, 3);

    await vi.waitFor(() => expect(harness.logs).toContain("Auto Spin complete."));
    expect(harness.spinCount()).toBe(3);
    expect(harness.latestModel().betCents).toBe(20);
    expect(harness.latestAutoSpin()).toMatchObject({
      active: false,
      remainingSpins: 0,
      status: "Auto Spin complete.",
    });
  });

  it("stops after the current paid spin when requested", async () => {
    let settleSpin = (): void => { throw new Error("Expected an active auto spin"); };
    const harness = createAutoSpinHarness(
      () => noWinSpinResult(),
      () => new Promise<void>((resolve) => { settleSpin = resolve; }),
    );

    harness.actions.startAutoSpin(20, 3);
    await vi.waitFor(() => expect(harness.spinCount()).toBe(1));
    harness.actions.stopAutoSpin();
    settleSpin();

    await vi.waitFor(() => expect(harness.latestAutoSpin().active).toBe(false));
    expect(harness.spinCount()).toBe(1);
    expect(harness.latestAutoSpin()).toMatchObject({
      remainingSpins: 2,
      status: "Stopped with 2 spins remaining.",
    });
  });

  it("stops after a bonus-triggering paid spin", async () => {
    const harness = createAutoSpinHarness(() => ({
      ...noWinSpinResult(),
      bonusTrigger: { kind: "sword", positions: [] },
    }));
    const internals = harness.controller as unknown as {
      playResolvedFeature: () => Promise<void>;
    };
    internals.playResolvedFeature = async () => undefined;

    harness.actions.startAutoSpin(20, 10);

    await vi.waitFor(() => expect(harness.latestAutoSpin().active).toBe(false));
    expect(harness.spinCount()).toBe(1);
    expect(harness.latestAutoSpin()).toMatchObject({
      remainingSpins: 9,
      status: "Bonus triggered. Auto Spin stopped.",
    });
  });

  it("continues through base-game large wins", async () => {
    const largeWinCalls: boolean[] = [];
    const harness = createAutoSpinHarness(() => ({
      ...noWinSpinResult(),
      regularWinCents: 100,
    }), undefined, (autoDismiss) => { largeWinCalls.push(autoDismiss); });

    harness.actions.startAutoSpin(20, 2);

    await vi.waitFor(() => expect(harness.logs).toContain("Auto Spin complete."));
    expect(harness.spinCount()).toBe(2);
    expect(largeWinCalls).toEqual([true, true]);
  });

  it("rejects invalid counts, bets, and unaffordable bets", () => {
    const harness = createAutoSpinHarness(() => noWinSpinResult());

    harness.actions.startAutoSpin(21, 10);
    expect(harness.latestAutoSpin().status).toBe("Select a valid bet.");

    harness.actions.startAutoSpin(20, 1_001);
    expect(harness.latestAutoSpin().status).toBe("Choose 1 to 1,000 spins.");

    const internals = harness.controller as unknown as { state: { balanceCents: number } };
    internals.state.balanceCents = 10;
    harness.actions.startAutoSpin(20, 10);
    expect(harness.latestAutoSpin().status).toBe("Balance is too low for the selected bet.");
    expect(harness.spinCount()).toBe(0);
  });
});

function createAutoSpinHarness(
  result: () => SpinResult,
  animateBaseSpin: (() => Promise<void>) | undefined = undefined,
  onLargeWin: ((autoDismiss: boolean) => void) | undefined = undefined,
): {
  readonly controller: GameController;
  readonly actions: ControlActions;
  readonly logs: string[];
  readonly spinCount: () => number;
  readonly latestModel: () => GameViewModel;
  readonly latestAutoSpin: () => AutoSpinViewState;
} {
  let actions: ControlActions | null = null;
  let spins = 0;
  const logs: string[] = [];
  const renders: Array<readonly [GameViewModel, AutoSpinViewState]> = [];
  const view = {
    bindControls: (boundActions: ControlActions) => { actions = boundActions; },
    render: (model: GameViewModel, autoSpin: AutoSpinViewState) => { renders.push([model, autoSpin]); },
    addLog: (message: string) => { logs.push(message); },
    playSound: () => undefined,
    animateBaseSpin: async () => {
      spins += 1;
      await animateBaseSpin?.();
    },
    isQuickSpinEnabled: () => false,
    setQuickSpinEnabled: () => undefined,
    wait: async () => undefined,
    playLargeWinCount: async (_payout: number, _duration: number, autoDismiss: boolean) => {
      onLargeWin?.(autoDismiss);
    },
  } as unknown as GameView;
  const controller = new GameController(view);
  const internals = controller as unknown as { createPaidSpinResult: () => SpinResult };
  internals.createPaidSpinResult = result;
  if (actions === null) {
    throw new Error("Expected controls to be bound");
  }
  const latestRender = (): readonly [GameViewModel, AutoSpinViewState] => {
    const render = renders.at(-1);
    if (render === undefined) {
      throw new Error("Expected the controller to render");
    }
    return render;
  };
  return {
    controller,
    actions,
    logs,
    spinCount: () => spins,
    latestModel: () => latestRender()[0],
    latestAutoSpin: () => latestRender()[1],
  };
}

function noWinSpinResult(): SpinResult {
  return {
    grid: Array.from({ length: 3 }, () =>
      Array.from({ length: 5 }, () => ({ kind: "card" as const, symbol: "10" as const })),
    ),
    regularWinCents: 0,
    bonusTrigger: { kind: "none" },
    winningPositions: [],
    winningWins: [],
  };
}
