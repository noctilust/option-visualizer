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
              <div className="flex min-w-8 flex-col items-center gap-1">
                <div
                  className={`
                    flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all
                    ${isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                        : 'bg-muted text-muted-foreground'
                    }
                  `}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" aria-hidden="true" />
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
                  className={`mt-4 h-0.5 min-w-4 flex-1 mx-1 md:mx-2 transition-colors ${
                    step.completed ? 'bg-emerald-500' : 'bg-muted'
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
