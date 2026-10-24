import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { ChevronDown, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { calendarViews } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useI18n } from '#shared/i18n';
import { WorkspaceActions } from '#shared/ui/WorkspaceActions';

export function CalendarToolbar({
  title,
  onToday,
  navigate,
  showUndated,
  setShowUndated,
}: {
  title: string;
  onToday: () => void;
  navigate: (direction: number) => void;
  showUndated: boolean;
  setShowUndated: (visible: boolean) => void;
}) {
  const { t } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();
  const mode = preferences.calendarView;

  const setMode = (calendarView: typeof mode) => updatePreferences({ calendarView });

  const showCompleted = preferences.calendarShowCompleted;

  const setShowCompleted = (calendarShowCompleted: boolean) =>
    updatePreferences({ calendarShowCompleted });

  const modeLabels = {
    year: t('calendar.year'),
    month: t('calendar.month'),
    week: t('calendar.week'),
    day: t('calendar.day'),
    agenda: t('calendar.agenda'),
  };
  const modeLabel = modeLabels[mode];

  return (
    <div className="calendar-toolbar flex items-center justify-between shrink-0 min-w-0 gap-4 py-3 px-(--layout-page-inset) [@media(max-width:_899px)]:px-(--calendar-inset) [@media(max-width:_700px)]:grid [@media(max-width:_700px)]:grid-cols-[minmax(0,_1fr)] [@media(max-width:_700px)]:gap-2">
      <div className="calendar-period flex items-center flex-1 min-w-0 gap-3 [&_strong]:min-w-0 [&_strong]:text-sm [&_strong]:leading-(--text-sm--line-height) [&_strong]:font-medium [&_strong]:whitespace-nowrap [&_strong]:overflow-hidden [&_strong]:text-ellipsis [@media(max-width:_700px)]:gap-2">
        <ButtonPrimitive
          onClick={onToday}
          className={
            'calendar-today inline-flex items-center justify-center h-8 shrink-0 p-0 rounded-md text-muted-foreground px-3 border border-separator text-sm leading-(--text-sm--line-height) hover:text-foreground hover:bg-surface-hover'
          }
        >
          {t('dates.today')}
        </ButtonPrimitive>
        <div className="calendar-navigation flex shrink-0 gap-1 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:h-8 [&_button]:shrink-0 [&_button]:p-0 [&_button]:rounded-md [&_button]:text-muted-foreground [&_button]:w-8 [&_button:hover]:text-foreground [&_button:hover]:bg-surface-hover">
          <ButtonPrimitive aria-label={t('navigation.previousPeriod')} onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4 inline-block shrink-0 align-middle" />
          </ButtonPrimitive>
          <ButtonPrimitive aria-label={t('navigation.nextPeriod')} onClick={() => navigate(1)}>
            <ChevronRight className="size-4 inline-block shrink-0 align-middle" />
          </ButtonPrimitive>
        </div>
        <strong title={title}>{title}</strong>
      </div>
      <div className="calendar-toolbar-end flex items-center shrink-0 gap-2 [@media(max-width:_700px)]:justify-end">
        <WorkspaceActions
          label={t('calendar.view')}
          title={t('calendar.view')}
          className="calendar-view-menu w-auto"
          triggerClassName="h-8 w-auto gap-2 px-3 border border-separator rounded-md text-sm opacity-100 hover:text-foreground hover:bg-surface-hover aria-expanded:text-foreground aria-expanded:bg-surface-hover"
          triggerIcon={
            <>
              <span>{modeLabel}</span>
              <ChevronDown className="size-4 inline-block shrink-0 align-middle" />
            </>
          }
          items={calendarViews.map((value) => ({
            label: modeLabels[value],
            checked: mode === value,
            action: () => setMode(value),
          }))}
        />
        <WorkspaceActions
          label={t('calendar.displayOptions')}
          title={t('calendar.displayOptions')}
          className="calendar-options-menu w-8"
          triggerClassName="size-8 opacity-100 rounded-md hover:text-foreground hover:bg-surface-hover aria-expanded:text-foreground aria-expanded:bg-surface-hover"
          triggerIcon={<Settings2 className="size-4 inline-block shrink-0 align-middle" />}
          items={[
            {
              label: t('calendar.showCompleted'),
              checked: showCompleted,
              kind: 'checkbox',
              action: () => setShowCompleted(!showCompleted),
            },
            {
              label: t('calendar.showUndated'),
              checked: showUndated,
              kind: 'checkbox',
              action: () => setShowUndated(!showUndated),
            },
          ]}
        />
      </div>
    </div>
  );
}
