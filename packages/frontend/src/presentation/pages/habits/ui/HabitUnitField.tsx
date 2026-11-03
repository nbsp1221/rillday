import { Autocomplete } from '@base-ui/react/autocomplete';
import { Field } from '@base-ui/react/field';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '#shared/i18n';

export function HabitUnitField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const units = [
    t('habits.times'),
    t('habits.units.cups'),
    t('duration.minuteUnit'),
    'km',
    t('habits.units.pages'),
  ];

  return (
    <Field.Root
      className="habit-setting-row grid min-h-(--control-height) grid-cols-[minmax(0,1fr)_minmax(0,min(50%,156px))] items-center gap-2"
      validate={(unit) =>
        typeof unit === 'string' && unit.trim() ? null : t('habits.unitRequired')
      }
    >
      <Field.Label className="w-fit text-sm text-muted-foreground">{t('habits.unit')}</Field.Label>
      <div className="habit-unit-field min-w-0">
        <Autocomplete.Root
          value={value}
          onValueChange={onChange}
          items={units}
          mode="none"
          autoHighlight="always"
          required
        >
          <Autocomplete.InputGroup className="habit-unit-control flex h-(--control-height) items-center overflow-hidden rounded-sm border border-control-border focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-ring">
            <Autocomplete.Input
              maxLength={20}
              className="w-full min-w-0 bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            <Autocomplete.Trigger
              className="grid h-full w-8 shrink-0 place-items-center hover:bg-overlay-hover"
              aria-label={t('habits.suggestedUnits')}
            >
              <ChevronDown size={14} />
            </Autocomplete.Trigger>
          </Autocomplete.InputGroup>
          <Autocomplete.Portal>
            <Autocomplete.Positioner
              align="start"
              sideOffset={8}
              collisionPadding={8}
              className="isolate z-50"
            >
              <Autocomplete.Popup className="habit-unit-panel relative w-50 max-w-[calc(100vw-16px)] max-h-[min(var(--available-height),calc(100dvh-16px))] overflow-auto overscroll-contain rounded-md ring-1 ring-foreground/10 bg-popover p-1 text-popover-foreground shadow-md">
                <Autocomplete.List>
                  {units.map((unit) => (
                    <Autocomplete.Item
                      key={unit}
                      value={unit}
                      className="flex min-h-8 items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-overlay-hover"
                    >
                      <span className="flex-1">{unit}</span>
                      {value === unit && <Check size={14} />}
                    </Autocomplete.Item>
                  ))}
                </Autocomplete.List>
                <p className="m-2 text-xs text-muted-foreground">{t('habits.customUnitHint')}</p>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
        <Field.Error className="mt-1 block text-xs text-danger-text">
          {t('habits.unitRequired')}
        </Field.Error>
      </div>
    </Field.Root>
  );
}
