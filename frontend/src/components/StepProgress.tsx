import { Check } from 'lucide-react';

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: { label: string; completed: boolean }[];
}

export default function StepProgress({ steps }: StepProgressProps) {
  return (
    <nav aria-label="Progress" className="w-full overflow-hidden">
      <ol className="flex w-full items-start justify-between gap-1">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = step.completed;
          const isCurrent = !isCompleted && (index === 0 || steps[index - 1].completed);

          return (
            <li key={stepNumber} className="flex min-w-0 flex-1 items-start last:flex-none">
              <div className="flex min-w-8 flex-col items-center gap-1.5">
                <div
                  className={`
                    flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors
                    ${isCompleted
                      ? 'bg-foreground text-background'
                      : isCurrent
                        ? 'border border-primary text-primary ring-2 ring-primary/20'
                        : 'border border-border text-muted-foreground'
                    }
                  `}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    stepNumber
                  )}
                </div>
                <span className={`hidden max-w-20 truncate text-xs md:block ${isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`mt-3 h-px min-w-4 flex-1 mx-1 md:mx-2 transition-colors ${
                    step.completed ? 'bg-foreground/40' : 'bg-border'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
