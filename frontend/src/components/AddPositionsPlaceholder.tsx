import { Loader2 } from 'lucide-react';
import SectionCard from './SectionCard';

type AddPositionsStatus = 'waiting' | 'loading' | 'error';

interface AddPositionsPlaceholderProps {
  status: AddPositionsStatus;
  symbol: string;
}

export default function AddPositionsPlaceholder({ status, symbol }: AddPositionsPlaceholderProps) {
  return (
    <SectionCard step={2} label="Add Positions" title="Capture the legs" quiet>
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
    </SectionCard>
  );
}
