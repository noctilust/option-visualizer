import type { Position, SkewDataPoint } from '../types';

function legDelta(point: SkewDataPoint, type: 'C' | 'P'): number | null {
  const delta = type === 'C' ? point.call_delta : point.put_delta;
  return delta === undefined || delta === null ? null : Math.abs(delta);
}

function nearestStrike(strikes: number[], target: number): number {
  return strikes.reduce((best, strike) =>
    Math.abs(strike - target) < Math.abs(best - target) ? strike : best,
  );
}

/**
 * Move every short leg to the strike whose |delta| is closest to `targetDelta`
 * (per expiration and option type). Long legs of the same expiration and type
 * shift by the same amount so spread widths are preserved.
 *
 * `pointsByExpiration` is keyed by the position's own expiration string.
 */
export function retargetShortStrikes(
  positions: Position[],
  pointsByExpiration: Record<string, SkewDataPoint[]>,
  targetDelta: number,
): { positions: Position[]; changed: number } {
  const offsets = new Map<string, number>();
  const shortTargets = new Map<string, number>();

  for (const type of ['C', 'P'] as const) {
    for (const [expiration, points] of Object.entries(pointsByExpiration)) {
      const candidates = points.filter(p => legDelta(p, type) !== null);
      if (!candidates.length) continue;

      const best = candidates.reduce((a, b) =>
        Math.abs(legDelta(b, type)! - targetDelta) < Math.abs(legDelta(a, type)! - targetDelta) ? b : a,
      );
      const groupKey = `${expiration}|${type}`;
      const firstShort = positions.find(p => p.qty < 0 && p.type === type && p.expiration === expiration);
      if (!firstShort) continue;

      shortTargets.set(groupKey, best.strike);
      offsets.set(groupKey, best.strike - firstShort.strike);
    }
  }

  let changed = 0;
  const updated = positions.map(pos => {
    const groupKey = `${pos.expiration}|${pos.type}`;
    const points = pointsByExpiration[pos.expiration];
    let strike = pos.strike;

    if (pos.qty < 0 && shortTargets.has(groupKey)) {
      strike = shortTargets.get(groupKey)!;
    } else if (pos.qty > 0 && offsets.has(groupKey) && points?.length) {
      strike = nearestStrike(points.map(p => p.strike), pos.strike + offsets.get(groupKey)!);
    }

    if (strike === pos.strike) return pos;
    changed += 1;
    return { ...pos, strike };
  });

  return { positions: updated, changed };
}
