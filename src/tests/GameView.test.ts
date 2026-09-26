import { afterEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../presentation/GameView";

interface LargeWinViewDouble {
  audio: {
    play: ReturnType<typeof vi.fn>;
    suppressSoundtrack: ReturnType<typeof vi.fn>;
  };
  featureMultiplier: { textContent: string };
  largeWinContinueButton: { hidden: boolean };
  focusOverlayAction: ReturnType<typeof vi.fn>;
  largeWinSkip: (() => void) | null;
  playLargeWinCount(payoutCents: number, durationMs: number, autoDismiss?: boolean): Promise<void>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GameView large-win audio", () => {
  it("loops the count sound until the final payout is dismissed", async () => {
    const stopCountWin = vi.fn();
    const restoreSoundtrack = vi.fn();
    const scheduled = { animationFrame: null as FrameRequestCallback | null };
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled.animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const view = Object.assign(Object.create(GameView.prototype), {
      audio: {
        play: vi.fn(() => stopCountWin),
        suppressSoundtrack: vi.fn(() => restoreSoundtrack),
      },
      featureMultiplier: { textContent: "" },
      largeWinContinueButton: { hidden: true },
      focusOverlayAction: vi.fn(),
      largeWinSkip: null,
    }) as LargeWinViewDouble;

    const count = view.playLargeWinCount(1_000, 100);

    expect(view.audio.play).toHaveBeenCalledWith("count-win", true);
    expect(view.audio.suppressSoundtrack).toHaveBeenCalledOnce();
    if (scheduled.animationFrame === null) {
      throw new Error("Expected a count-up animation frame");
    }
    scheduled.animationFrame(100);
    expect(stopCountWin).not.toHaveBeenCalled();
    expect(view.largeWinSkip).not.toBeNull();
    expect(view.largeWinContinueButton.hidden).toBe(false);
    expect(view.focusOverlayAction).toHaveBeenCalledWith(view.largeWinContinueButton);

    if (view.largeWinSkip === null) {
      throw new Error("Expected a large-win dismissal handler");
    }
    view.largeWinSkip();

    await expect(count).resolves.toBeUndefined();
    expect(stopCountWin).toHaveBeenCalledOnce();
    expect(restoreSoundtrack).toHaveBeenCalledOnce();
  });

  it("dismisses the completed count automatically during Auto Spin", async () => {
    const stopCountWin = vi.fn();
    const restoreSoundtrack = vi.fn();
    const scheduled = { animationFrame: null as FrameRequestCallback | null };
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled.animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const view = Object.assign(Object.create(GameView.prototype), {
      audio: {
        play: vi.fn(() => stopCountWin),
        suppressSoundtrack: vi.fn(() => restoreSoundtrack),
      },
      featureMultiplier: { textContent: "" },
      largeWinContinueButton: { hidden: true },
      focusOverlayAction: vi.fn(),
      largeWinSkip: null,
    }) as LargeWinViewDouble;

    const count = view.playLargeWinCount(1_000, 100, true);
    if (scheduled.animationFrame === null) {
      throw new Error("Expected a count-up animation frame");
    }
    scheduled.animationFrame(100);

    await expect(count).resolves.toBeUndefined();
    expect(stopCountWin).toHaveBeenCalledOnce();
    expect(restoreSoundtrack).toHaveBeenCalledOnce();
    expect(view.largeWinSkip).toBeNull();
    expect(view.largeWinContinueButton.hidden).toBe(true);
    expect(view.focusOverlayAction).not.toHaveBeenCalled();
  });

  it("shows the final payout without a count-up when reduced motion is preferred", async () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const view = Object.assign(Object.create(GameView.prototype), {
      audio: { play: vi.fn(), suppressSoundtrack: vi.fn() },
      featureMultiplier: { textContent: "" },
      largeWinContinueButton: { hidden: true },
      focusOverlayAction: vi.fn(),
      largeWinSkip: null,
    }) as LargeWinViewDouble;

    const count = view.playLargeWinCount(1_000, 3_000);

    expect(view.featureMultiplier.textContent).toBe("$10.00");
    expect(view.audio.play).not.toHaveBeenCalled();
    expect(view.largeWinContinueButton.hidden).toBe(false);
    view.largeWinSkip?.();
    await expect(count).resolves.toBeUndefined();
  });
});

describe("GameView overlay focus", () => {
  it("restores focus after an interactive overlay closes", () => {
    const documentDouble: { activeElement: FakeElement | null } = { activeElement: null };
    class FakeElement {
      isConnected = true;
      disabled = false;
      tabIndex = 0;
      focus(): void { documentDouble.activeElement = this; }
      closest(): null { return null; }
      matches(): boolean { return this.disabled; }
    }
    const previous = new FakeElement();
    const action = new FakeElement();
    documentDouble.activeElement = previous;
    vi.stubGlobal("document", documentDouble);
    vi.stubGlobal("HTMLElement", FakeElement);
    const view = Object.assign(Object.create(GameView.prototype), {
      focusedOverlayAction: null,
      focusBeforeOverlay: null,
    }) as {
      focusOverlayAction(button: FakeElement): void;
      restoreOverlayFocus(): void;
    };

    view.focusOverlayAction(action);
    expect(documentDouble.activeElement).toBe(action);
    view.restoreOverlayFocus();
    expect(documentDouble.activeElement).toBe(previous);
  });
});
