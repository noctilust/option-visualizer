const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse position expiration format (e.g., "Dec 19 25" or "Dec 19") to ISO date (YYYY-MM-DD)
 *
 * Handles year logic:
 * - If year is provided (e.g., "Dec 19 25"), use that year (2025)
 * - If no year (e.g., "Jan 16"), use current year
 * - If resulting date is in the past, increment to next year
 */
export function parsePositionExpiration(expiration: string, now: Date = new Date()): string | null {
  if (!expiration) return null;

  const parts = expiration.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const month = MONTHS[parts[0]];
  if (month === undefined) return null;

  const day = parseInt(parts[1], 10);
  if (Number.isNaN(day)) return null;

  const yearStr = parts[2] || now.getFullYear().toString().slice(-2);
  let year = 2000 + parseInt(yearStr, 10);
  if (Number.isNaN(year)) return null;

  if (new Date(year, month, day) < now && parts.length < 3) {
    year += 1;
  }

  return toIsoDate(year, month, day);
}
