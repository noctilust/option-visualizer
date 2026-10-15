import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SellerMetricsPanel from './SellerMetricsPanel';
import type { ProbabilityMetrics, SellerMetrics } from '../types';

const probability: ProbabilityMetrics = {
  probability_of_profit: 68.4,
  max_profit: 400,
  max_loss: null,
  breakeven_points: [91, 109],
  risk_reward_ratio: null,
  probability_of_profit_target: 74.2,
  profit_target_pct: 50,
  short_strikes: [
    { strike: 95, type: 'P', probability_itm: 22, probability_of_touch: 44 },
    { strike: 105, type: 'C', probability_itm: 20, probability_of_touch: 40 },
  ],
};

const seller: SellerMetrics = {
  buying_power: 1720,
  buying_power_method: 'reg_t_naked',
  return_on_capital: 0.2326,
  annualized_return: 1.8865,
  theta_per_day: 12.5,
  theta_to_buying_power: 0.00727,
  expected_move: { amount: 8.6, lower: 91.4, upper: 108.6, days: 45 },
  market_credit: null,
  days_to_expiration: 45,
  earnings_date: '2026-11-02',
  earnings_before_expiration: true,
};

const settings = { profitTargetPct: 50, stopMultiple: 2, managementDte: 21 };

describe('SellerMetricsPanel', () => {
  it('shows seller metrics, unlimited loss and the earnings warning', () => {
    render(
      <SellerMetricsPanel
        probabilityMetrics={probability}
        sellerMetrics={seller}
        settings={settings}
        onSettingsChange={() => {}}
      />,
    );

    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByText('74% to hit 50% target')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText('$1,720')).toBeInTheDocument();
    expect(screen.getByText('Reg-T naked estimate')).toBeInTheDocument();
    expect(screen.getByText('23.3%')).toBeInTheDocument();
    expect(screen.getByText('+$12.50')).toBeInTheDocument();
    expect(screen.getByText('±$8.60')).toBeInTheDocument();
    expect(screen.getByText('95P: ITM 22% · touch 44%')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Earnings on 2026-11-02');
  });

  it('reports management setting changes', () => {
    const onSettingsChange = vi.fn();
    render(
      <SellerMetricsPanel
        probabilityMetrics={probability}
        sellerMetrics={{ ...seller, earnings_before_expiration: false }}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/profit target/i), { target: { value: '25' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, profitTargetPct: 25 });
  });

  it('renders nothing without metrics', () => {
    const { container } = render(
      <SellerMetricsPanel probabilityMetrics={null} sellerMetrics={null} settings={settings} onSettingsChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
