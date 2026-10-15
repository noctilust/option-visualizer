import { Activity } from 'lucide-react';
import HelpTooltip from './HelpTooltip';
import { useStore, type Store } from '../utils/store';

interface IvScenarioControlProps {
  ivShiftPct: number;
  setIvShiftPct: (pct: number) => void;
  /** Live slider value; the chart previews it while the recalculation is pending */
  previewStore: Store<number>;
}

const PRESETS = [-50, -30, 0, 30];
const MIN_SHIFT = -80;
const MAX_SHIFT = 100;

function label(pct: number): string {
  if (pct === 0) return 'Current IV';
  return `IV ${pct > 0 ? '+' : ''}${pct}%`;
}

export default function IvScenarioControl({ ivShiftPct, setIvShiftPct, previewStore }: IvScenarioControlProps) {
  const draft = useStore(previewStore);

  // The exact recalculation is requested once the slider is released
  const commit = () => {
    if (previewStore.get() !== ivShiftPct) setIvShiftPct(previewStore.get());
  };

  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <Activity size={14} className="text-muted-foreground" />
          <HelpTooltip term="iv-shift">
            <span className="text-sm font-medium">IV Scenario:</span>
          </HelpTooltip>
          <span
            className={`text-sm font-semibold tabular-nums ${draft < 0 ? 'text-positive' : draft > 0 ? 'text-negative' : 'text-foreground'}`}
          >
            {label(draft)}
          </span>
        </div>

        <div className="flex-1 min-w-[120px]">
          <input
            type="range"
            min={MIN_SHIFT}
            max={MAX_SHIFT}
            step={5}
            value={draft}
            aria-label="Implied volatility change"
            onChange={(e) => previewStore.set(parseInt(e.target.value, 10))}
            onMouseUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <div className="segmented shrink-0" role="group" aria-label="IV scenario presets">
          {PRESETS.map(pct => (
            <button
              key={pct}
              type="button"
              className="segmented-item"
              aria-pressed={draft === pct}
              onClick={() => setIvShiftPct(pct)}
            >
              {pct === 0 ? 'Now' : `${pct > 0 ? '+' : ''}${pct}%`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
