import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

const TOOLTIP_MAX_WIDTH = 288;
const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 8;

interface TooltipPosition {
  top: number;
  left: number;
  width: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
}

interface HelpTooltipProps {
  term: string;
  children: React.ReactNode;
  className?: string;
}

// Centralized definitions for financial terms
const termDefinitions: Record<string, { title: string; description: string; example?: string }> = {
  'iv': {
    title: 'Implied Volatility (IV)',
    description: 'A measure of expected future price movement derived from option prices. Higher IV means options are more expensive.',
    example: '30% IV means the market expects the stock to move roughly ±30% over a year.',
  },
  'iv-rank': {
    title: 'IV Rank',
    description: 'Shows where current IV stands relative to its 52-week range. 0% = lowest IV in a year, 100% = highest.',
    example: 'IV Rank of 80% means IV is near yearly highs — good time to sell premium.',
  },
  'delta': {
    title: 'Delta (Δ)',
    description: 'How much an option\'s price changes for a $1 move in the underlying stock. Also approximates probability of expiring in-the-money.',
    example: 'Delta of 0.50 means the option gains $50 per contract if stock rises $1.',
  },
  'gamma': {
    title: 'Gamma (Γ)',
    description: 'Rate of change of delta. High gamma means delta changes rapidly as the stock moves.',
    example: 'Gamma of 0.05 means delta increases by 0.05 for each $1 stock move.',
  },
  'theta': {
    title: 'Theta (Θ)',
    description: 'Daily time decay — how much value an option loses each day. Positive for sellers, negative for buyers.',
    example: 'Theta of -$5 means the position loses $5 in value each day.',
  },
  'vega': {
    title: 'Vega (ν)',
    description: 'Sensitivity to volatility changes. Shows profit/loss for each 1% change in implied volatility.',
    example: 'Vega of $10 means position gains $10 if IV increases by 1%.',
  },
  'breakeven': {
    title: 'Breakeven Point',
    description: 'The stock price at which your position neither makes nor loses money at expiration.',
    example: 'With breakeven at $105, you profit if stock is above $105 at expiration.',
  },
  'credit': {
    title: 'Credit',
    description: 'Money received when opening a position (selling options). Maximum profit equals the credit received.',
  },
  'debit': {
    title: 'Debit',
    description: 'Money paid when opening a position (buying options). Maximum loss equals the debit paid.',
  },
  'risk-free-rate': {
    title: 'Risk-Free Rate',
    description: 'The theoretical return on a "riskless" investment, typically the U.S. Treasury rate. Used in option pricing models.',
  },
  'american': {
    title: 'American Style',
    description: 'Options that can be exercised any time before expiration. Most stock options are American style.',
  },
  'european': {
    title: 'European Style',
    description: 'Options that can only be exercised at expiration. Index options are typically European style.',
  },
  'atm': {
    title: 'At-The-Money (ATM)',
    description: 'An option with a strike price equal or very close to the current stock price.',
  },
  'skew': {
    title: 'Volatility Skew',
    description: 'The difference in implied volatility between out-of-the-money puts and calls. Positive skew means puts are more expensive.',
    example: 'Skew of +5% means put IV is 5% higher than call IV at equal deltas.',
  },
};

export default function HelpTooltip({ term, children, className = '' }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    top: 0,
    left: VIEWPORT_PADDING,
    width: TOOLTIP_MAX_WIDTH,
    arrowLeft: TOOLTIP_MAX_WIDTH / 2,
    placement: 'top',
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = `tooltip-${useId()}`;

  const definition = termDefinitions[term.toLowerCase()];

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceAbove > 200 || spaceAbove > spaceBelow ? 'top' : 'bottom';
    const width = Math.max(0, Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2));
    const triggerCenter = rect.left + rect.width / 2;
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING);
    const left = Math.min(Math.max(triggerCenter - width / 2, VIEWPORT_PADDING), maxLeft);
    const arrowLeft = Math.min(Math.max(triggerCenter - left, 12), Math.max(12, width - 12));

    setPosition({
      top: placement === 'top' ? rect.top - TOOLTIP_GAP : rect.bottom + TOOLTIP_GAP,
      left,
      width,
      arrowLeft,
      placement,
    });
  }, []);

  const openTooltip = () => {
    calculatePosition();
    setIsOpen(true);
  };

  const toggleTooltip = () => {
    if (!isOpen) calculatePosition();
    setIsOpen((open) => !open);
  };

  // Close on escape or click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => calculatePosition();

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, calculatePosition]);

  if (!definition) {
    return <>{children}</>;
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <span className="relative inline-block">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleTooltip}
          onMouseEnter={openTooltip}
          onMouseLeave={() => setIsOpen(false)}
          onFocus={openTooltip}
          onBlur={() => setIsOpen(false)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1"
          aria-label={`Help: ${definition.title}`}
          aria-expanded={isOpen}
          aria-describedby={isOpen ? tooltipId : undefined}
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {isOpen && typeof document !== 'undefined' && createPortal(
          <div
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              transform: position.placement === 'top' ? 'translateY(-100%)' : undefined,
            }}
            className="fixed z-[100] p-3 rounded-lg shadow-lg border bg-popover text-popover-foreground text-left animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div
              style={{ left: position.arrowLeft }}
              className={`absolute -translate-x-1/2 w-2 h-2 rotate-45 bg-popover border-border
                ${position.placement === 'top' ? 'bottom-[-5px] border-r border-b' : 'top-[-5px] border-l border-t'}
              `}
            />

            <h4 className="font-semibold text-sm mb-1">{definition.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {definition.description}
            </p>
            {definition.example && (
              <p className="text-xs text-primary/80 mt-2 pt-2 border-t border-border/50 italic">
                {definition.example}
              </p>
            )}
          </div>,
          document.body,
        )}
      </span>
    </span>
  );
}
