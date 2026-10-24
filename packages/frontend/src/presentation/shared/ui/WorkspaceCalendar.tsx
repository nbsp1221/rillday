import { Popover } from '@base-ui/react/popover';
import { UTCDate } from '@date-fns/utc';
import { Calendar } from '@repo/ui/components/calendar';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ComponentProps, useRef, useState } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components/ListBox';
import { Root as CalendarRoot, DayButton } from 'react-day-picker';
import { enUS, ko } from 'react-day-picker/locale';
import { Temporal } from 'temporal-polyfill/implementation';
import { useI18n } from '#shared/i18n';

function calendarDate(value: string | Temporal.PlainDate): Date {
  return new UTCDate(Temporal.PlainDate.from(value).toZonedDateTime('UTC').epochMilliseconds);
}

function civilDate(value: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime())
    .toZonedDateTimeISO('UTC')
    .toPlainDate()
    .toString();
}

function WorkspaceCalendarDay(props: ComponentProps<typeof DayButton>) {
  return (
    <DayButton
      {...props}
      data-date={civilDate(props.day.date)}
      data-selected-single={props.modifiers.selected}
      className="m-auto grid size-8 min-w-0 place-items-center rounded-sm border border-transparent bg-transparent p-0 text-sm text-inherit outline-none hover:bg-overlay-hover disabled:pointer-events-none disabled:opacity-50 data-[selected-single=true]:border-button-primary data-[selected-single=true]:bg-button-primary data-[selected-single=true]:text-button-primary-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 [@media(pointer:coarse)]:size-9"
    />
  );
}

export function WorkspaceCalendar({
  value,
  onChange,
  label,
  minimum,
  maximum,
}: {
  value: string | null;
  onChange: (value: string) => void;
  label: string;
  minimum?: string;
  maximum?: string;
}) {
  const { t, locale, dateLocale, weekStartsOn } = useI18n();
  const today = Temporal.Now.plainDateISO();
  const input = `${value ?? ''}|${minimum ?? ''}|${today.toString()}`;
  const [navigation, setNavigation] = useState(() => ({
    input,
    month: Temporal.PlainDate.from(value ?? minimum ?? today),
  }));
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [year, setYear] = useState(navigation.month.year);
  const captionRef = useRef<HTMLDivElement>(null);

  if (navigation.input !== input) {
    setNavigation({ input, month: Temporal.PlainDate.from(value ?? minimum ?? today) });
  }

  const month = navigation.month;
  const selectedYear = Temporal.PlainDate.from(value ?? minimum ?? today).year;
  const startYear =
    minimum && maximum
      ? Temporal.PlainDate.from(minimum).year
      : Math.max(0, Math.min(today.year - 100, selectedYear - 1));
  const endYear = maximum
    ? Temporal.PlainDate.from(maximum).year
    : Math.min(9999, Math.max(today.year + 100, selectedYear + 1));
  const firstMonth =
    minimum && maximum
      ? Temporal.PlainDate.from(minimum).toPlainYearMonth().toString()
      : Temporal.PlainYearMonth.from({ year: startYear, month: 1 }).toString();
  const lastMonth = maximum
    ? Temporal.PlainDate.from(maximum).toPlainYearMonth().toString()
    : Temporal.PlainYearMonth.from({ year: endYear, month: 12 }).toString();
  const options =
    view === 'years'
      ? Array.from({ length: endYear - startYear + 1 }, (_, index) => ({
          value: startYear + index,
          label: String(startYear + index),
        }))
      : Array.from({ length: 12 }, (_, index) => ({
          value: index + 1,
          label: Temporal.PlainDate.from({ year, month: index + 1, day: 1 }).toLocaleString(
            dateLocale,
            { month: 'short' },
          ),
        }));
  const disabledMonths =
    view === 'months'
      ? options
          .filter((option) => {
            const candidate = Temporal.PlainYearMonth.from({
              year,
              month: option.value,
            }).toString();

            return candidate < firstMonth || candidate > lastMonth;
          })
          .map((option) => option.value)
      : [];

  function setMonth(next: Temporal.PlainDate) {
    setNavigation({ input, month: next });
  }

  function choosePeriod(value: number) {
    if (view === 'years') {
      setYear(value);
      setView('months');
    } else {
      setMonth(Temporal.PlainDate.from({ year, month: value, day: 1 }));
      setView('days');
    }
  }

  return (
    <div className="date-calendar relative text-sm text-popover-foreground">
      <Popover.Root
        open={view !== 'days'}
        onOpenChange={(open) => {
          if (!open) {
            setView('days');
          }
        }}
      >
        <div
          ref={captionRef}
          className="calendar-caption mb-2 flex min-h-8 items-center justify-between gap-2"
          data-month={month.toPlainYearMonth().toString()}
        >
          <div className="flex min-w-0 items-center gap-1">
            {view !== 'days' && (
              <Popover.Close
                className="calendar-period-back grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-overlay-hover"
                aria-label={t('dates.backToCalendar')}
              >
                <ChevronLeft size={14} />
              </Popover.Close>
            )}
            <Popover.Trigger
              className="calendar-period-trigger flex min-h-8 min-w-0 items-center gap-1 rounded-sm px-1 hover:bg-overlay-hover"
              aria-label={t(
                view === 'days'
                  ? 'dates.choosePeriod'
                  : view === 'months'
                    ? 'dates.chooseYear'
                    : 'dates.chooseMonth',
              )}
              onClick={(event) => {
                event.preventBaseUIHandler();

                if (view === 'days') {
                  setYear(month.year);
                }

                setView(view === 'months' ? 'years' : 'months');
              }}
            >
              <span>
                {view === 'days'
                  ? month.toLocaleString(dateLocale, { year: 'numeric', month: 'long' })
                  : view === 'months'
                    ? year
                    : t('dates.chooseYear')}
              </span>
              <ChevronDown size={14} />
            </Popover.Trigger>
          </div>
          <nav
            aria-label={t(view === 'months' ? 'dates.yearNavigation' : 'dates.navigation')}
            className="flex gap-1"
            style={{ visibility: view === 'years' ? 'hidden' : undefined }}
            inert={view === 'years'}
            aria-hidden={view === 'years' || undefined}
          >
            <button
              type="button"
              className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-overlay-hover disabled:opacity-40"
              aria-label={t(view === 'months' ? 'dates.previousYear' : 'dates.previousMonth')}
              disabled={
                view === 'months'
                  ? year <= startYear
                  : month.toPlainYearMonth().toString() <= firstMonth
              }
              onClick={() =>
                view === 'months'
                  ? setYear(year - 1)
                  : setMonth(month.with({ day: 1 }).subtract({ months: 1 }))
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-overlay-hover disabled:opacity-40"
              aria-label={t(view === 'months' ? 'dates.nextYear' : 'dates.nextMonth')}
              disabled={
                view === 'months'
                  ? year >= endYear
                  : month.toPlainYearMonth().toString() >= lastMonth
              }
              onClick={() =>
                view === 'months'
                  ? setYear(year + 1)
                  : setMonth(month.with({ day: 1 }).add({ months: 1 }))
              }
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        </div>
        <div
          className="calendar-day-view"
          style={{ visibility: view === 'days' ? undefined : 'hidden' }}
          inert={view !== 'days'}
          aria-hidden={view !== 'days' || undefined}
        >
          <Calendar
            mode="single"
            required
            autoFocus
            aria-label={label}
            className="w-full bg-transparent p-0"
            locale={locale === 'ko' ? ko : enUS}
            weekStartsOn={weekStartsOn}
            today={calendarDate(today.toString())}
            selected={value ? calendarDate(value) : undefined}
            onSelect={(day) => {
              if (day) {
                onChange(civilDate(day));
              }
            }}
            month={calendarDate(month.toString())}
            onMonthChange={(day) => setMonth(Temporal.PlainDate.from(civilDate(day)))}
            hideNavigation
            fixedWeeks
            startMonth={calendarDate(
              Temporal.PlainDate.from({ year: startYear, month: 1, day: 1 }),
            )}
            endMonth={calendarDate(Temporal.PlainDate.from({ year: endYear, month: 12, day: 31 }))}
            disabled={[
              ...(minimum ? [{ before: calendarDate(minimum) }] : []),
              ...(maximum ? [{ after: calendarDate(maximum) }] : []),
            ]}
            classNames={{
              root: 'w-full',
              month: 'relative',
              months: 'relative',
              month_caption: 'hidden',
              month_grid: 'w-full table-fixed border-collapse',
              weekdays: '',
              weekday: 'h-7 p-0 text-center text-xs font-normal text-muted-foreground',
              week: '',
              day: 'h-9 p-0 text-center [@media(pointer:coarse)]:h-10',
              today: '[&_button]:border-link',
              outside: 'text-muted-foreground',
              hidden: 'invisible',
            }}
            labels={{
              labelDayButton: (day, modifiers) => {
                const date = Temporal.PlainDate.from(civilDate(day)).toLocaleString(dateLocale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                });

                return modifiers.today ? t('dates.todayLabel', { date }) : date;
              },
            }}
            components={{ Root: CalendarRoot, DayButton: WorkspaceCalendarDay }}
          />
        </div>
        <Popover.Portal>
          <Popover.Positioner
            anchor={captionRef}
            side="bottom"
            align="start"
            sideOffset={8}
            collisionAvoidance={{ side: 'none', align: 'none' }}
            className="isolate z-50 w-(--anchor-width)"
          >
            <Popover.Popup
              initialFocus={false}
              aria-label={t('dates.choosePeriod')}
              className="calendar-period-chooser h-61 bg-popover [@media(pointer:coarse)]:h-67"
            >
              <ListBox
                key={view}
                aria-label={t(view === 'years' ? 'dates.chooseYear' : 'dates.chooseMonth')}
                layout="grid"
                selectionMode="single"
                selectedKeys={[view === 'years' ? year : month.month]}
                disabledKeys={disabledMonths}
                autoFocus
                disallowEmptySelection
                className="calendar-period-grid grid h-full min-h-0 grid-cols-3 auto-rows-[44px] content-start gap-1 overflow-auto overscroll-contain outline-none"
                data-view={view}
              >
                {options.map((option) => (
                  <ListBoxItem
                    id={option.value}
                    key={option.value}
                    data-value={option.value}
                    textValue={option.label}
                    onPress={() => choosePeriod(option.value)}
                    className="min-w-0 rounded-sm p-2 text-center tabular-nums outline-none hover:bg-overlay-hover data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-ring data-selected:bg-button-primary data-selected:text-button-primary-foreground data-disabled:opacity-40"
                  >
                    {option.label}
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
