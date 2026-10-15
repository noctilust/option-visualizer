import { describe, expect, it } from 'vitest';
import { parsePositionExpiration } from './expiration';

describe('parsePositionExpiration', () => {
  const now = new Date(2026, 9, 14); // Oct 14 2026

  it('uses the explicit two-digit year', () => {
    expect(parsePositionExpiration('Dec 19 25', now)).toBe('2025-12-19');
  });

  it('rolls a past month-day without a year into next year', () => {
    expect(parsePositionExpiration('Jan 16', now)).toBe('2027-01-16');
  });

  it('keeps an upcoming month-day in the current year', () => {
    expect(parsePositionExpiration('Nov 20', now)).toBe('2026-11-20');
  });

  it('rejects unparseable input', () => {
    expect(parsePositionExpiration('', now)).toBeNull();
    expect(parsePositionExpiration('2026-11-20', now)).toBeNull();
    expect(parsePositionExpiration('Foo 20', now)).toBeNull();
  });
});
