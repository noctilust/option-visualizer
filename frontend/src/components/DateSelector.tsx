import { Calendar, RotateCcw } from 'lucide-react';

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

  // Calculate preset buttons
  const presets = [
    { label: 'Today', days: 0 },
    { label: '1 Week', days: 7 },
    { label: '2 Weeks', days: 14 },
    { label: '1 Month', days: 30 },
    { label: 'Expiration', days: null },
  ].filter(preset => preset.days === null || preset.days <= maxDaysToExpiration);

  // Get display text for current selection
  const getDisplayText = () => {
    if (evalDaysFromNow === null) {
      return 'At Expiration';
    }
    if (evalDaysFromNow === 0) {
      return 'Today (Theoretical)';
    }
    if (evalDaysFromNow === 1) {
      return '1 day from now';
    }
    return `${evalDaysFromNow} days from now`;
  };

  // Calculate what date the slider represents
  const getDatePreview = () => {
    if (evalDaysFromNow === null) {
      return 'Intrinsic value at expiration';
    }
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + evalDaysFromNow);
    return futureDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-muted/30 rounded-lg p-4 border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          <span className="text-sm font-medium">P/L Evaluation Date</span>
        </div>
        <button
          onClick={() => setEvalDaysFromNow(null)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          title="Reset to expiration"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Current selection display */}
      <div className="mb-4 text-center">
        <div className="text-lg font-semibold text-foreground">
          {getDisplayText()}
        </div>
        <div className="text-xs text-muted-foreground">
          {getDatePreview()}
        </div>
      </div>

      {/* Slider */}
      <div className="mb-4">
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
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Today</span>
          <span>{maxDaysToExpiration} days (Exp)</span>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => setEvalDaysFromNow(preset.days)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              (preset.days === evalDaysFromNow) ||
              (preset.days === null && evalDaysFromNow === null)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Explanation */}
      <p className="text-xs text-muted-foreground mt-3">
        {evalDaysFromNow === null
          ? 'Showing intrinsic P/L at expiration (no time value)'
          : 'Showing theoretical P/L including remaining time value'
        }
      </p>
    </div>
  );
}
