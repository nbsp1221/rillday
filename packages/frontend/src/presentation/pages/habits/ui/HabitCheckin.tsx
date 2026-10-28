import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from 'cn';
import { CalendarDays, Check, Minus, Plus, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type Habit,
  type HabitCheckinAction,
  type HabitLog,
  habitCheckInAmountSchema,
  habitDone,
  habitScheduled,
  habitStartDate,
  habitToday,
} from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceCalendar } from '#shared/ui/WorkspaceCalendar';
import { WorkspaceNumberField } from '#shared/ui/WorkspaceNumberField';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';

export function HabitCheckin({
  habit,
  log,
  date,
  onDateChange,
  onChange,
}: {
  habit: Habit;
  log?: HabitLog;
  date: string;
  onDateChange?: (date: string) => void;
  onChange: (action: HabitCheckinAction) => void;
}) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(log?.value ?? 0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const controlId = useId();
  const handle = useMemo(() => Popover.createHandle(), []);
  const disabled =
    habit.archived || date > habitToday(habit) || (!habitScheduled(habit, date) && !log);
  const value = log?.value ?? 0;
  const done = habitDone(habit, log);
  const editingAmountRef = useRef(false);
  useEffect(() => {
    if (!editingAmountRef.current) {
      setAmount(value);
    }
  }, [habit.id, date, value]);

  function close() {
    setOpen(false);
  }

  const maximum = habitCheckInAmountSchema.maxValue!;
  const invalid = !habitCheckInAmountSchema.safeParse(amount).success;

  function commitAmount(next: number | null) {
    if (
      next !== null &&
      habitCheckInAmountSchema.safeParse(next).success &&
      !disabled &&
      next !== value
    ) {
      onChange({ type: 'amount', value: next });
    }
  }

  return (
    <div className="habit-checkin mt-4">
      <div className="habit-checkin-date flex items-center justify-between gap-2 text-sm text-muted-foreground leading-(--text-sm--line-height)">
        <span>{t('habits.checkInDate')}</span>
        {onDateChange ? (
          <Popover.Trigger
            handle={handle}
            id={`${controlId}-trigger`}
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? controlId : undefined}
            onClick={() => setOpen(!open)}
            className={
              'habit-date-button inline-flex items-center justify-center gap-2 min-h-8 py-1 px-2 rounded-sm border-0 bg-transparent text-foreground hover:bg-surface-hover'
            }
          >
            <CalendarDays className="size-3.5 inline-block shrink-0 align-middle" />
            {formatDate(date)}
          </Popover.Trigger>
        ) : (
          <span className="text-foreground">{formatDate(date)}</span>
        )}
      </div>
      {open && (
        <WorkspacePopover
          handle={handle}
          triggerId={`${controlId}-trigger`}
          ref={panelRef}
          anchor={triggerRef}
          onClose={close}
          align="end"

          id={controlId}
          className={cn('habit-date-panel w-76 p-3')}
          role="dialog"
          aria-label={t('habits.checkInDate')}
        >
          <WorkspaceCalendar
            value={date}
            minimum={habitStartDate(habit)}
            maximum={habitToday(habit)}
            label={t('habits.checkInDate')}
            onChange={(next) => {
              onDateChange?.(next);
              close();
            }}
          />
          <Popover.Close className="sr-only">{t('common.closePicker')}</Popover.Close>
        </WorkspacePopover>
      )}
      {disabled && (
        <p className="habit-checkin-hint [margin:0_0_12px] text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {habit.archived ? t('habits.archiveReadOnly') : t('habits.notScheduled')}
        </p>
      )}
      <div className="habit-checkin-value py-4 px-0 flex items-center justify-between gap-2 [&_>_strong]:text-2xl [&_>_strong]:font-medium [&_>_strong]:wrap-anywhere [&_>_strong]:min-w-0 [&_>_strong]:leading-(--text-2xl--line-height) [&_small]:text-xs [&_small]:font-normal [&_small]:text-muted-foreground [&_small]:leading-(--text-xs--line-height) [&_>_div]:flex [&_>_div]:gap-2 [&_>_div]:shrink-0">
        <strong>
          {log?.skipped ? t('habits.skipped') : value}
          <small>
            {' '}
            {habit.frequency === 'weekly-total'
              ? (log?.unit ?? habit.unit)
              : `/ ${log?.goal ?? habit.goal} ${log?.unit ?? habit.unit}`}
          </small>
        </strong>
        {habit.kind === 'quantity' && (
          <div>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || value <= 0}
              aria-label={t('habits.decreaseCheckIn')}
              onClick={() => onChange({ type: 'step', direction: 'decrease' })}
              className={'size-(--control-height)'}
            >
              <Minus className="size-4 inline-block shrink-0 align-middle" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={t('habits.increaseCheckIn')}
              onClick={() => onChange({ type: 'step', direction: 'increase' })}
              className={'size-(--control-height)'}
            >
              <Plus className="size-4 inline-block shrink-0 align-middle" />
            </Button>
          </div>
        )}
      </div>
      {habit.kind === 'quantity' && (
        <WorkspaceNumberField
          className="mb-3"
          visibleLabel
          showButtons={false}
          label={t('habits.checkInAmount')}
          value={amount}
          min={0}
          max={maximum}
          step="any"
          disabled={disabled}
          onValueChange={setAmount}
          onValueCommitted={commitAmount}
          onFocus={() => {
            editingAmountRef.current = true;
          }}
          onBlur={() => {
            editingAmountRef.current = false;
          }}
          showError={invalid}
          decrease={t('habits.decreaseCheckIn')}
          increase={t('habits.increaseCheckIn')}
          error={t('controls.numberRange', { minimum: 0, maximum })}
        />
      )}
      {habit.frequency !== 'weekly-total' && (
        <Button
          variant={done ? 'outline' : 'default'}
          disabled={disabled}
          onClick={() => onChange({ type: 'complete' })}
          className={cn(
            'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover',
            'habit-finish w-full',
          )}
        >
          <Check className="size-3.5 inline-block shrink-0 align-middle" />
          {done ? t('tasks.markIncomplete') : t('common.complete')}
        </Button>
      )}
      <div className="habit-log-actions flex gap-2 [margin:8px_0_12px] [&_>_button]:flex-1 [&_>_button]:px-2">
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange({ type: 'skip' })}
          className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
        >
          <SkipForward className="size-3.5 inline-block shrink-0 align-middle" />
          {log?.skipped ? t('habits.undoSkip') : t('habits.skip')}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setAmount(0);
            onChange({ type: 'reset' });
          }}
          className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
        >
          <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />
          {t('common.reset')}
        </Button>
      </div>
      <Textarea
        aria-label={t('habits.checkInNote')}
        placeholder={t('habits.notePlaceholder')}
        maxLength={8000}
        value={log?.note ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ type: 'note', text: event.target.value })}
        className={
          'min-h-18 w-full resize-y rounded-md border border-control-border bg-transparent p-2 text-sm'
        }
      />
    </div>
  );
}
