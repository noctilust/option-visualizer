import { useRef } from 'react';
import { DollarSign } from 'lucide-react';
import HelpTooltip from './HelpTooltip';
import Button from './Button';

interface InputSectionProps {
  credit: string;
  setCredit: (value: string) => void;
  isDebit: boolean;
  setIsDebit: (value: boolean) => void;
}

export default function InputSection({ credit, setCredit, isDebit, setIsDebit }: InputSectionProps) {
  const ignoreMouseUp = useRef(false);

  return (
    <div className="bg-muted/30 rounded-lg px-4 py-3 border">
      {/* Single row: Label | Input | Credit/Debit toggle */}
      <div className="flex items-center gap-4">
        {/* Label - fixed width to prevent input field shifting */}
        <div className="flex items-center gap-2 shrink-0 w-[160px]">
          <DollarSign size={14} className={isDebit ? 'text-red-500' : 'text-emerald-500'} />
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
              className={`block w-full pl-6 pr-3 py-1.5 text-sm rounded-md bg-card text-foreground transition-all duration-200 border ${isDebit
                ? 'border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                : 'border-emerald-500/50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                } focus:outline-none`}
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

        {/* Credit/Debit toggle buttons */}
        <div className="flex gap-1 shrink-0" role="group" aria-label="Position type">
          <Button
            variant={!isDebit ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsDebit(false)}
            className={`${!isDebit ? 'bg-emerald-500 hover:bg-emerald-500/90' : ''}`}
            aria-pressed={!isDebit}
            aria-label="Credit received - money collected when opening position"
          >
            Credit
          </Button>
          <Button
            variant={isDebit ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsDebit(true)}
            className={`${isDebit ? '!bg-red-500 hover:!bg-red-500/90' : ''}`}
            aria-pressed={isDebit}
            aria-label="Debit paid - money spent when opening position"
          >
            Debit
          </Button>
        </div>
      </div>
    </div>
  );
}
