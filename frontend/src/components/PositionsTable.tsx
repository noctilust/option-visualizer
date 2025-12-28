import { useRef, type ChangeEvent, type FocusEvent, type MouseEvent } from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { Position, PositionWithGreeks, PortfolioGreeks } from '../types';

let nextId = 1;
export const generateId = (): string => `pos_${nextId++}_${Date.now()}`;

// Calculate next monthly options expiration (3rd Friday of next month)
const getDefaultExpiration = (): string => {
  const now = new Date();
  // Start from next month
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  if (month > 11) {
    month = 0;
    year++;
  }

  // Find 3rd Friday of that month
  let fridayCount = 0;
  let day = 1;
  while (fridayCount < 3) {
    const d = new Date(year, month, day);
    if (d.getDay() === 5) fridayCount++;
    if (fridayCount < 3) day++;
  }

  // Format as "Jan 17 26"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortYear = String(year).slice(-2);
  return `${months[month]} ${day} ${shortYear}`;
};

export const DEFAULT_EXPIRATION = getDefaultExpiration();

// Parse and format expiration date to standard "Jan 17 26" format
const formatExpiration = (input: string): string => {
  if (!input || input.trim() === '') return DEFAULT_EXPIRATION;

  const str = input.trim();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let date: Date | null = null;

  // Try "Jan 17 26" format first
  const match1 = str.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2})$/);
  if (match1) {
    const monthIdx = months.findIndex(m => m.toLowerCase() === match1[1].toLowerCase());
    if (monthIdx !== -1) {
      date = new Date(2000 + parseInt(match1[3]), monthIdx, parseInt(match1[2]));
    }
  }

  // Try "Jan 17" format (assumes current or next year)
  if (!date) {
    const match2 = str.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
    if (match2) {
      const monthIdx = months.findIndex(m => m.toLowerCase() === match2[1].toLowerCase());
      if (monthIdx !== -1) {
        const now = new Date();
        let year = now.getFullYear();
        const testDate = new Date(year, monthIdx, parseInt(match2[2]));
        // If more than 30 days in past, use next year
        if ((now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24) > 30) {
          year++;
        }
        date = new Date(year, monthIdx, parseInt(match2[2]));
      }
    }
  }

  // Try ISO format "2026-01-17"
  if (!date) {
    const match3 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match3) {
      date = new Date(parseInt(match3[1]), parseInt(match3[2]) - 1, parseInt(match3[3]));
    }
  }

  // Try US format "1/17/26" or "01/17/26"
  if (!date) {
    const match4 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match4) {
      let year = parseInt(match4[3]);
      if (year < 100) year += 2000;
      date = new Date(year, parseInt(match4[1]) - 1, parseInt(match4[2]));
    }
  }

  // If still no valid date, return original input
  if (!date || isNaN(date.getTime())) return str;

  // Format as "Jan 17 26"
  const shortYear = String(date.getFullYear()).slice(-2);
  return `${months[date.getMonth()]} ${date.getDate()} ${shortYear}`;
};

interface PositionsTableProps {
  positions: Position[];
  setPositions: React.Dispatch<React.SetStateAction<Position[]>>;
  greeksData?: PositionWithGreeks[] | null;
  showGreeks?: boolean;
}

export default function PositionsTable({
  positions,
  setPositions,
  greeksData = null,
  showGreeks = false
}: PositionsTableProps) {
  const ignoreMouseUp = useRef(false);

  const handleRemove = (id: string) => {
    const newPositions = positions.filter((pos) => pos.id !== id);
    setPositions(newPositions);
  };

  const handleAdd = () => {
    const lastPosition = positions[positions.length - 1];
    const newPosition: Position = {
      id: generateId(),
      qty: lastPosition?.qty ?? -1,
      expiration: lastPosition?.expiration || DEFAULT_EXPIRATION,
      strike: 0,
      type: 'P',
      style: 'American'
    };
    setPositions([...positions, newPosition]);
  };

  const handleChange = (index: number, field: keyof Position, value: string | number) => {
    const newPositions = [...positions];
    newPositions[index] = { ...newPositions[index], [field]: value };
    setPositions(newPositions);
  };

  // Get Greeks for a specific position by index
  const getGreeksForPosition = (index: number): PortfolioGreeks | null => {
    if (!greeksData || !Array.isArray(greeksData) || index >= greeksData.length) {
      return null;
    }
    return greeksData[index]?.greeks ?? null;
  };

  // Format Greek values for display
  const formatGreek = (value: number | null | undefined, greek: string): string => {
    if (value === null || value === undefined || isNaN(value)) return '-';

    switch (greek) {
      case 'delta':
        return value.toFixed(3); // Delta: 3 decimals (e.g., 0.523)
      case 'gamma':
        return value.toFixed(4); // Gamma: 4 decimals (e.g., 0.0234)
      case 'theta':
        return value.toFixed(2); // Theta: 2 decimals (per day, e.g., -0.05)
      case 'vega':
        return value.toFixed(3); // Vega: 3 decimals (per 1% IV, e.g., 0.125)
      default:
        return value.toFixed(3);
    }
  };

  if (!positions || positions.length === 0) return null;

  // Conditional padding class based on whether Greeks are shown
  const cellPadding = showGreeks ? "px-2 py-3" : "px-4 py-3";
  const headerPadding = showGreeks ? "px-2 py-3" : "px-4 py-3";

  // Calculate position summary
  const longPositions = positions.filter(p => p.qty > 0).length;
  const shortPositions = positions.filter(p => p.qty < 0).length;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium">Positions</h3>
          <div className="flex items-center gap-2">
            {longPositions > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                {longPositions} Long
              </span>
            )}
            {shortPositions > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                {shortPositions} Short
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center justify-center gap-1.5 min-w-[140px] px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow-md"
        >
          <Plus size={14} />
          Add Position
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <table className="w-full text-sm text-left table-auto">
          <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
            <tr>
              <th className={headerPadding}>Qty</th>
              <th className={headerPadding}>{showGreeks ? 'Exp' : 'Expiration'}</th>
              <th className={headerPadding}>Strike</th>
              <th className={headerPadding}>Type</th>
              <th className={headerPadding}>Style</th>
              {showGreeks && (
                <>
                  <th className={`${headerPadding} text-right`}>Delta</th>
                  <th className={`${headerPadding} text-right`}>Gamma</th>
                  <th className={`${headerPadding} text-right`}>Theta</th>
                  <th className={`${headerPadding} text-right`}>Vega</th>
                </>
              )}
              <th className={headerPadding}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {positions.map((pos, index) => {
              const greeks = getGreeksForPosition(index);
              const isLong = pos.qty > 0;
              const isShort = pos.qty < 0;
              const rowColorClass = isLong
                ? 'hover:bg-green-50/50 dark:hover:bg-green-950/20 border-l-2 border-l-green-500'
                : isShort
                ? 'hover:bg-red-50/50 dark:hover:bg-red-950/20 border-l-2 border-l-red-500'
                : 'hover:bg-muted/50';

              return (
                <tr key={pos.id || index} className={`transition-colors ${rowColorClass}`}>
                  <td className={cellPadding}>
                    <div className="flex items-center gap-2">
                      {isLong && (
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-[10px] font-bold text-green-700 dark:text-green-400">
                          L
                        </span>
                      )}
                      {isShort && (
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-400">
                          S
                        </span>
                      )}
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pos.qty}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(index, 'qty', e.target.value)}
                        onFocus={(e: FocusEvent<HTMLInputElement>) => {
                          e.target.select();
                          ignoreMouseUp.current = true;
                        }}
                        onMouseUp={(e: MouseEvent<HTMLInputElement>) => {
                          if (ignoreMouseUp.current) {
                            e.preventDefault();
                            ignoreMouseUp.current = false;
                          }
                        }}
                        onBlur={(e: FocusEvent<HTMLInputElement>) => {
                          const parsed = parseInt(e.target.value) || 0;
                          handleChange(index, 'qty', parsed);
                        }}
                        className={`${showGreeks ? 'w-12 px-1.5 py-0.5 text-sm' : 'flex-1 px-2 py-1'} border rounded bg-background`}
                      />
                    </div>
                  </td>
                  <td className={cellPadding}>
                    <input
                      type="text"
                      value={pos.expiration}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(index, 'expiration', e.target.value)}
                      onBlur={(e: FocusEvent<HTMLInputElement>) => {
                        const formatted = formatExpiration(e.target.value);
                        handleChange(index, 'expiration', formatted);
                      }}
                      placeholder={DEFAULT_EXPIRATION}
                      className={`${showGreeks ? 'w-20 px-1.5 py-0.5 text-sm' : 'w-full px-2 py-1'} border rounded bg-background`}
                    />
                  </td>
                  <td className={cellPadding}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pos.strike}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange(index, 'strike', e.target.value)}
                      onFocus={(e: FocusEvent<HTMLInputElement>) => {
                        e.target.select();
                        ignoreMouseUp.current = true;
                      }}
                      onMouseUp={(e: MouseEvent<HTMLInputElement>) => {
                        if (ignoreMouseUp.current) {
                          e.preventDefault();
                          ignoreMouseUp.current = false;
                        }
                      }}
                      onBlur={(e: FocusEvent<HTMLInputElement>) => {
                        const parsed = parseFloat(e.target.value) || 0;
                        handleChange(index, 'strike', parsed);
                      }}
                      className={`${showGreeks ? 'w-20 px-1.5 py-0.5 text-sm' : 'w-full px-2 py-1'} border rounded bg-background`}
                    />
                  </td>
                  <td className={cellPadding}>
                    <select
                      value={pos.type}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange(index, 'type', e.target.value as 'C' | 'P')}
                      className={`w-full ${showGreeks ? 'px-1.5 py-0.5 text-sm' : 'px-2 py-1'} border rounded bg-background font-medium ${
                        pos.type === 'C' ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      <option value="C">Call</option>
                      <option value="P">Put</option>
                    </select>
                  </td>
                  <td className={cellPadding}>
                    <select
                      value={pos.style || 'American'}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange(index, 'style', e.target.value as 'American' | 'European')}
                      className={`w-full ${showGreeks ? 'px-1.5 py-0.5 text-sm' : 'px-2 py-1'} border rounded bg-background`}
                      title="European options can only be exercised at expiration. American options can be exercised anytime."
                    >
                      <option value="American">American</option>
                      <option value="European">European</option>
                    </select>
                  </td>
                  {showGreeks && (
                    <>
                      <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                        <span className={greeks?.delta && greeks.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {formatGreek(greeks?.delta, 'delta')}
                        </span>
                      </td>
                      <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                        {formatGreek(greeks?.gamma, 'gamma')}
                      </td>
                      <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                        <span className={greeks?.theta && greeks.theta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {formatGreek(greeks?.theta, 'theta')}
                        </span>
                      </td>
                      <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                        {formatGreek(greeks?.vega, 'vega')}
                      </td>
                    </>
                  )}
                  <td className={cellPadding}>
                    <button
                      onClick={() => handleRemove(pos.id)}
                      className="text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
