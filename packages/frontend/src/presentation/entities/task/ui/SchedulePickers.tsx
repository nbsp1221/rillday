import type { TFunction } from 'i18next';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { NumberField } from '@base-ui/react/number-field';
import { Radio as OptionRadio } from '@base-ui/react/radio';
import { Label } from '@repo/ui/components/label';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { cn } from 'cn';
import { Check, Minus, Plus } from 'lucide-react';
import {
  type RefObject,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RepeatRule } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceCalendar } from '#shared/ui/WorkspaceCalendar';
import { WorkspaceNumberField } from '#shared/ui/WorkspaceNumberField';
import type { DateFieldEditor } from './DateFieldPopover';

const frequencies = ['daily', 'weekly', 'monthly', 'weekdays'] as const;

export function durationLabel(value: number, t: TFunction) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return hours
    ? minutes
      ? t('duration.hoursMinutes', { hours, minutes })
      : t('duration.hours', { hours })
    : t('duration.minutes', { minutes });
}

export function repeatLabel(value: RepeatRule | null, t: TFunction) {
  if (!value) {
    return t('repeat.none');
  }

  // Preset wording such as "Every day" is separate from count-based interval wording.
  if (value.interval === 1) {
    return t(`repeat.frequency.${value.frequency}`, { ns: 'labels' });
  }

  return t('repeat.interval', {
    ns: 'labels',
    context: value.frequency,
    count: value.interval,
  });
}

function useEditorFocus(view: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector<HTMLElement>(
          view === 'custom' ? '.repeat-custom-fields [data-editor-focus]' : '[data-editor-focus]',
        )
        ?.focus(),
    );

    return () => cancelAnimationFrame(frame);
  }, [view]);

  return rootRef;
}

export function DurationPicker({
  value,
  onChange,
  back,
  editor,
}: {
  value: number;
  onChange: (value: number) => void;
  back: () => void;
  editor: RefObject<DateFieldEditor | null>;
}) {
  const { t, dateLocale } = useI18n();
  const controlId = useId();
  const root = useEditorFocus('duration');
  const [minutes, setMinutes] = useState<number | null>(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const validationInputRef = useRef<HTMLInputElement>(null);
  const fieldActionsRef = useRef<Field.Root.Actions>(null);

  function apply() {
    fieldActionsRef.current?.validate();

    if (!validationInputRef.current?.checkValidity() || minutes === null) {
      inputRef.current?.focus();

      return false;
    }

    onChange(minutes);

    return true;
  }

  useImperativeHandle(editor, () => ({ apply }));

  return (
    <div ref={root} className="schedule-picker flex flex-col gap-3">
      <div
        className="duration-presets grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-2 [&_>_button]:flex [&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:gap-1 [&_>_button]:min-h-(--control-height) [&_>_button]:py-1 [&_>_button]:px-1 [&_>_button]:border [&_>_button]:border-control-border [&_>_button]:rounded-sm [&_>_button[aria-checked='true']]:border-link [&_>_button[aria-checked='true']]:text-link [&_>_button[aria-checked='true']]:bg-overlay-hover [&_>_button[aria-pressed='true']]:border-link [&_>_button[aria-pressed='true']]:text-link [&_>_button[aria-pressed='true']]:bg-overlay-hover [&_>_button:hover]:bg-overlay-hover"
        aria-label={t('duration.choose')}
      >
        {[15, 30, 45, 60, 90, 120].map((minutes) => (
          <ButtonPrimitive
            type="button"
            key={minutes}
            aria-pressed={minutes === value}
            onClick={() => {
              onChange(minutes);
              back();
            }}
          >
            {durationLabel(minutes, t)}
            {minutes === value && <Check className="size-3.5 inline-block shrink-0 align-middle" />}
          </ButtonPrimitive>
        ))}
      </div>
      <Field.Root
        actionsRef={fieldActionsRef}
        validationMode="onBlur"
        className="flex flex-col gap-3"
      >
        <div className="schedule-field flex items-center gap-2 text-sm leading-none font-medium select-none text-muted-foreground">
          <Label htmlFor={controlId} aria-hidden="true">
            {t('common.custom')}
          </Label>
          <Field.Label htmlFor={controlId} className="sr-only">
            {t('duration.minutesLabel')}
          </Field.Label>
          <NumberField.Root
            render={<span />}
            className="schedule-number ml-auto flex items-center gap-2"
            id={controlId}
            inputRef={validationInputRef}
            locale={dateLocale}
            min={5}
            max={1440}
            step={1}
            smallStep={1}
            required
            allowOutOfRange
            value={minutes}
            onValueChange={setMinutes}
          >
            <NumberField.Input
              ref={inputRef}
              id={controlId}
              data-editor-focus
              autoComplete="off"
              aria-roledescription={t('controls.numberField')}
              aria-describedby={`${controlId}-hint`}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  event.stopPropagation();

                  if (apply()) {
                    back();
                  }
                }
              }}
              className="h-(--control-height) w-22 min-w-0 border-0 bg-transparent dark:bg-input/30 p-0 text-sm outline-none"
            />
            <span aria-hidden="true">{t('duration.minuteUnit')}</span>
          </NumberField.Root>
        </div>
        <Field.Validity>
          {({ validity }) => (
            <Field.Description
              id={`${controlId}-hint`}
              className={cn(
                validity.valid === false
                  ? 'time-picker-error m-0 text-xs leading-(--text-xs--line-height) text-muted-foreground text-danger-text'
                  : 'time-picker-hint m-0 text-xs leading-(--text-xs--line-height) text-muted-foreground',
              )}
              role={validity.valid === false ? 'alert' : undefined}
            >
              {t('duration.range')}
            </Field.Description>
          )}
        </Field.Validity>
      </Field.Root>
    </div>
  );
}

function useRepeatDraft(
  value: RepeatRule | null,
  onChange: (value: RepeatRule) => void,
  customOpen: boolean,
) {
  const [showUntil, setShowUntil] = useState(false);
  const [draft, setDraft] = useState<RepeatRule>(value ?? { frequency: 'daily', interval: 1 });
  const [interval, setInterval] = useState<number | null>(draft.interval);
  const [invalid, setInvalid] = useState(false);
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function apply() {
    if (!customOpen) {
      return true;
    }

    if (interval === null || !Number.isInteger(interval) || interval < 1 || interval > 365) {
      setInvalid(true);
      requestAnimationFrame(() => inputRef.current?.focus());

      return false;
    }

    onChange({ ...draft, interval });

    return true;
  }

  return {
    showUntil,
    setShowUntil,
    draft,
    setDraft,
    interval,
    setInterval,
    invalid,
    setInvalid,
    endTriggerRef,
    inputRef,
    apply,
  };
}

function RepeatCustomFields({
  form,
  value,
  date,
  controlId,
  back,
}: {
  form: ReturnType<typeof useRepeatDraft>;
  value: RepeatRule | null;
  date: string | null;
  controlId: string;
  back: () => void;
}) {
  const { t, formatDate } = useI18n();
  const {
    showUntil,
    setShowUntil,
    draft,
    setDraft,
    interval,
    setInterval,
    invalid,
    setInvalid,
    endTriggerRef,
    inputRef,
    apply,
  } = form;

  function changeFrequency(frequency: string) {
    const nextFrequency = frequencies.find((entry) => entry === frequency);

    if (!nextFrequency) {
      return;
    }

    setDraft({
      ...draft,
      frequency: nextFrequency,
      anchorDay: frequency === value?.frequency ? value.anchorDay : undefined,
    });
  }

  function changeEndDate(until: string | undefined) {
    setDraft({ ...draft, until });
    setShowUntil(false);
    requestAnimationFrame(() => endTriggerRef.current?.focus());
  }

  return (
    <div className="repeat-custom-fields flex flex-col gap-3 [border-top:1px_solid_var(--separator)] pt-3 [.date-field-popover_&]:[padding:12px_8px_8px]">
      <fieldset className="repeat-frequencies min-w-0 m-0 p-0 border-0 [&_>_legend]:p-0 [&_>_legend]:mb-2 [&_>_legend]:text-muted-foreground">
        <legend>{t('repeat.frequency')}</legend>
        <RadioGroup
          className="repeat-frequency-options grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-2"
          aria-label={t('repeat.frequency')}
          value={draft.frequency}
          onValueChange={changeFrequency}
        >
          {frequencies.map((frequency) => (
            <OptionRadio.Root
              render={<button type="button" />}
              nativeButton
              className="repeat-frequency-choice w-full min-w-0 min-h-(--control-height) grid place-items-center border border-control-border rounded-sm py-1 px-1 data-checked:border-link data-checked:text-link data-checked:bg-overlay-hover focus-visible:[outline:2px_solid_var(--ring)] focus-visible:outline-offset-2 hover:bg-overlay-hover"
              key={frequency}
              value={frequency}
            >
              {t(`repeat.frequency.${frequency}`, { ns: 'labels' })}
            </OptionRadio.Root>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="schedule-field flex items-center gap-2 text-muted-foreground">
        <Label htmlFor={`${controlId}-interval`}>{t('dates.interval')}</Label>
        <WorkspaceNumberField
          id={`${controlId}-interval`}
          label={t('repeat.interval')}
          value={interval}
          onValueChange={(value) => {
            setInterval(value);
            setInvalid(false);
          }}
          min={1}
          max={365}
          step={1}
          decrease={t('repeat.decreaseInterval')}
          increase={t('repeat.increaseInterval')}
          error={t('repeat.intervalRange')}
          inputRef={inputRef}
          editorFocus
          showError={invalid}
          onConfirm={() => {
            if (apply()) {
              back();
            }
          }}
        />
        <span>
          {t('repeat.unit', {
            ns: 'labels',
            context: draft.frequency,
            count: Number(interval),
          })}
        </span>
      </div>
      {draft.frequency === 'weekdays' && Number(interval) > 1 && (
        <p className="time-picker-hint m-0 text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {t('repeat.skipWeekendDescription')}
        </p>
      )}
      <div className="schedule-field flex items-center gap-2 text-muted-foreground">
        <span>{t('repeat.endDate')}</span>
        <ButtonPrimitive
          ref={endTriggerRef}
          type="button"
          aria-label={t('repeat.endDateLabel')}
          aria-expanded={showUntil}
          onClick={() => setShowUntil((current) => !current)}
          className={
            'repeat-until-trigger flex items-center gap-2 ml-auto min-h-9 py-1.5 px-2 rounded-sm text-popover-foreground hover:bg-overlay-hover date-repeat-until'
          }
        >
          <span className="schedule-value [.date-property-trigger_>_&]:mr-0 [.date-property-trigger_>_&]:min-w-0 [.date-property-trigger_>_&]:overflow-hidden [.date-property-trigger_>_&]:text-ellipsis [.date-property-trigger_>_&]:whitespace-nowrap [.date-property-trigger_>_&]:text-popover-foreground">
            {draft.until ? formatDate(draft.until) : t('repeat.noEndDate')}
          </span>
          {showUntil ? (
            <Minus className="size-3.5 inline-block shrink-0 align-middle" />
          ) : (
            <Plus className="size-3.5 inline-block shrink-0 align-middle" />
          )}
        </ButtonPrimitive>
      </div>
      {showUntil && (
        <div className="repeat-end-calendar flex flex-col gap-2">
          <WorkspaceCalendar
            value={draft.until ?? null}
            minimum={date ?? undefined}
            label={t('repeat.chooseEndDate')}
            onChange={changeEndDate}
          />
          <ButtonPrimitive
            type="button"
            onClick={() => changeEndDate(undefined)}
            className={
              'schedule-text-action min-h-8 py-1.5 px-2 text-muted-foreground text-left rounded-sm hover:bg-overlay-hover'
            }
          >
            {t('repeat.noEndDate')}
          </ButtonPrimitive>
        </div>
      )}
      <p className="time-picker-hint m-0 text-xs leading-(--text-xs--line-height) text-muted-foreground">
        {t('repeat.scheduledDateDescription')}
      </p>
    </div>
  );
}

export function RepeatPicker({
  value,
  date,
  onChange,
  back,
  editor,
}: {
  value: RepeatRule | null;
  date: string | null;
  onChange: (value: RepeatRule | null) => void;
  back: () => void;
  editor: RefObject<DateFieldEditor | null>;
}) {
  const { t } = useI18n();
  const controlId = useId();
  const [customOpen, setCustomOpen] = useState(
    () => value !== null && (value.interval !== 1 || Boolean(value.until)),
  );
  const root = useEditorFocus(customOpen ? 'custom' : 'presets');
  const form = useRepeatDraft(value, onChange, customOpen);
  const { apply } = form;
  useImperativeHandle(editor, () => ({ apply }));
  const custom = value !== null && (value.interval !== 1 || Boolean(value.until));

  return (
    <div ref={root} className="schedule-picker flex flex-col gap-3">
      <div className="schedule-options [&_>_button:hover]:bg-overlay-hover flex flex-col gap-0.5 [&_>_button]:flex [&_>_button]:items-center [&_>_button]:justify-between [&_>_button]:gap-2 [&_>_button]:min-h-9 [&_>_button]:p-2 [&_>_button]:rounded-sm [&_>_button]:text-left [&_>_button[aria-pressed='true']_>_svg]:text-link">
        {[null, ...frequencies].map((frequency) => {
          const selected = frequency === null ? !value : !custom && value?.frequency === frequency;

          return (
            <ButtonPrimitive
              key={frequency ?? 'none'}
              type="button"
              data-editor-focus={selected || undefined}
              aria-pressed={selected}
              onClick={() => {
                onChange(frequency ? { frequency, interval: 1 } : null);
                back();
              }}
            >
              <span>
                {frequency
                  ? t(`repeat.frequency.${frequency}`, { ns: 'labels' })
                  : t('repeat.none')}
              </span>
              {selected && <Check className="size-3.5 inline-block shrink-0 align-middle" />}
            </ButtonPrimitive>
          );
        })}
        <ButtonPrimitive
          type="button"
          data-editor-focus={custom || undefined}
          aria-label={t('repeat.custom')}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((current) => !current)}
          className={
            "schedule-custom [.schedule-options_>_&]:relative [.schedule-options_>_&]:mt-2 [&::before]:[content:''] [&::before]:absolute [&::before]:top-[-5px] [&::before]:left-2 [&::before]:right-2 [&::before]:[border-top:1px_solid_var(--separator)]"
          }
        >
          <span>{t('repeat.customOption')}</span>
          {customOpen ? (
            <Minus className="size-3.5 inline-block shrink-0 align-middle" />
          ) : (
            <Plus className="size-3.5 inline-block shrink-0 align-middle" />
          )}
        </ButtonPrimitive>
      </div>
      {customOpen && (
        <RepeatCustomFields
          form={form}
          value={value}
          date={date}
          controlId={controlId}
          back={back}
        />
      )}
    </div>
  );
}
