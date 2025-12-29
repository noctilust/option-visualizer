import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import type { SymbolSearchResult } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface SymbolAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (result: SymbolSearchResult | { symbol: string }) => void;
  placeholder?: string;
}

export default function SymbolAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "TSLA"
}: SymbolAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || '');
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync input value with external value
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Search for symbols
  const searchSymbols = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      setIsOpen(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/symbols/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
        setIsOpen(data.results?.length > 0);
        // Pre-select first item for immediate Enter selection
        setHighlightedIndex(data.results?.length > 0 ? 0 : -1);
      }
    } catch (error) {
      console.error('Symbol search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
      setHasSearched(true);
    }
  }, []);

  // Debounced search
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setInputValue(newValue);
    onChange?.(newValue);

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Reset search state while typing
    setHasSearched(false);

    // Debounce search
    debounceRef.current = setTimeout(() => {
      searchSymbols(newValue);
    }, 300);
  };

  // Handle selection
  const handleSelect = (result: SymbolSearchResult) => {
    setInputValue(result.symbol);
    onChange?.(result.symbol);
    onSelect?.(result);
    setIsOpen(false);
    setResults([]);
    setHasSearched(false);
    inputRef.current?.blur();
  };

  // Clear input
  const handleClear = () => {
    setInputValue('');
    onChange?.('');
    setResults([]);
    setIsOpen(false);
    setHasSearched(false);
    inputRef.current?.blur();
  };

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          // Select highlighted dropdown item
          handleSelect(results[highlightedIndex]);
        } else if (inputValue.trim()) {
          // Submit the typed value directly
          setIsOpen(false);
          setResults([]);
          setHasSearched(false);
          onChange?.(inputValue.trim().toUpperCase());
          onSelect?.({ symbol: inputValue.trim().toUpperCase() });
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('li');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          id="symbol"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 text-base border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:border-transparent transition-all uppercase"
          autoComplete="off"
          spellCheck="false"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground animate-spin" />
        )}
        {!isLoading && inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
            type="button"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
        >
          <ul ref={listRef} className="max-h-64 overflow-y-auto">
            {results.map((result, index) => (
              <li
                key={result.symbol}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors ${index === highlightedIndex
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-base">
                    {result.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {result.name}
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${result.type === 'ETF'
                  ? 'bg-purple-500/20 text-purple-500'
                  : 'bg-blue-500/20 text-blue-500'
                  }`}>
                  {result.type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results message - only show after search completes */}
      {hasSearched && results.length === 0 && inputValue && !isLoading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg p-4 text-center text-muted-foreground"
        >
          No US stocks or ETFs found for "{inputValue}"
        </div>
      )}
    </div>
  );
}
