import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from 'cn';
import { CalendarDays, Check, Minus, Plus, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type Habit,
  type HabitCheckinAction,
  type HabitLog,
  habitDone,
  habitScheduled,
  habitStartDate,
  habitToday,
} from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceCalendar } from '#shared/ui/WorkspaceCalendar';
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
  onDateChange: (date: string) => void;
  onChange: (action: HabitCheckinAction) => void;
}) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => String(log?.value ?? 0));
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
      setAmount(String(value));
    }
  }, [habit.id, date, value]);

  function close() {
    setOpen(false);
  }

  function commitAmount() {
    const parsed = Number(amount);

    if (amount.trim() && Number.isFinite(parsed) && parsed >= 0 && !disabled) {
      if (parsed !== value) {
        onChange({ type: 'amount', value: parsed });
      }
    } else {
      setAmount(String(value));
    }
  }

  return (
    <div className="habit-checkin mt-6 [&_input]:border [&_input]:border-control-border [&_input]:rounded-md [&_input]:bg-transparent [&_input]:text-foreground [&_input]:p-2 [&_input]:min-w-0 [&_input]:box-border [&_input:focus-visible]:[outline:2px_solid_var(--ring)] [&_input:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:[outline:2px_solid_var(--ring)] [&_textarea:focus-visible]:outline-offset-2 [&_textarea]:[font-family:inherit] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:box-border [&_textarea]:min-h-18 [&_textarea]:text-sm [&_textarea]:border [&_textarea]:border-control-border [&_textarea]:rounded-md [&_textarea]:bg-transparent [&_textarea]:text-foreground [&_textarea]:p-2 [&_textarea]:leading-(--text-sm--line-height)">
      <div className="habit-checkin-date flex items-center justify-between gap-2 text-sm text-muted-foreground leading-(--text-sm--line-height)">
        <span>{t('habits.checkInDate')}</span>
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
              onDateChange(next);
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
            / {habit.goal} {habit.unit}
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
        <Label className="habit-manual-value flex items-center justify-between gap-2 text-sm text-muted-foreground leading-(--text-sm--line-height) mb-3 [&_input]:w-26 [&_input]:min-h-(--control-height)">
          {t('habits.enterAmount')}
          <Input
            aria-label={t('habits.checkInAmount')}
            type="number"
            min="0"
            step="any"
            value={amount}
            disabled={disabled}
            onFocus={() => {
              editingAmountRef.current = true;
            }}
            onChange={(event) => {
              const text = event.target.value;
              setAmount(text);
              const parsed = Number(text);

              if (text.trim() && Number.isFinite(parsed) && parsed >= 0 && !disabled) {
                onChange({ type: 'amount', value: parsed });
              }
            }}
            onBlur={() => {
              editingAmountRef.current = false;
              commitAmount();
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className={
              'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
            }
          />
        </Label>
      )}
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
            setAmount('0');
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
        value={log?.note ?? ''}
        disabled={disabled}
        onChange={(event) => onChange({ type: 'note', text: event.target.value })}
        className={
          'min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0'
        }
      />
    </div>
  );
}
