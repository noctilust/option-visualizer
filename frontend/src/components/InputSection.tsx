import { useRef } from 'react';
import { DollarSign } from 'lucide-react';

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
        {/* Label */}
        <div className="flex items-center gap-2 shrink-0">
          <DollarSign size={14} className={isDebit ? 'text-red-500' : 'text-emerald-500'} />
          <span className="text-sm font-medium">
            {isDebit ? 'Debit Paid:' : 'Credit Received:'}
          </span>
        </div>

        {/* Input field - grows to fill space */}
        <div className="flex-1 min-w-[100px] max-w-[200px]">
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
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setIsDebit(false)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${!isDebit
              ? 'bg-emerald-500 text-white'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
          >
            Credit
          </button>
          <button
            onClick={() => setIsDebit(true)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${isDebit
              ? 'bg-red-500 text-white'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
          >
            Debit
          </button>
        </div>
      </div>
    </div>
  );
}
