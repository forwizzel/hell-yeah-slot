import { describe, expect, it } from "vitest";
import {
  REEL_LOCK_SOUND_PREROLL_MS,
  reelLockFlashAlpha,
  reelLockImpactDurationMs,
  reelLockImpactOffset,
} from "../presentation/ReelLockImpact";

describe("reel lock impact", () => {
  it("uses a damped overshoot, recoil, and return to rest", () => {
    expect(reelLockImpactOffset(0)).toBe(8);
    expect(reelLockImpactOffset(0.25)).toBe(-3);
    expect(reelLockImpactOffset(0.6)).toBe(1.5);
    expect(reelLockImpactOffset(1)).toBe(0);
  });

  it("fades the impact flash and keeps a visible Turbo response", () => {
    expect(reelLockFlashAlpha(0)).toBe(0.42);
    expect(reelLockFlashAlpha(1)).toBe(0);
    expect(reelLockImpactDurationMs(false)).toBe(120);
    expect(reelLockImpactDurationMs(true)).toBe(72);
    expect(REEL_LOCK_SOUND_PREROLL_MS).toBe(28);
  });
});
