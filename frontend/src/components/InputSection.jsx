import React, { useRef } from 'react';

const InputSection = ({ credit, setCredit, isDebit, setIsDebit }) => {
    const ignoreMouseUp = useRef(false);
    return (
        <div className="w-full max-w-xl mx-auto">
            <div className="flex space-x-4 mb-4">
                <button
                    onClick={() => setIsDebit(false)}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${!isDebit
                        ? 'bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                        : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-100'
                        }`}
                >
                    Credit
                </button>
                <button
                    onClick={() => setIsDebit(true)}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${isDebit
                        ? 'bg-red-500/10 border-2 border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                        : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-100'
                        }`}
                >
                    Debit
                </button>
            </div>

            <label htmlFor="credit" className="block text-sm font-medium text-muted-foreground mb-2">
                {isDebit ? 'Total Debit Paid ($)' : 'Total Credit Collected ($)'}
            </label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-muted-foreground sm:text-sm">$</span>
                </div>
                <input
                    type="number"
                    name="credit"
                    id="credit"
                    className="block w-full pl-7 pr-12 py-3 sm:text-sm border-border rounded-md bg-card text-foreground focus:ring-primary focus:border-primary shadow-sm selection:bg-blue-500 selection:text-white"
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
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-muted-foreground sm:text-sm">USD</span>
                </div>
            </div>
        </div>
    );
};

export default InputSection;
