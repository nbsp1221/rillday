import { Popover } from '@base-ui/react/popover';
import { CalendarDays, Repeat2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import type { RepeatRule } from '#application';
import { useI18n } from '#shared/i18n';
import { taskDateTone } from '../model/task-date';
import { DatePickerPanel } from './DatePickerPanel';

export function CaptureDatePicker({
  value,
  time,
  repeat,
  duration,
  onChange,
  onTimeChange,
  onDurationChange,
  onRepeatChange,
}: {
  value: string | null;
  time: string | null;
  repeat: RepeatRule | null;
  duration: number;
  onDurationChange: (value: number) => void;
  onRepeatChange: (value: RepeatRule | null) => void;
  onChange: (value: string) => void;
  onTimeChange: (value: string | null) => void;
}) {
  const { t, formatDate, formatTime } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const controlId = useId();
  const handle = useMemo(() => Popover.createHandle(), []);
  const description = value
    ? t('dates.dateTime', {
        context: repeat ? 'repeat' : undefined,
        date: formatDate(value),
        time: time ? ` ${formatTime(time)}` : '',
      })
    : t('dates.none');

  function close() {
    setOpen(false);
  }

  return (
    <>
      <Popover.Trigger
        handle={handle}
        id={`${controlId}-trigger`}
        ref={triggerRef}
        type="button"
        data-date-tone={taskDateTone({ date: value, completedAt: null, deleted: false })}
        aria-label={t('tasks.newDueDate')}
        aria-description={description}
        title={t('dates.description', {
          context: value ? 'assigned' : undefined,
          description,
          date: value,
        })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? controlId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={
          "quick-date-trigger relative inline-flex items-center justify-center gap-1 min-w-(--capture-target) h-(--capture-target) p-0 rounded-sm text-date-color [&:has(span)]:px-1 [&_span]:max-w-28 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:text-xs [&_span]:leading-(--text-xs--line-height) [@container((max-width:_400px))]:[&:has(span)]:p-0 [@container((max-width:_400px))]:[&_span]:hidden [@container((max-width:_400px))]:[&:has(span)::after]:[content:''] [@container((max-width:_400px))]:[&:has(span)::after]:absolute [@container((max-width:_400px))]:[&:has(span)::after]:w-1 [@container((max-width:_400px))]:[&:has(span)::after]:h-1 [@container((max-width:_400px))]:[&:has(span)::after]:rounded-full [@container((max-width:_400px))]:[&:has(span)::after]:[background:currentColor] [@container((max-width:_400px))]:[&:has(span)::after]:right-0.5 [@container((max-width:_400px))]:[&:has(span)::after]:top-0.5 task-date [--date-today:var(--link)] [--date-overdue:var(--danger-text)] [--date-neutral:color-mix(in_srgb,_var(--muted-foreground)_90%,_var(--foreground))] [--date-color:var(--date-neutral)] [&[data-date-tone='today']]:[--date-color:var(--date-today)] [&[data-date-tone='overdue']]:[--date-color:var(--date-overdue)]"
        }
      >
        {repeat && value ? (
          <Repeat2 className="size-4 inline-block shrink-0 align-middle" />
        ) : (
          <CalendarDays className="size-4 inline-block shrink-0 align-middle" />
        )}
        {value && (
          <span>
            {formatDate(value)}
            {time ? ` ${formatTime(time)}` : ''}
          </span>
        )}
      </Popover.Trigger>
      {open && (
        <DatePickerPanel
          handle={handle}
          triggerId={`${controlId}-trigger`}
          panelRef={panelRef}
          anchorRef={triggerRef}
          align="end"
          id={controlId}
          className="capture-date-panel"
          label={t('tasks.newDueDate')}
          calendarLabel={t('tasks.newDueDate')}
          value={value}
          onChange={(date) => onChange(date ?? '')}
          time={time}
          onTimeChange={onTimeChange}
          duration={duration}
          onDurationChange={onDurationChange}
          repeat={repeat}
          onRepeatChange={onRepeatChange}
          close={close}
        />
      )}
    </>
  );
}
