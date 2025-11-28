import React from 'react';
import { Trash2, Plus } from 'lucide-react';

const PositionsTable = ({ positions, setPositions }) => {
    const handleRemove = (index) => {
        const newPositions = positions.filter((_, i) => i !== index);
        setPositions(newPositions);
    };

    const handleAdd = () => {
        setPositions([...positions, { qty: -1, expiration: '', strike: 0, type: 'P' }]);
    };

    const handleChange = (index, field, value) => {
        const newPositions = [...positions];
        newPositions[index] = { ...newPositions[index], [field]: value };
        setPositions(newPositions);
    };

    if (!positions || positions.length === 0) return null;

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Positions</h3>
                <button
                    onClick={handleAdd}
                    className="flex items-center px-3 py-1 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Position
                </button>
            </div>

            <div className="overflow-x-auto border rounded-lg shadow-sm">
                <table className="w-full text-sm text-left table-fixed">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 w-1/5">Qty</th>
                            <th className="px-4 py-3 w-1/5">Expiration</th>
                            <th className="px-4 py-3 w-1/5">Strike</th>
                            <th className="px-4 py-3 w-1/5">Type</th>
                            <th className="px-4 py-3 w-1/5">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                        {positions.map((pos, index) => (
                            <tr key={index} className="hover:bg-muted/50 transition-colors">
                                <td className="px-4 py-3">
                                    <input
                                        type="number"
                                        value={pos.qty}
                                        onChange={(e) => handleChange(index, 'qty', parseInt(e.target.value) || 0)}
                                        className="w-full px-2 py-1 border rounded bg-background"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="text"
                                        value={pos.expiration}
                                        onChange={(e) => handleChange(index, 'expiration', e.target.value)}
                                        className="w-full px-2 py-1 border rounded bg-background"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <input
                                        type="number"
                                        value={pos.strike}
                                        onChange={(e) => handleChange(index, 'strike', parseFloat(e.target.value) || 0)}
                                        className="w-full px-2 py-1 border rounded bg-background"
                                    />
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={pos.type}
                                        onChange={(e) => handleChange(index, 'type', e.target.value)}
                                        className="w-full px-2 py-1 border rounded bg-background"
                                    >
                                        <option value="C">Call</option>
                                        <option value="P">Put</option>
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        onClick={() => handleRemove(index)}
                                        className="text-destructive hover:text-destructive/80 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PositionsTable;
