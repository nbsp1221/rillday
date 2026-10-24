import { Field as FormField } from '@base-ui/react/field';
import { Popover } from '@base-ui/react/popover';
import { Radio as OptionRadio } from '@base-ui/react/radio';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';
import { HabitGlyph, habitIcons, resolveHabitIcon } from './habit-icons';

export function HabitIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const controlId = useId();
  const handle = useMemo(() => Popover.createHandle(), []);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const current = resolveHabitIcon(value);
  const label = t('habits.icon');

  function dismiss() {
    setOpen(false);
    setHint(null);
  }

  return (
    <FormField.Root
      className={cn(
        'form-field flex min-w-0 flex-col gap-(--layout-field-gap)',
        'habit-icon-field',
      )}
    >
      <FormField.Label className="w-fit text-sm text-muted-foreground">
        {t('common.icon')}
      </FormField.Label>
      <>
        <Popover.Trigger
          handle={handle}
          id={controlId}
          ref={anchorRef}
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${controlId}-panel`}
          onClick={() => (open ? dismiss() : setOpen(true))}
          className={
            'habit-icon-trigger w-full min-w-0 flex items-center gap-2 h-(--control-height) py-1.5 px-2.5 border border-control-border rounded-md bg-popover text-sm leading-(--text-sm--line-height) hover:border-muted-foreground [&_>_span]:flex-1 [&_>_span]:min-w-0 [&_>_span]:text-left [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap'
          }
        >
          <HabitGlyph value={value} size={16} />
          <span>{current ? t(current.label) : t('habits.customIcon')}</span>
          <ChevronDown className="size-3.5 inline-block shrink-0 align-middle" />
        </Popover.Trigger>
        {open && (
          <WorkspacePopover
            handle={handle}
            triggerId={controlId}
            ref={panelRef}
            anchor={anchorRef}
            onClose={dismiss}

            id={`${controlId}-panel`}
            className={cn('habit-icon-panel w-64 p-3')}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
          >
            <RadioGroup
              className="habit-icon-grid grid grid-cols-[repeat(6,_32px)] gap-1.5 [&_button]:grid [&_button]:place-items-center [&_button]:w-8 [&_button]:h-8 [&_button]:p-0 [&_button]:border [&_button]:border-transparent [&_button]:rounded-sm [&_button]:text-foreground [&_button:hover]:bg-overlay-hover [&_button[aria-checked='true']]:border-ring [&_button[aria-checked='true']]:bg-surface-selected [@media(pointer:_coarse)]:grid-cols-[repeat(6,_36px)] [@media(pointer:_coarse)]:gap-0.5 [@media(pointer:_coarse)]:[&_button]:w-9 [@media(pointer:_coarse)]:[&_button]:h-9"
              aria-label={t('common.icon')}
              value={current?.id ?? ''}
              onValueChange={onChange}
            >
              {habitIcons.map((item) => (
                <OptionRadio.Root
                  render={<button type="button" />}
                  nativeButton
                  key={item.id}
                  value={item.id}
                  aria-label={t(item.label)}
                  title={t(item.label)}
                  onFocus={() => setHint(item.label)}
                  onPointerEnter={() => setHint(item.label)}
                  onPointerLeave={() => setHint(null)}
                  onClick={() => {
                    onChange(item.id);
                    dismiss();
                  }}
                >
                  <item.icon className="size-4.5 inline-block shrink-0 align-middle" />
                </OptionRadio.Root>
              ))}
            </RadioGroup>
            <p className="habit-icon-caption [margin:8px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
              {hint ? t(hint) : current ? t(current.label) : t('habits.customIcon')}
            </p>
            <Popover.Close className="sr-only">{t('common.closePicker')}</Popover.Close>
          </WorkspacePopover>
        )}
      </>
    </FormField.Root>
  );
}
