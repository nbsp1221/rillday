import { Combobox } from '@base-ui/react/combobox';
import { Input } from '@repo/ui/components/input';
import { Check, Clock3 } from 'lucide-react';
import {
  type RefObject,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import { clockTime } from '#application';
import { useI18n } from '#shared/i18n';
import type { DateFieldEditor } from './DateFieldPopover';

export function parseTimeText(text: string): string | null {
  const compact = text.trim().replace(/^(\d{1,2})(\d{2})$/, '$1:$2');
  const match = compact.match(/^(오전|오후)?\s*(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/i);

  if (!match || (match[1] && match[4])) {
    return null;
  }

  const period = match[1] ?? match[4]?.toLowerCase();

  return clockTime(
    Number(match[2]),
    Number(match[3] ?? 0),
    period ? (period === '오후' || period === 'pm' ? 'pm' : 'am') : undefined,
  );
}

export function TimePicker({
  value,
  onChange,
  back,
  editor,
}: {
  value: string | null;
  onChange: (time: string | null) => void;
  back: () => void;
  editor: RefObject<DateFieldEditor | null>;
}) {
  const { t, formatTime, timeFormat } = useI18n();
  const [text, setText] = useState(() =>
    value ? (timeFormat === '24h' ? value : formatTime(value)) : '',
  );
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlId = useId();
  const highlightedRef = useRef<string | undefined>(undefined);
  const parsed = parseTimeText(text);
  const slots = useMemo(() => {
    const midnight = Temporal.PlainTime.from('00:00');
    const times = Array.from({ length: 48 }, (_, index) =>
      midnight.add({ minutes: index * 30 }).toString({ smallestUnit: 'minute' }),
    );

    if (parsed && !times.includes(parsed)) {
      times.push(parsed);
    }

    return times.sort();
  }, [parsed]);

  function apply() {
    const time = highlightedRef.current ?? parsed;

    if (text.trim() && !time) {
      setInvalid(true);
      inputRef.current?.focus();

      return false;
    }

    onChange(time);

    return true;
  }

  useImperativeHandle(editor, () => ({ apply }));
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  return (
    <Combobox.Root
      inline
      open
      items={slots}
      filter={null}
      value={parsed}
      inputValue={text}
      onInputValueChange={(next) => {
        setText(next);
        setInvalid(false);
      }}
      onItemHighlighted={(next) => {
        highlightedRef.current = next;
      }}
      onValueChange={(next) => {
        if (next) {
          onChange(next);
          back();
        }
      }}
    >
      <div className="time-picker flex flex-col gap-2 min-h-0 [&_>_:not(.time-picker-list)]:shrink-0">
        <div className="time-picker-entry flex items-center gap-2 h-(--control-height) border border-control-border rounded-sm py-0 px-2 text-muted-foreground focus-within:[outline:2px_solid_var(--ring)] focus-within:outline-offset-[-1px] [&_>_input]:flex-1 [&_>_input]:min-w-0 [&_>_input]:w-0 [&_>_input]:h-full [&_>_input]:border-0 [&_>_input]:bg-transparent [&_>_input]:p-0 [&_>_input]:outline-none [&_>_input]:shadow-[none] [&_>_input]:text-popover-foreground [&_>_input]:text-sm [&_>_input]:leading-(--text-sm--line-height) [&_>_input:focus]:outline-none [&_>_input:focus]:shadow-[none]">
          <Clock3 className="size-4 inline-block shrink-0 align-middle" />
          <Combobox.Input
            render={<Input />}
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('dates.taskTime')}
            aria-describedby={`${controlId}-hint${invalid ? ` ${controlId}-error` : ''}`}
            aria-invalid={invalid || undefined}
            placeholder={timeFormat === '12h' ? 'h:mm AM/PM' : 'HH:mm'}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                return;
              }

              if (event.key === 'Enter' && highlightedRef.current === undefined) {
                event.preventDefault();
                event.stopPropagation();

                if (apply()) {
                  back();
                }
              }
            }}
            className={
              'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
            }
          />
        </div>
        <p
          className="time-picker-hint m-0 text-xs leading-(--text-xs--line-height) text-muted-foreground"
          id={`${controlId}-hint`}
        >
          {timeFormat === '12h' ? t('time.example12h') : t('time.example24h')}
        </p>
        {invalid && (
          <p
            className="time-picker-error m-0 text-xs leading-(--text-xs--line-height) text-danger-text"
            role="alert"
            id={`${controlId}-error`}
          >
            {t('time.invalid')}
          </p>
        )}
        <Combobox.List
          className="time-picker-list min-h-8 max-h-48 [flex:1_1_auto] overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover overscroll-contain [border-top:1px_solid_var(--separator)] pt-1"
          aria-label={t('time.choose')}
        >
          {slots.map((time) => (
            <Combobox.Item
              key={time}
              value={time}
              className={
                'time-picker-option data-highlighted:bg-overlay-hover flex items-center justify-between w-full min-h-8 py-1.5 px-2 rounded-sm text-left hover:bg-overlay-hover [&_>_svg]:text-link [@media(pointer:_coarse)]:min-h-9'
              }
            >
              <time dateTime={time}>{formatTime(time)}</time>
              {time === value && <Check className="size-3.5 inline-block shrink-0 align-middle" />}
            </Combobox.Item>
          ))}
        </Combobox.List>
      </div>
    </Combobox.Root>
  );
}
