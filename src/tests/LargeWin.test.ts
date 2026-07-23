import { describe, expect, it } from "vitest";
import { getLargeWinTier } from "../presentation/LargeWin";

describe("getLargeWinTier", () => {
  const betCents = 100;

  it.each([
    [499, null],
    [500, "BIG WIN!"],
    [999, "BIG WIN!"],
    [1_000, "HUGE WIN!"],
    [2_499, "HUGE WIN!"],
    [2_500, "SUPER WIN!"],
    [4_999, "SUPER WIN!"],
    [5_000, "HELL YEAH!"],
  ] as const)("classifies a %i-cent payout", (payoutCents, label) => {
    expect(getLargeWinTier(payoutCents, betCents)?.label ?? null).toBe(label);
  });

  it("rejects invalid monetary inputs", () => {
    expect(() => getLargeWinTier(-1, betCents)).toThrow("safe positive integer cents");
    expect(() => getLargeWinTier(500, 0)).toThrow("safe positive integer cents");
  });
});
