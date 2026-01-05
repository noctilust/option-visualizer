import { Check } from 'lucide-react';

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: { label: string; completed: boolean }[];
}

export default function StepProgress({ steps }: StepProgressProps) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-center gap-2 md:gap-4">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = step.completed;
          const isCurrent = !isCompleted && (index === 0 || steps[index - 1].completed);

          return (
            <li key={stepNumber} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`
                    flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all
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
                <span className={`text-xs hidden md:block ${isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`w-8 md:w-12 h-0.5 mx-1 md:mx-2 transition-colors ${
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
