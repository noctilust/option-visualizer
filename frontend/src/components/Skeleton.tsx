interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-muted/60';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: width ?? '100%',
    height: height ?? (variant === 'text' ? '1rem' : '100%'),
  };

  if (count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            style={style}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Pre-built skeleton compositions
export function MarketDataCardSkeleton() {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5 bg-card">
      <div className="flex items-center gap-1.5 mb-1">
        <Skeleton variant="circular" width={14} height={14} />
        <Skeleton variant="text" width={80} height={12} />
      </div>
      <Skeleton variant="text" width={60} height={20} />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="h-[420px] w-full flex flex-col">
      {/* Legend skeleton */}
      <div className="flex justify-between mb-4">
        <div className="flex gap-6">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="text" width={100} height={20} />
        </div>
        <div className="flex gap-4">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="text" width={80} height={16} />
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative">
        <Skeleton className="absolute inset-0" />
        {/* Simulated chart lines */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-full h-full opacity-20" viewBox="0 0 400 200" preserveAspectRatio="none">
            <path
              d="M0,150 Q100,100 150,120 T250,80 T350,100 L400,90"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground"
            />
          </svg>
        </div>
      </div>

      {/* Zoom controls skeleton */}
      <div className="flex justify-center gap-2 mt-4">
        <Skeleton variant="rectangular" width={36} height={36} />
        <Skeleton variant="rectangular" width={36} height={36} />
        <Skeleton variant="rectangular" width={36} height={36} />
      </div>
    </div>
  );
}

export function GreeksCardSkeleton() {
  return (
    <div className="bg-card border rounded-lg p-4 relative overflow-hidden">
      {/* Accent bar */}
      <Skeleton className="absolute top-0 left-0 right-0 h-1" />

      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col gap-1">
          <Skeleton variant="text" width={50} height={14} />
          <Skeleton variant="text" width={60} height={18} className="rounded-full" />
        </div>
        <Skeleton variant="circular" width={20} height={20} />
      </div>

      <Skeleton variant="text" width={80} height={28} className="mb-1" />
      <Skeleton className="h-1.5 rounded-full mb-2" />
      <Skeleton variant="text" width="100%" height={12} />
      <Skeleton variant="text" width="80%" height={12} className="mt-1" />
    </div>
  );
}

export function PositionsTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width={100} height={24} />
        <Skeleton variant="rectangular" width={140} height={36} />
      </div>
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-muted/50 p-3 flex gap-4">
          {['Qty', 'Expiration', 'Strike', 'Type', 'Style', 'Actions'].map((_, i) => (
            <Skeleton key={i} variant="text" width={60} height={12} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-3 border-t flex gap-4 items-center">
            <Skeleton variant="text" width={40} height={32} />
            <Skeleton variant="text" width={80} height={32} />
            <Skeleton variant="text" width={60} height={32} />
            <Skeleton variant="text" width={50} height={32} />
            <Skeleton variant="text" width={70} height={32} />
            <Skeleton variant="circular" width={24} height={24} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function VolatilitySkewSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={20} height={20} />
          <Skeleton variant="text" width={120} height={24} />
        </div>
        <Skeleton variant="rectangular" width={120} height={36} />
      </div>

      {/* Gauge skeleton */}
      <div className="mb-4 flex flex-col items-center gap-3">
        <Skeleton variant="rectangular" width={200} height={32} className="rounded-full" />
        <div className="w-full max-w-md">
          <div className="flex justify-between mb-1">
            <Skeleton variant="text" width={80} height={12} />
            <Skeleton variant="text" width={60} height={12} />
            <Skeleton variant="text" width={80} height={12} />
          </div>
          <Skeleton className="h-3 rounded-full" />
        </div>
      </div>

      {/* Chart skeleton */}
      <Skeleton className="h-[300px] rounded-lg" />

      {/* Legend skeleton */}
      <div className="flex items-center justify-center gap-6 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={16} height={4} />
            <Skeleton variant="text" width={50} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}
