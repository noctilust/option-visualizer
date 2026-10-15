/** Whole-dollar amount; null/undefined means the value is unbounded. */
export function formatDollars(value: number | null | undefined, unlimitedLabel = 'Unlimited'): string {
  if (value === null || value === undefined) return unlimitedLabel;
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${value.toFixed(digits)}%`;
}
