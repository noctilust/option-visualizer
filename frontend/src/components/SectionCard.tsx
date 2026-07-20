import type { ReactNode, Ref } from 'react';

interface SectionCardProps {
  /** Step number shown as a small badge */
  step: number;
  /** Short step label, e.g. "Stock Symbol" */
  label: string;
  title: string;
  description?: string;
  /** Optional right-aligned header content (e.g. a button or toggle) */
  action?: ReactNode;
  /** Render as quiet (dashed) panel for placeholder states */
  quiet?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export default function SectionCard({
  step,
  label,
  title,
  description,
  action,
  quiet = false,
  className = '',
  children,
  ref,
}: SectionCardProps) {
  return (
    <section ref={ref} className={`${quiet ? 'quiet-panel' : 'surface-panel'} p-4 md:p-5 ${className}`}>
      <div className={`flex items-start justify-between gap-4 ${children ? 'mb-4' : ''}`}>
        <div className="min-w-0">
          <p className="section-kicker mb-1.5 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold tabular-nums text-foreground">
              {step}
            </span>
            <span>{label}</span>
          </p>
          <h2 className={`text-lg font-semibold tracking-tight ${quiet ? 'text-muted-foreground' : ''}`}>
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
