import type { ReactNode } from 'react';
import { AlertTriangle, Target } from 'lucide-react';
import type { ManagementSettings, ProbabilityMetrics, SellerMetrics } from '../types';
import HelpTooltip from './HelpTooltip';
import { formatDollars, formatPercent } from '../utils/format';

interface SellerMetricsPanelProps {
  probabilityMetrics: ProbabilityMetrics | null;
  sellerMetrics: SellerMetrics | null;
  settings: ManagementSettings;
  onSettingsChange: (settings: ManagementSettings) => void;
}

function Metric({
  label,
  term,
  value,
  sub,
  tone = 'text-foreground',
}: {
  label: string;
  term?: string;
  value: string;
  sub?: ReactNode;
  tone?: string;
}) {
  const labelNode = <span className="text-xs text-muted-foreground font-medium">{label}</span>;
  return (
    <div className="metric-card">
      <div className="mb-1">{term ? <HelpTooltip term={term}>{labelNode}</HelpTooltip> : labelNode}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{sub}</div>}
    </div>
  );
}

function SettingInput({
  label,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (!Number.isNaN(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
        }}
        className="w-16 px-1.5 py-0.5 text-sm tabular-nums border rounded bg-background text-foreground"
      />
      <span>{suffix}</span>
    </label>
  );
}

export default function SellerMetricsPanel({
  probabilityMetrics,
  sellerMetrics,
  settings,
  onSettingsChange,
}: SellerMetricsPanelProps) {
  if (!probabilityMetrics && !sellerMetrics) return null;

  const pop = probabilityMetrics?.probability_of_profit ?? null;
  const targetProbability = probabilityMetrics?.probability_of_profit_target ?? null;
  const maxProfit = probabilityMetrics?.max_profit ?? null;
  const maxLoss = probabilityMetrics?.max_loss ?? null;
  const buyingPower = sellerMetrics?.buying_power ?? null;
  const roc = sellerMetrics?.return_on_capital ?? null;
  const annualized = sellerMetrics?.annualized_return ?? null;
  const theta = sellerMetrics?.theta_per_day ?? null;
  const thetaToBp = sellerMetrics?.theta_to_buying_power ?? null;
  const move = sellerMetrics?.expected_move ?? null;
  const shortStrikes = probabilityMetrics?.short_strikes ?? [];

  return (
    <div className="space-y-3 mb-6" data-testid="seller-metrics">
      {sellerMetrics?.earnings_before_expiration && sellerMetrics.earnings_date && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Earnings on {sellerMetrics.earnings_date} fall before expiration. Expect an IV crush and a larger-than-usual move.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric
          label="Probability of Profit"
          term="pop"
          value={formatPercent(pop)}
          tone={pop === null ? 'text-muted-foreground' : pop >= 50 ? 'text-positive' : 'text-negative'}
          sub={targetProbability !== null
            ? `${formatPercent(targetProbability)} to hit ${settings.profitTargetPct}% target`
            : undefined}
        />
        <Metric
          label="Max Profit"
          value={formatDollars(maxProfit)}
          tone={maxProfit === null || maxProfit > 0 ? 'text-positive' : 'text-muted-foreground'}
          sub={probabilityMetrics?.risk_reward_ratio != null
            ? `Reward/risk ${probabilityMetrics.risk_reward_ratio.toFixed(2)}`
            : undefined}
        />
        <Metric
          label="Max Loss"
          value={formatDollars(maxLoss)}
          tone="text-negative"
          sub={probabilityMetrics?.breakeven_points.length
            ? `BE ${probabilityMetrics.breakeven_points.map(b => `$${b.toFixed(2)}`).join(' / ')}`
            : undefined}
        />
        <Metric
          label="Buying Power"
          term="buying-power"
          value={buyingPower === null ? 'N/A' : formatDollars(buyingPower)}
          sub={sellerMetrics?.buying_power_method === 'reg_t_naked'
            ? 'Reg-T naked estimate'
            : sellerMetrics?.buying_power_method === 'defined_risk'
              ? 'Defined risk'
              : undefined}
        />
        <Metric
          label="Return on Capital"
          term="roc"
          value={roc === null ? 'N/A' : formatPercent(roc * 100, 1)}
          sub={annualized !== null ? `${formatPercent(annualized * 100, 0)} annualized` : undefined}
        />
        <Metric
          label="Theta / Day"
          term="theta"
          value={theta === null ? 'N/A' : `${theta >= 0 ? '+' : '-'}$${Math.abs(theta).toFixed(2)}`}
          tone={theta === null ? 'text-muted-foreground' : theta >= 0 ? 'text-positive' : 'text-negative'}
          sub={thetaToBp !== null ? `${formatPercent(thetaToBp * 100, 2)} of buying power` : undefined}
        />
        <Metric
          label="Expected Move"
          term="expected-move"
          value={move ? `±$${move.amount.toFixed(2)}` : 'N/A'}
          sub={move ? `$${move.lower.toFixed(2)} – $${move.upper.toFixed(2)} in ${move.days}d` : undefined}
        />
        <Metric
          label="Short Strikes"
          term="probability-of-touch"
          value={shortStrikes.length ? `${shortStrikes.length} short` : 'None'}
          sub={shortStrikes.length ? (
            <ul className="space-y-0.5">
              {shortStrikes.map(s => (
                <li key={`${s.type}-${s.strike}`}>
                  {s.strike}{s.type}: ITM {formatPercent(s.probability_itm)} · touch {formatPercent(s.probability_of_touch)}
                </li>
              ))}
            </ul>
          ) : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Target className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          Management
        </span>
        <SettingInput
          label="Profit target"
          value={settings.profitTargetPct}
          suffix="% of max"
          min={5}
          max={100}
          step={5}
          onChange={(profitTargetPct) => onSettingsChange({ ...settings, profitTargetPct })}
        />
        <SettingInput
          label="Stop at"
          value={settings.stopMultiple}
          suffix="× credit"
          min={0.5}
          max={10}
          step={0.5}
          onChange={(stopMultiple) => onSettingsChange({ ...settings, stopMultiple })}
        />
        <SettingInput
          label="Manage at"
          value={settings.managementDte}
          suffix="DTE"
          min={0}
          max={365}
          step={1}
          onChange={(managementDte) => onSettingsChange({ ...settings, managementDte })}
        />
      </div>
    </div>
  );
}
