import { safeMultiply } from "../math/safeInteger";

export interface LargeWinTier {
  readonly label: "BIG WIN!" | "HUGE WIN!" | "SUPER WIN!" | "HELL YEAH!";
  readonly minimumMultiplier: number;
}

const TIERS: readonly LargeWinTier[] = [
  { label: "HELL YEAH!", minimumMultiplier: 50 },
  { label: "SUPER WIN!", minimumMultiplier: 25 },
  { label: "HUGE WIN!", minimumMultiplier: 10 },
  { label: "BIG WIN!", minimumMultiplier: 5 },
];

export function getLargeWinTier(payoutCents: number, betCents: number): LargeWinTier | null {
  validateLargeWinAmounts(payoutCents, betCents);

  return TIERS.find((tier) => payoutCents >= safeMultiply(
    betCents,
    tier.minimumMultiplier,
    "Large-win threshold exceeds the safe integer range",
  )) ?? null;
}

export function formatLargeWinMultiplier(payoutCents: number, betCents: number): string {
  validateLargeWinAmounts(payoutCents, betCents);
  const multiplier = payoutCents / betCents;
  return Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
}

function validateLargeWinAmounts(payoutCents: number, betCents: number): void {
  if (!Number.isSafeInteger(payoutCents) || payoutCents < 0 || !Number.isSafeInteger(betCents) || betCents <= 0) {
    throw new RangeError("Large-win payout and bet must be safe positive integer cents");
  }
}
