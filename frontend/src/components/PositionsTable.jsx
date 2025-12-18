import React, { useRef } from 'react';
import { Trash2, Plus } from 'lucide-react';

let nextId = 1;
export const generateId = () => `pos_${nextId++}_${Date.now()}`;

const PositionsTable = ({ positions, setPositions, greeksData = null, showGreeks = false }) => {
    const ignoreMouseUp = useRef(false);

    const handleRemove = (id) => {
        const newPositions = positions.filter((pos) => pos.id !== id);
        setPositions(newPositions);
    };

    const handleAdd = () => {
        const lastPosition = positions[positions.length - 1];
        const newPosition = {
            id: generateId(),
            qty: lastPosition?.qty ?? -1,
            expiration: lastPosition?.expiration ?? '',
            strike: 0,
            type: 'P',
            style: 'American'
        };
        setPositions([...positions, newPosition]);
    };

    const handleChange = (index, field, value) => {
        const newPositions = [...positions];
        newPositions[index] = { ...newPositions[index], [field]: value };
        setPositions(newPositions);
    };

    // Get Greeks for a specific position by index
    const getGreeksForPosition = (index) => {
        if (!greeksData || !Array.isArray(greeksData) || index >= greeksData.length) {
            return null;
        }
        return greeksData[index]?.greeks;
    };

    // Format Greek values for display
    const formatGreek = (value, greek) => {
        if (value === null || value === undefined || isNaN(value)) return '-';

        switch(greek) {
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

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Positions</h3>
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

                            return (
                                <tr key={pos.id || index} className="hover:bg-muted/50 transition-colors">
                                    <td className={cellPadding}>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={pos.qty}
                                            onChange={(e) => handleChange(index, 'qty', e.target.value)}
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
                                            onBlur={(e) => {
                                                const parsed = parseInt(e.target.value) || 0;
                                                handleChange(index, 'qty', parsed);
                                            }}
                                            className={`${showGreeks ? 'w-16 px-1.5 py-0.5 text-sm' : 'w-full px-2 py-1'} border rounded bg-background`}
                                        />
                                    </td>
                                    <td className={cellPadding}>
                                        <input
                                            type="text"
                                            value={pos.expiration}
                                            onChange={(e) => handleChange(index, 'expiration', e.target.value)}
                                            placeholder="Dec 20"
                                            className={`${showGreeks ? 'w-20 px-1.5 py-0.5 text-sm' : 'w-full px-2 py-1'} border rounded bg-background`}
                                        />
                                    </td>
                                    <td className={cellPadding}>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={pos.strike}
                                            onChange={(e) => handleChange(index, 'strike', e.target.value)}
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
                                            onBlur={(e) => {
                                                const parsed = parseFloat(e.target.value) || 0;
                                                handleChange(index, 'strike', parsed);
                                            }}
                                            className={`${showGreeks ? 'w-20 px-1.5 py-0.5 text-sm' : 'w-full px-2 py-1'} border rounded bg-background`}
                                        />
                                    </td>
                                    <td className={cellPadding}>
                                        <select
                                            value={pos.type}
                                            onChange={(e) => handleChange(index, 'type', e.target.value)}
                                            className={`w-full ${showGreeks ? 'px-1.5 py-0.5 text-sm' : 'px-2 py-1'} border rounded bg-background`}
                                        >
                                            <option value="C">Call</option>
                                            <option value="P">Put</option>
                                        </select>
                                    </td>
                                    <td className={cellPadding}>
                                        <select
                                            value={pos.style || 'American'}
                                            onChange={(e) => handleChange(index, 'style', e.target.value)}
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
                                                <span className={greeks?.delta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                                    {formatGreek(greeks?.delta, 'delta')}
                                                </span>
                                            </td>
                                            <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                                                {formatGreek(greeks?.gamma, 'gamma')}
                                            </td>
                                            <td className={`${cellPadding} text-right font-mono text-xs whitespace-nowrap`}>
                                                <span className={greeks?.theta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
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
};

export default PositionsTable;
