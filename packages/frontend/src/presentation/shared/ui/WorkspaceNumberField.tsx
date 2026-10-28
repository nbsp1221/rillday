import type { RefObject } from 'react';
import { Field } from '@base-ui/react/field';
import { NumberField } from '@base-ui/react/number-field';
import { cn } from 'cn';
import { Minus, Plus } from 'lucide-react';
import { useI18n } from '#shared/i18n';

export function WorkspaceNumberField({
  label,
  decrease,
  increase,
  error,
  inputRef,
  onConfirm,
  editorFocus,
  showError,
  visibleLabel = false,
  showButtons = true,
  className,
  ...props
}: NumberField.Root.Props & {
  label: string;
  decrease: string;
  increase: string;
  error: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onConfirm?: () => void;
  editorFocus?: boolean;
  showError?: boolean;
  visibleLabel?: boolean;
  showButtons?: boolean;
}) {
  const { t, dateLocale } = useI18n();

  return (
    <Field.Root
      invalid={showError || undefined}
      className={cn(
        'number-stepper-group min-w-0 max-w-full',
        visibleLabel && 'grid grid-cols-[minmax(0,1fr)_minmax(0,156px)] items-center gap-2',
        className,
      )}
    >
      {visibleLabel && (
        <Field.Label className="w-fit text-sm text-muted-foreground">{label}</Field.Label>
      )}
      <NumberField.Root {...props} locale={dateLocale} allowOutOfRange required>
        <NumberField.Group className="number-stepper flex h-(--control-height) min-w-0 items-center overflow-hidden rounded-sm border border-control-border focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-ring">
          {showButtons && (
            <NumberField.Decrement
              className="grid h-full w-8 shrink-0 place-items-center hover:bg-overlay-hover disabled:opacity-45"
              aria-label={decrease}
            >
              <Minus size={14} />
            </NumberField.Decrement>
          )}
          <NumberField.Input
            ref={inputRef}
            aria-label={label}
            aria-roledescription={t('controls.numberField')}
            data-editor-focus={editorFocus || undefined}
            className="h-full w-11 min-w-0 flex-1 bg-transparent px-1 text-center text-sm tabular-nums outline-none"
            onKeyDown={(event) => {
              if (
                onConfirm &&
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                event.stopPropagation();
                onConfirm();
              }
            }}
          />
          {showButtons && (
            <NumberField.Increment
              className="grid h-full w-8 shrink-0 place-items-center hover:bg-overlay-hover disabled:opacity-45"
              aria-label={increase}
            >
              <Plus size={14} />
            </NumberField.Increment>
          )}
        </NumberField.Group>
        <Field.Error className="number-stepper-error mt-1 block text-xs text-danger-text">
          {error}
        </Field.Error>
      </NumberField.Root>
    </Field.Root>
  );
}
