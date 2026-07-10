import { TrendingUp } from 'lucide-react';
import type { MarketData } from '../../types';
import Collapsible from '../Collapsible';
import VolatilitySkew from './VolatilitySkew';

interface VolatilitySkewPanelProps {
  symbol: string;
  marketData: MarketData;
  selectedExpiration: string;
  isDark: boolean;
}

export default function VolatilitySkewPanel(props: VolatilitySkewPanelProps) {
  return (
    <Collapsible
      title="Volatility Skew"
      icon={<TrendingUp className="w-5 h-5 text-primary" />}
      defaultOpen={false}
      mobileOnly
      unmountOnClosed
      className="surface-panel p-4 md:p-5"
    >
      <VolatilitySkew {...props} embedded />
    </Collapsible>
  );
}
