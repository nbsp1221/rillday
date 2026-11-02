import { cn } from 'cn';
import { Meter } from 'react-aria-components/Meter';

export function HabitProgressRing({
  completed,
  total,
  label,
  compact = false,
}: {
  completed: number;
  total: number;
  label: string;
  compact?: boolean;
}) {
  return (
    <Meter value={completed} maxValue={total || 1} aria-label={label}>
      {({ percentage }) => (
        <span
          className={cn(
            'progress-ring relative inline-grid size-16 shrink-0 place-items-center rounded-full bg-[conic-gradient(var(--link)_var(--progress),var(--surface-selected)_0)] before:absolute before:inset-1 before:rounded-[inherit] before:bg-background',
            compact && 'is-compact size-4 before:inset-0.5',
          )}
          style={{ '--progress': `${percentage}%` }}
        >
          {!compact && (
            <span className="progress-ring-value relative flex items-baseline gap-0.5">
              <strong className="text-xl font-medium">{completed}</strong>
              <small className="text-xs text-muted-foreground">/{total}</small>
            </span>
          )}
        </span>
      )}
    </Meter>
  );
}
