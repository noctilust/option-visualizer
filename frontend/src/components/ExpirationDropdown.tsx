import { useMemo, useState, useRef, useEffect } from 'react';
import { useOptionChain } from '../hooks/useOptionChain';

interface ExpirationOption {
  value: string;  // ISO format YYYY-MM-DD
  label: string;  // Short label like "Jan 17"
  isWeekly: boolean;
  daysToExpiration: number;
}

interface ExpirationDropdownProps {
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
  symbol?: string;
  compact?: boolean;
  /**
   * Format of the value prop and onChange callback:
   * - 'iso': YYYY-MM-DD (default)
   * - 'position': "Jan 17 26" format used by positions table
   */
  valueFormat?: 'iso' | 'position';
}

/**
 * Parse ISO date string as local date to avoid timezone issues
 */
function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

/**
 * Check if a date is standard monthly opex (3rd Friday)
 */
function isMonthlyOpex(dateStr: string): boolean {
  const date = parseLocalDate(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const firstFriday = (5 - firstDayOfWeek + 7) % 7 + 1;
  const thirdFriday = firstFriday + 14;

  return date.getDate() === thirdFriday;
}

/**
 * Generate weekly expirations (Fridays) for the next N weeks - fallback only
 */
function generateWeeklyExpirations(count: number = 12): ExpirationOption[] {
  const expirations: ExpirationOption[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i * 7);

    const dayOfWeek = date.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday !== 0 || i === 0) {
      date.setDate(date.getDate() + daysUntilFriday);
    }

    if (date <= now) continue;

    // Format as ISO string directly without timezone conversion
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const daysToExp = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    expirations.push({
      value,
      label,
      isWeekly: true,
      daysToExpiration: daysToExp,
    });
  }

  return expirations;
}

/**
 * Generate monthly expirations (3rd Friday) for the next N months - fallback only
 */
function generateMonthlyExpirations(count: number = 12): ExpirationOption[] {
  const expirations: ExpirationOption[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);

    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDayOfWeek = firstDay.getDay();

    const firstFriday = (5 - firstDayOfWeek + 7) % 7 + 1;
    const thirdFriday = firstFriday + 14;

    const thirdFridayDate = new Date(date.getFullYear(), date.getMonth(), thirdFriday);

    if (thirdFridayDate <= now) continue;

    // Format as ISO string directly without timezone conversion
    const value = `${thirdFridayDate.getFullYear()}-${String(thirdFridayDate.getMonth() + 1).padStart(2, '0')}-${String(thirdFridayDate.getDate()).padStart(2, '0')}`;
    const label = thirdFridayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const daysToExp = Math.ceil((thirdFridayDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    expirations.push({
      value,
      label,
      isWeekly: false,
      daysToExpiration: daysToExp,
    });
  }

  return expirations;
}

/**
 * Convert position expiration format "Jan 17 26" to ISO format "2026-01-17"
 */
function positionToIso(expiration: string): string {
  if (!expiration) return '';

  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return expiration;

  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const parts = expiration.trim().split(/\s+/);
  if (parts.length < 2) return '';

  const monthStr = parts[0];
  const dayStr = parts[1];
  const currentYear = new Date().getFullYear();
  const yearStr = parts[2] || currentYear.toString().slice(-2);

  const month = months[monthStr];
  if (month === undefined) return '';

  const day = parseInt(dayStr, 10);
  const year = 2000 + parseInt(yearStr, 10);

  // Format as ISO string directly without timezone conversion
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Convert ISO format "2026-01-17" to position format "Jan 17 26"
 */
function isoToPosition(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';

  const date = parseLocalDate(iso);  // Parse as local date to avoid timezone shift
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortYear = String(date.getFullYear()).slice(-2);

  return `${months[date.getMonth()]} ${date.getDate()} ${shortYear}`;
}

export default function ExpirationDropdown({
  value,
  onChange,
  isDark,
  compact = false,
  symbol = '',
  valueFormat = 'iso'
}: ExpirationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch real expirations from API
  const { chainData, loading: apiLoading, fetchOptionChain } = useOptionChain();

  // Fetch expirations when symbol changes
  useEffect(() => {
    if (symbol && symbol.trim() !== '') {
      fetchOptionChain(symbol);
    }
  }, [symbol, fetchOptionChain]);

  // Generate fallback expirations
  const fallbackWeekly = useMemo(() => generateWeeklyExpirations(12), []);
  const fallbackMonthly = useMemo(() => generateMonthlyExpirations(12), []);

  // Combine fallback options (monthly first for precedence)
  const fallbackOptions = useMemo(() => {
    const combined = [...fallbackMonthly, ...fallbackWeekly].sort((a, b) => a.daysToExpiration - b.daysToExpiration);
    const seen = new Set<string>();
    return combined.filter(exp => {
      if (seen.has(exp.value)) return false;
      seen.add(exp.value);
      return true;
    });
  }, [fallbackWeekly, fallbackMonthly]);

  // Use API expirations if available, otherwise fallback
  const allOptions = useMemo(() => {
    if (chainData && chainData.expirations.length > 0) {
      return chainData.expirations;
    }
    return fallbackOptions;
  }, [chainData, fallbackOptions]);

  // Convert current value to ISO for internal matching
  const currentValueIso = useMemo(() => {
    if (valueFormat === 'position') {
      return positionToIso(value);
    }
    return value;
  }, [value, valueFormat]);

  // If current selection isn't in the list, add it
  const options = useMemo(() => {
    if (!currentValueIso) return allOptions;

    const isSelectedPresent = allOptions.some(e => e.value === currentValueIso);
    if (isSelectedPresent) return allOptions;

    // Add the current selection as a custom option
    const date = parseLocalDate(currentValueIso);
    if (isNaN(date.getTime())) return allOptions;

    // Always use short format without year to match other options
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const customOption = {
      value: currentValueIso,
      label,
      isWeekly: !isMonthlyOpex(currentValueIso),
      daysToExpiration: Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    };

    // Insert in sorted position
    return [...allOptions, customOption].sort((a, b) => a.daysToExpiration - b.daysToExpiration);
  }, [allOptions, currentValueIso]);

  // Get current option for display
  const currentOption = options.find(opt => opt.value === currentValueIso);

  const handleSelect = (isoValue: string) => {
    if (valueFormat === 'position') {
      onChange(isoToPosition(isoValue));
    } else {
      onChange(isoValue);
    }
    setIsOpen(false);
  };

  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  // Close dropdown when clicking outside and update position when opening
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updateDropdownPosition();
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`border rounded bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-between whitespace-nowrap ${
          compact ? 'px-1.5 py-0.5 text-xs w-20' : 'px-2 py-1 text-sm w-[155px]'
        }`}
        style={{
          borderColor: isDark ? '#404040' : '#e5e7eb',
          color: isDark ? '#e5e5e5' : '#1f2937',
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
        }}
      >
        <span className="flex items-center gap-1.5">
          {currentOption ? (
            <>
              {currentOption.label}
              {!compact && ` • ${currentOption.daysToExpiration}d`}
              {currentOption.isWeekly && (
                <span
                  className="ml-2.5 px-1 py-0 rounded text-[10px] font-bold"
                  style={{
                    backgroundColor: '#f97316',
                    color: '#ffffff',
                    lineHeight: '1.4',
                  }}
                >
                  W
                </span>
              )}
            </>
          ) : (
            'Select Expirations'
          )}
        </span>
        <svg
          className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-50 rounded border shadow-lg overflow-auto"
          style={{
            borderColor: isDark ? '#404040' : '#e5e7eb',
            backgroundColor: isDark ? '#1f2937' : '#ffffff',
            maxHeight: '400px',
            width: '160px',
            top: `${dropdownPosition.top + 4}px`,
            left: `${dropdownPosition.left}px`,
          }}
        >
          {/* Header */}
          <div
            className="px-2 py-1.5 text-xs font-medium border-b"
            style={{
              borderColor: isDark ? '#404040' : '#e5e7eb',
              color: isDark ? '#9ca3af' : '#6b7280',
            }}
          >
            {apiLoading ? 'Loading...' : 'Select Expirations'}
          </div>

          {/* Options */}
          {options.map(opt => {
            const isSelected = opt.value === currentValueIso;
            return (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="px-2 py-1.5 cursor-pointer flex items-center gap-2 hover:bg-opacity-10"
                style={{
                  backgroundColor: isSelected
                    ? isDark
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(59, 130, 246, 0.2)'
                    : 'transparent',
                  color: isDark ? '#e5e5e5' : '#1f2937',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                    <path
                      d="M13.3333 4L6 11.3333L2.66667 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {!isSelected && <div style={{ width: '14px' }} className="flex-shrink-0" />}
                <span className="font-medium text-xs">
                  {opt.label} • {opt.daysToExpiration}d
                </span>
                {opt.isWeekly && (
                  <span
                    className="px-1.5 py-0 rounded text-xs font-bold flex-shrink-0 ml-auto"
                    style={{
                      backgroundColor: '#f97316',
                      color: '#ffffff',
                      lineHeight: '1.4',
                    }}
                  >
                    W
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
