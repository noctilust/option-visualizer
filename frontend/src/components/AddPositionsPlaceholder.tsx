import { Loader2 } from 'lucide-react';

type AddPositionsStatus = 'waiting' | 'loading' | 'error';

interface AddPositionsPlaceholderProps {
  status: AddPositionsStatus;
  symbol: string;
}

export default function AddPositionsPlaceholder({ status, symbol }: AddPositionsPlaceholderProps) {
  return (
    <div className="quiet-panel p-4 md:p-5">
      <p className="section-kicker mb-2">2. Add Positions</p>
      <h2 className="text-xl font-semibold mb-2 text-muted-foreground">Capture the legs</h2>
      {status === 'loading' ? (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading market data...</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {status === 'waiting'
            ? 'Enter a stock symbol above to continue'
            : `Unable to fetch market data for "${symbol}". Please try a different symbol.`}
        </p>
      )}
    </div>
  );
}
