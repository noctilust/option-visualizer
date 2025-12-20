import { useRef } from 'react';

interface InputSectionProps {
  credit: string;
  setCredit: (value: string) => void;
  isDebit: boolean;
  setIsDebit: (value: boolean) => void;
}

export default function InputSection({ credit, setCredit, isDebit, setIsDebit }: InputSectionProps) {
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
      <div className={`relative rounded-lg transition-all duration-300 ${isDebit
        ? 'shadow-[0_0_20px_rgba(239,68,68,0.3),0_0_40px_rgba(239,68,68,0.1)]'
        : 'shadow-[0_0_20px_rgba(16,185,129,0.3),0_0_40px_rgba(16,185,129,0.1)]'
        }`}>
        <div className={`absolute -inset-0.5 rounded-lg blur-sm opacity-75 transition-all duration-300 ${isDebit ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'
          }`}></div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <span className="text-muted-foreground sm:text-sm">$</span>
          </div>
          <input
            type="number"
            name="credit"
            id="credit"
            className={`relative block w-full pl-7 pr-12 py-3 sm:text-sm rounded-lg bg-card text-foreground shadow-sm selection:bg-blue-500 selection:text-white transition-all duration-200 border-2 ${isDebit
              ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
              : 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/20'
              } focus:ring-4 focus:outline-none`}
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
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none z-10">
            <span className="text-muted-foreground sm:text-sm">USD</span>
          </div>
        </div>
      </div>
    </div>
  );
}
