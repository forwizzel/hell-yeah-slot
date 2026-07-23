export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("USD amount must be a safe integer number of cents");
  }

  const absoluteCents = Math.abs(cents);
  const dollars = Math.floor(absoluteCents / 100);
  const groupedDollars = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(absoluteCents % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${groupedDollars}.${fraction}`;
}
