import { afterEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../presentation/GameView";

interface LargeWinViewDouble {
  audio: { play: ReturnType<typeof vi.fn> };
  featureMultiplier: { textContent: string };
  largeWinSkip: (() => void) | null;
  playLargeWinCount(payoutCents: number, durationMs: number): Promise<void>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GameView large-win audio", () => {
  it("loops the count sound until the final payout is dismissed", async () => {
    const stopCountWin = vi.fn();
    const scheduled = { animationFrame: null as FrameRequestCallback | null };
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      scheduled.animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const view = Object.assign(Object.create(GameView.prototype), {
      audio: { play: vi.fn(() => stopCountWin) },
      featureMultiplier: { textContent: "" },
      largeWinSkip: null,
    }) as LargeWinViewDouble;

    const count = view.playLargeWinCount(1_000, 100);

    expect(view.audio.play).toHaveBeenCalledWith("count-win", true);
    if (scheduled.animationFrame === null) {
      throw new Error("Expected a count-up animation frame");
    }
    scheduled.animationFrame(100);
    expect(stopCountWin).not.toHaveBeenCalled();
    expect(view.largeWinSkip).not.toBeNull();

    if (view.largeWinSkip === null) {
      throw new Error("Expected a large-win dismissal handler");
    }
    view.largeWinSkip();

    await expect(count).resolves.toBeUndefined();
    expect(stopCountWin).toHaveBeenCalledOnce();
  });
});
