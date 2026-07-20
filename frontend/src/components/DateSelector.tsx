import { Calendar } from 'lucide-react';

interface DateSelectorProps {
  evalDaysFromNow: number | null;
  setEvalDaysFromNow: (days: number | null) => void;
  maxDaysToExpiration: number | null;
}

export default function DateSelector({
  evalDaysFromNow,
  setEvalDaysFromNow,
  maxDaysToExpiration,
}: DateSelectorProps) {
  // If no max days available, don't render
  if (maxDaysToExpiration === null || maxDaysToExpiration <= 0) {
    return null;
  }

  // Calculate preset buttons - shorter labels for compact design
  const presets = [
    { label: 'Today', days: 0 },
    { label: '1W', days: 7 },
    { label: '2W', days: 14 },
    { label: '1M', days: 30 },
    { label: 'Exp', days: null },
  ].filter(preset => preset.days === null || preset.days <= maxDaysToExpiration);

  // Get short display text for current selection
  const getDisplayText = () => {
    if (evalDaysFromNow === null) {
      return 'Expiration';
    }
    if (evalDaysFromNow === 0) {
      return 'Today';
    }
    return `+${evalDaysFromNow}d`;
  };

  // Calculate what date the slider represents
  const getDatePreview = () => {
    if (evalDaysFromNow === null) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + maxDaysToExpiration);
      return expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + evalDaysFromNow);
    return futureDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border">
      {/* Single row: Label + Current Value | Slider | Presets */}
      <div className="flex items-center gap-4">
        {/* Label and current value */}
        <div className="flex items-center gap-2 shrink-0">
          <Calendar size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">P/L Date:</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {getDisplayText()}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            ({getDatePreview()})
          </span>
        </div>

        {/* Slider - grows to fill space */}
        <div className="flex-1 min-w-[120px]">
          <input
            type="range"
            min="0"
            max={maxDaysToExpiration}
            value={evalDaysFromNow ?? maxDaysToExpiration}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (value === maxDaysToExpiration) {
                setEvalDaysFromNow(null);
              } else {
                setEvalDaysFromNow(value);
              }
            }}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Preset buttons */}
        <div className="segmented shrink-0" role="group" aria-label="Date presets">
          {presets.map((preset) => {
            const isSelected = (preset.days === evalDaysFromNow) ||
              (preset.days === null && evalDaysFromNow === null);
            const ariaLabel = preset.days === null
              ? 'Show P/L at expiration'
              : preset.days === 0
                ? 'Show P/L today'
                : `Show P/L in ${preset.days} days`;

            return (
              <button
                key={preset.label}
                type="button"
                className="segmented-item"
                onClick={() => setEvalDaysFromNow(preset.days)}
                aria-pressed={isSelected}
                aria-label={ariaLabel}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
