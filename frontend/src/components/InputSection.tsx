import { useRef } from 'react';
import { DollarSign } from 'lucide-react';
import HelpTooltip from './HelpTooltip';
import type { MarketCredit } from '../types';
import { creditFieldFromMarket } from '../hooks/useCalculation';

interface InputSectionProps {
  credit: string;
  setCredit: (value: string) => void;
  isDebit: boolean;
  setIsDebit: (value: boolean) => void;
  marketCredit?: MarketCredit | null;
}

// Bid/ask width above this share of the credit signals a hard fill
const WIDE_SPREAD_PCT = 10;

function formatNet(value: number): string {
  return `$${Math.abs(value).toFixed(2)} ${value < 0 ? 'debit' : 'credit'}`;
}

export default function InputSection({ credit, setCredit, isDebit, setIsDebit, marketCredit = null }: InputSectionProps) {
  const ignoreMouseUp = useRef(false);

  const applyMarketCredit = (net: number) => {
    const filled = creditFieldFromMarket(net);
    setCredit(filled.credit);
    setIsDebit(filled.isDebit);
  };

  const enteredNet = credit.trim() === '' ? null : (parseFloat(credit) || 0) * (isDebit ? -1 : 1);
  const matchesCredit = (net: number) => enteredNet !== null && Math.abs(enteredNet - net) < 0.005;

  const isWide = marketCredit?.spread_pct != null && marketCredit.spread_pct > WIDE_SPREAD_PCT;

  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 border border-border space-y-2">
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

      {marketCredit && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="market-credit">
          <span>
            Market: mid <span className="font-medium text-foreground tabular-nums">{formatNet(marketCredit.mid)}</span>
            {' · '}natural <span className="tabular-nums">{formatNet(marketCredit.natural)}</span>
          </span>
          {marketCredit.spread_pct != null && (
            <span className={isWide ? 'text-amber-600 dark:text-amber-400 font-medium' : undefined}>
              Bid/ask width {marketCredit.spread_pct.toFixed(1)}% of credit{isWide ? ' (wide, expect slippage)' : ''}
            </span>
          )}
          {([['Use mid', marketCredit.mid], ['Use natural', marketCredit.natural]] as const).map(([label, net]) => (
            <button
              key={label}
              type="button"
              className="rounded px-1.5 py-0.5 underline underline-offset-2 hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:no-underline"
              aria-pressed={matchesCredit(net)}
              onClick={() => applyMarketCredit(net)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
