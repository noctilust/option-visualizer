import { useRef } from 'react';
import { DollarSign } from 'lucide-react';
import HelpTooltip from './HelpTooltip';

interface InputSectionProps {
  credit: string;
  setCredit: (value: string) => void;
  isDebit: boolean;
  setIsDebit: (value: boolean) => void;
}

export default function InputSection({ credit, setCredit, isDebit, setIsDebit }: InputSectionProps) {
  const ignoreMouseUp = useRef(false);

  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border">
      {/* Single row: Label | Input | Credit/Debit toggle */}
      <div className="flex items-center gap-4">
        {/* Label - fixed width to prevent input field shifting */}
        <div className="flex items-center gap-2 shrink-0 w-[160px]">
          <DollarSign size={14} className="text-muted-foreground" />
          <HelpTooltip term={isDebit ? 'debit' : 'credit'}>
            <span className="text-sm font-medium whitespace-nowrap">
              {isDebit ? 'Debit Paid:' : 'Credit Received:'}
            </span>
          </HelpTooltip>
        </div>

        {/* Input field - fixed width */}
        <div className="shrink-0 w-[100px]">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <span className="text-muted-foreground text-sm">$</span>
            </div>
            <input
              type="number"
              name="credit"
              id="credit"
              className={`block w-full pl-6 pr-3 py-1.5 text-sm tabular-nums rounded-md bg-card border border-input transition-colors duration-200 focus:outline-none ${isDebit ? 'text-negative' : 'text-positive'}`}
              placeholder="0.00"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              onFocus={(e) => {
                e.target.select();
                ignoreMouseUp.current = true;
              }}
              onMouseUp={(e) => {
                if (ignoreMouseUp.current) {
                  e.preventDefault();
                  ignoreMouseUp.current = false;
                }
              }}
            />
          </div>
        </div>

        {/* Credit/Debit toggle */}
        <div className="segmented shrink-0" role="group" aria-label="Position type">
          <button
            type="button"
            className="segmented-item"
            onClick={() => setIsDebit(false)}
            aria-pressed={!isDebit}
            aria-label="Credit received - money collected when opening position"
          >
            Credit
          </button>
          <button
            type="button"
            className="segmented-item"
            onClick={() => setIsDebit(true)}
            aria-pressed={isDebit}
            aria-label="Debit paid - money spent when opening position"
          >
            Debit
          </button>
        </div>
      </div>
    </div>
  );
}
