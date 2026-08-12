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

export function formatCompactUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("USD amount must be a safe integer number of cents");
  }

  const sign = cents < 0 ? "-" : "";
  const dollars = Math.abs(cents) / 100;
  if (dollars < 1_000_000) {
    return formatUsd(cents);
  }

  const units: ReadonlyArray<readonly [number, string]> = [
    [1_000_000_000_000, "T"],
    [1_000_000_000, "B"],
    [1_000_000, "M"],
  ];
  const unit = units.find(([threshold]) => dollars >= threshold);
  if (unit === undefined) {
    return formatUsd(cents);
  }
  const [threshold, suffix] = unit;
  const value = dollars / threshold;
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${sign}$${value.toFixed(precision).replace(/\.0+$/, "")}${suffix}`;
}
