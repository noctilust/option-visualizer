import { useState } from 'react';
import toast from 'react-hot-toast';
import { Crosshair, Loader2 } from 'lucide-react';
import type { Position, SkewDataPoint } from '../types';
import { getSkewData } from '../hooks/useVolatilitySkew';
import { parsePositionExpiration } from '../utils/expiration';
import { retargetShortStrikes } from '../utils/deltaStrikes';

interface DeltaStrikePickerProps {
  symbol: string;
  positions: Position[];
  setPositions: React.Dispatch<React.SetStateAction<Position[]>>;
}

const DELTA_TARGETS = [10, 16, 20, 30];

function strikesKey(positions: Position[]): string {
  return positions.map(p => `${p.id}:${p.strike}:${p.type}:${p.expiration}`).join('|');
}

export default function DeltaStrikePicker({ symbol, positions, setPositions }: DeltaStrikePickerProps) {
  const [pendingDelta, setPendingDelta] = useState<number | null>(null);
  // The applied delta stays highlighted only while the legs still match what it produced
  const [applied, setApplied] = useState<{ delta: number; key: string } | null>(null);
  const selectedDelta = applied && applied.key === strikesKey(positions) ? applied.delta : null;

  const shortExpirations = [...new Set(positions.filter(p => p.qty < 0).map(p => p.expiration))];
  if (!symbol.trim() || shortExpirations.length === 0) return null;

  const applyDelta = async (deltaPct: number) => {
    setPendingDelta(deltaPct);
    try {
      const pointsByExpiration: Record<string, SkewDataPoint[]> = {};
      await Promise.all(shortExpirations.map(async (expiration) => {
        const iso = parsePositionExpiration(expiration);
        if (!iso) return;
        const skew = await getSkewData(symbol, iso);
        pointsByExpiration[expiration] = skew.points;
      }));

      if (Object.keys(pointsByExpiration).length === 0) {
        toast.error('Could not read the expiration dates of the short legs');
        return;
      }

      const { positions: retargeted, changed } = retargetShortStrikes(positions, pointsByExpiration, deltaPct / 100);
      if (changed > 0) setPositions(retargeted);
      setApplied({ delta: deltaPct, key: strikesKey(retargeted) });
      toast.success(changed > 0 ? `Short strikes moved to ~${deltaPct}Δ` : `Short strikes are already at ~${deltaPct}Δ`);
    } catch (err) {
      console.error('Delta strike selection failed:', err);
      toast.error(err instanceof Error ? err.message : 'Could not load option deltas');
    } finally {
      setPendingDelta(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-sm" data-testid="delta-strike-picker">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Crosshair size={14} aria-hidden="true" />
        Set short strikes by delta:
      </span>
      <div className="segmented" role="group" aria-label="Short strike delta targets">
        {DELTA_TARGETS.map(delta => (
          <button
            key={delta}
            type="button"
            className="segmented-item"
            disabled={pendingDelta !== null}
            aria-pressed={selectedDelta === delta}
            aria-label={`Move short strikes to ${delta} delta`}
            onClick={() => applyDelta(delta)}
          >
            {pendingDelta === delta ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : `${delta}Δ`}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Long legs keep their spread width.</span>
    </div>
  );
}
