import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
import { cn } from 'cn';
import { ChevronDown, Clock3, Hourglass, Repeat2 } from 'lucide-react';
import { type ComponentProps, type RefObject, useId, useMemo, useRef, useState } from 'react';
import { type RepeatRule, addDays, dateKey } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceCalendar } from '#shared/ui/WorkspaceCalendar';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';
import { DateFieldPopover } from './DateFieldPopover';
import { DurationPicker, RepeatPicker, durationLabel, repeatLabel } from './SchedulePickers';
import { TimePicker } from './TimePicker';

type ScheduleProperty = 'time' | 'duration' | 'repeat';

function DatePropertyTrigger({
  property,
  activeProperty,
  popupId,
  handle,
  label,
  onOpen,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  property: ScheduleProperty;
  activeProperty: ScheduleProperty | null;
  popupId: string;
  handle: NonNullable<Popover.Root.Props['handle']>;
  label: string;
  onOpen: (
    property: ScheduleProperty,
    trigger: HTMLButtonElement,
    anchor: HTMLDivElement | null,
    mode: 'open' | 'toggle',
  ) => void;
}) {
  const expanded = property === activeProperty;
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef} className="-mx-3 px-3">
      <Popover.Trigger
        handle={handle}
        id={`${popupId}-${property}`}
        {...props}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? popupId : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onOpen(property, event.currentTarget, anchorRef.current, 'open');
          }
        }}
        onClick={(event) => onOpen(property, event.currentTarget, anchorRef.current, 'toggle')}
      >
        {children}
        <ChevronDown className="size-4 inline-block shrink-0 align-middle" />
      </Popover.Trigger>
    </div>
  );
}

export function DatePickerPanel({
  panelRef,
  anchorRef,
  handle,
  triggerId,
  align = 'start',
  id,
  className = '',
  label,
  calendarLabel,
  value,
  onChange,
  close,
  time,
  onTimeChange,
  duration,
  onDurationChange,
  repeat,
  onRepeatChange,
  sourceZone,
}: {
  sourceZone?: string | null;
  panelRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLButtonElement | null>;
  handle: NonNullable<Popover.Root.Props['handle']>;
  triggerId: string;
  align?: 'start' | 'end';
  id?: string;
  className?: string;
  label: string;
  calendarLabel: string;
  value: string | null;
  onChange: (value: string | null) => void;
  close: () => void;
  time: string | null;
  onTimeChange: (value: string | null) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  repeat: RepeatRule | null;
  onRepeatChange: (value: RepeatRule | null) => void;
}) {
  const { t, formatTime } = useI18n();
  const [property, setProperty] = useState<'time' | 'duration' | 'repeat' | null>(null);
  const propertyAnchorRef = useRef<HTMLButtonElement>(null);
  const propertyPositionRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const propertyHandle = useMemo(() => Popover.createHandle(), []);

  function dismiss() {
    setProperty((current) => (current === property ? null : current));
  }

  function open(
    next: ScheduleProperty,
    target: HTMLButtonElement,
    anchor: HTMLDivElement | null,
    mode: 'open' | 'toggle',
  ) {
    propertyAnchorRef.current = target;
    propertyPositionRef.current = anchor;
    setProperty((current) => (mode === 'toggle' && current === next ? null : next));
  }

  const title = t(
    property === 'time'
      ? 'dates.time'
      : property === 'duration'
        ? 'duration.title'
        : 'dates.repeat',
  );

  return (
    <WorkspacePopover
      ref={panelRef}
      anchor={anchorRef}
      handle={handle}
      triggerId={triggerId}
      onClose={close}
      initialFocus={false}
      align={align}
      id={id}
      className={cn(
        'date-picker-panel w-76 flex flex-col overflow-hidden [font-family:var(--font-sans)] text-sm leading-(--text-sm--line-height)',
        className,
      )}
      role="dialog"
      aria-label={label}
    >
      <div className="date-picker-body flex flex-col gap-3 min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover overscroll-contain p-3">
        <div className="date-picker-shortcuts flex gap-1 [&_>_button]:flex-1 [&_>_button]:px-1">
          {[
            { label: 'dates.today', days: 0 },
            { label: 'dates.tomorrow', days: 1 },
            { label: 'dates.nextWeek', days: 7 },
          ].map((item) => (
            <Button
              key={item.days}
              variant="ghost"
              size="sm"
              onClick={() => onChange(addDays(dateKey(), item.days))}
              className={' text-muted-foreground hover:text-foreground'}
            >
              {t(item.label)}
            </Button>
          ))}
        </div>
        <WorkspaceCalendar
          value={value}
          label={calendarLabel}
          onChange={(next) => {
            setProperty(null);
            onChange(next);
          }}
        />
        {time && sourceZone && sourceZone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
          <p className="schedule-zone-hint [margin:8px_0_0] py-0 px-2 text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('tasks.timeZoneDescription', {
              zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}{' '}
            {repeat && t('tasks.recurrenceTimeZone', { zone: sourceZone })}
          </p>
        )}
        <div className="date-schedule-properties flex flex-col gap-1 [border-top:1px_solid_var(--separator)] pt-2">
          <DatePropertyTrigger
            property="time"
            activeProperty={property}
            popupId={popupId}
            handle={propertyHandle}
            onOpen={open}
            className="date-property-trigger [&[aria-expanded='true']]:bg-overlay-hover flex items-center gap-2 w-full min-h-(--control-height) py-1.5 px-2 rounded-sm text-muted-foreground text-left [&_>_span]:mr-auto [&_>_time]:text-popover-foreground hover:bg-overlay-hover date-time-trigger"
            label={t('time.set')}
            data-time={time ?? ''}
          >
            <Clock3 className="size-4 inline-block shrink-0 align-middle" />
            <span>{t('dates.time')}</span>
            {time ? <time dateTime={time}>{formatTime(time)}</time> : t('time.none')}
          </DatePropertyTrigger>
          <DatePropertyTrigger
            property="duration"
            activeProperty={property}
            popupId={popupId}
            handle={propertyHandle}
            onOpen={open}
            className="date-property-trigger [&[aria-expanded='true']]:bg-overlay-hover flex items-center gap-2 w-full min-h-(--control-height) py-1.5 px-2 rounded-sm text-muted-foreground text-left [&_>_span]:mr-auto [&_>_time]:text-popover-foreground hover:bg-overlay-hover date-duration-trigger"
            label={t('duration.set')}
            data-duration={duration}
          >
            <Hourglass className="size-4 inline-block shrink-0 align-middle" />
            <span>{t('duration.title')}</span>
            <span className="schedule-value [.date-property-trigger_>_&]:mr-0 [.date-property-trigger_>_&]:min-w-0 [.date-property-trigger_>_&]:overflow-hidden [.date-property-trigger_>_&]:text-ellipsis [.date-property-trigger_>_&]:whitespace-nowrap [.date-property-trigger_>_&]:text-popover-foreground">
              {durationLabel(duration, t)}
            </span>
          </DatePropertyTrigger>
          <DatePropertyTrigger
            property="repeat"
            activeProperty={property}
            popupId={popupId}
            handle={propertyHandle}
            onOpen={open}
            className="date-property-trigger [&[aria-expanded='true']]:bg-overlay-hover flex items-center gap-2 w-full min-h-(--control-height) py-1.5 px-2 rounded-sm text-muted-foreground text-left [&_>_span]:mr-auto [&_>_time]:text-popover-foreground hover:bg-overlay-hover date-repeat-trigger"
            label={t('repeat.set')}
            data-frequency={repeat?.frequency ?? 'none'}
            data-interval={repeat?.interval}
            data-until={repeat?.until}
            title={repeat?.until ? `${repeatLabel(repeat, t)} · ${repeat.until}` : undefined}
          >
            <Repeat2 className="size-4 inline-block shrink-0 align-middle" />
            <span>{t('dates.repeat')}</span>
            <span className="schedule-value [.date-property-trigger_>_&]:mr-0 [.date-property-trigger_>_&]:min-w-0 [.date-property-trigger_>_&]:overflow-hidden [.date-property-trigger_>_&]:text-ellipsis [.date-property-trigger_>_&]:whitespace-nowrap [.date-property-trigger_>_&]:text-popover-foreground">
              {repeatLabel(repeat, t)}
            </span>
          </DatePropertyTrigger>
        </div>
      </div>
      <div className="overlay-footer flex shrink-0 items-center justify-between gap-(--overlay-gap) p-3 [border-top:1px_solid_var(--separator)] date-picker-footer">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            close();
          }}
          className={' text-muted-foreground hover:text-foreground'}
        >
          {t('dates.clear')}
        </Button>
        <Popover.Close
          render={<Button size="sm" />}
          className={
            ' bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
          }
        >
          {t('common.complete')}
        </Popover.Close>
      </div>
      {property && (
        <DateFieldPopover
          key={property}
          id={popupId}
          anchor={propertyAnchorRef}
          positionAnchor={propertyPositionRef}
          handle={propertyHandle}
          title={title}
          kind={property}
          dismiss={dismiss}
          clear={() => {
            if (property === 'time') {
              onTimeChange(null);
            } else if (property === 'duration') {
              onDurationChange(30);
            } else {
              onRepeatChange(null);
            }

            dismiss();
          }}
        >
          {(editor, done) =>
            property === 'time' ? (
              <TimePicker value={time} onChange={onTimeChange} back={done} editor={editor} />
            ) : property === 'duration' ? (
              <DurationPicker
                value={duration}
                onChange={onDurationChange}
                back={done}
                editor={editor}
              />
            ) : (
              <RepeatPicker
                value={repeat}
                date={value}
                onChange={onRepeatChange}
                back={done}
                editor={editor}
              />
            )
          }
        </DateFieldPopover>
      )}
    </WorkspacePopover>
  );
}
