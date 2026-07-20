import { useState, useEffect } from 'react';

interface StickyHeaderProps {
  symbol: string;
  currentPrice?: number;
  priceChange?: number;
  show: boolean;
}

export default function StickyHeader({ symbol, currentPrice, show }: StickyHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show sticky header after scrolling past 200px
      const shouldShow = window.scrollY > 200 && show;
      setIsVisible(shouldShow);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [show]);

  if (!isVisible || !symbol) return null;

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-foreground">{symbol}</span>
        </div>
        {currentPrice !== undefined && (
          <span className="font-semibold tabular-nums">${currentPrice.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}
