import { Popover } from '@base-ui/react/popover';
import { Radio } from '@base-ui/react/radio';
import { Button } from '@repo/ui/components/button';
import { Label as FieldLabel } from '@repo/ui/components/label';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { cn } from 'cn';
import { Check, ChevronDown, ChevronLeft, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { ColorArea } from 'react-aria-components/ColorArea';
import { ColorField, Input } from 'react-aria-components/ColorField';
import { ColorPicker } from 'react-aria-components/ColorPicker';
import { ColorSlider, SliderTrack } from 'react-aria-components/ColorSlider';
import { ColorSwatch } from 'react-aria-components/ColorSwatch';
import { ColorThumb } from 'react-aria-components/ColorThumb';
import { useI18n } from '#shared/i18n';

const presets = [
  ['#8c9199', 'colors.gray'],
  ['#c77f87', 'colors.red'],
  ['#cf976a', 'colors.orange'],
  ['#d2ae6a', 'colors.yellow'],
  ['#94b781', 'colors.green'],
  ['#7eb4b4', 'colors.teal'],
  ['#77abc5', 'colors.sky'],
  ['#7d9cc4', 'colors.blue'],
  ['#8e98cf', 'colors.indigo'],
  ['#a398d0', 'colors.purple'],
  ['#c591ba', 'colors.pink'],
] as const;

export function WorkspaceColorField({
  label,
  value,
  onChange,
  allowReset = false,
  compact = false,
  className,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  allowReset?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const triggerId = useId();
  const [view, setView] = useState<'closed' | 'presets' | 'custom'>('closed');
  const selected = presets.find(([color]) => color === value?.toLowerCase());
  const name = selected ? t(selected[1]) : (value?.toUpperCase() ?? t('colors.default'));

  function choose(color: string | undefined) {
    if (color !== value) {
      onChange(color);
    }

    setView('closed');
  }

  return (
    <div
      className={
        compact
          ? 'color-picker-compact'
          : 'color-picker-field form-field flex min-w-0 flex-col gap-(--layout-field-gap)'
      }
    >
      {!compact && (
        <FieldLabel htmlFor={triggerId} className="w-fit text-sm font-normal text-muted-foreground">
          {label}
        </FieldLabel>
      )}
      <Popover.Root
        modal="trap-focus"
        open={view !== 'closed'}
        onOpenChange={(open) => setView(open ? 'presets' : 'closed')}
      >
        <Popover.Trigger
          id={triggerId}
          className={cn(
            'color-picker-trigger flex h-(--control-height) min-w-36 max-w-full items-center gap-2 self-start rounded-md border border-control-border bg-popover px-2.5 py-1.5 text-sm text-foreground hover:border-muted-foreground',
            compact && 'color-picker-icon size-(--control-height) min-w-(--control-height) p-[7px]',
            className,
          )}
          aria-label={label}
          title={t('common.labelValue', {
            label,
            value: value?.toUpperCase() ?? t('colors.default'),
          })}
        >
          <span
            className={cn(
              'color-value-swatch size-5 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_var(--control-border)]',
              !value &&
                'color-value-unset bg-[linear-gradient(135deg,transparent_46%,var(--muted-foreground)_47%_53%,transparent_54%)]',
            )}
            style={{ backgroundColor: value }}
          />
          {!compact && (
            <>
              <span className="color-value-name flex-1 text-left whitespace-nowrap">{name}</span>
              <ChevronDown size={14} />
            </>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="isolate z-50"
          >
            <Popover.Popup
              className="color-picker-panel overlay-panel relative w-64 max-w-[calc(100vw-16px)] max-h-[min(var(--available-height),calc(100dvh-16px))] overflow-auto overscroll-contain rounded-md ring-1 ring-foreground/10 bg-popover p-3 text-popover-foreground shadow-md outline-none"
              aria-label={label}
            >
              {view === 'custom' ? (
                <ColorPicker defaultValue={value ?? '#7d9cc4'}>
                  <div className="color-custom-editor flex flex-col gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="color-picker-back -ml-1 min-h-8 self-start gap-1 px-1 text-muted-foreground"
                      onClick={() => setView('presets')}
                      aria-label={t('colors.presets')}
                    >
                      <ChevronLeft size={14} />
                      {t('colors.custom')}
                    </Button>
                    <div className="color-controls flex h-44 flex-col gap-4">
                      <ColorArea
                        onChangeEnd={(color) => onChange(color.toString('hex').toLowerCase())}
                        aria-label={t('colors.saturationBrightness')}
                        colorSpace="hsb"
                        xChannel="saturation"
                        yChannel="brightness"
                        className="color-area relative h-37 w-full rounded-sm"
                      >
                        <ColorThumb className="color-thumb size-4.5 rounded-full border-2 border-white shadow-xs data-focus-visible:outline-2 data-focus-visible:outline-ring data-focus-visible:outline-offset-2" />
                      </ColorArea>
                      <ColorSlider
                        colorSpace="hsb"
                        channel="hue"
                        aria-label={t('colors.hue')}
                        onChangeEnd={(color) => onChange(color.toString('hex').toLowerCase())}
                      >
                        <SliderTrack className="relative h-3 w-full rounded-full">
                          <ColorThumb className="size-4.5 rounded-full border-2 border-white shadow-xs data-focus-visible:outline-2 data-focus-visible:outline-ring data-focus-visible:outline-offset-2" />
                        </SliderTrack>
                      </ColorSlider>
                    </div>
                    <ColorField
                      onChange={(color) => {
                        if (color) {
                          onChange(color.toString('hex').toLowerCase());
                        }
                      }}
                      aria-label={t('colors.hex')}
                      className="color-hex-row flex items-center gap-2"
                    >
                      <ColorSwatch className="color-preview size-7 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_var(--control-border)]" />
                      <span aria-hidden="true" className="text-xs text-muted-foreground">
                        HEX
                      </span>
                      <Input
                        maxLength={7}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-(--control-height) min-w-0 flex-1 rounded-md border border-control-border bg-card px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            setView('closed');
                          }
                        }}
                      />
                    </ColorField>
                  </div>
                </ColorPicker>
              ) : (
                <>
                  <div className="relative w-fit">
                    <RadioGroup
                      aria-label={label}
                      value={value}
                      onValueChange={onChange}
                      className="color-palette grid w-fit grid-cols-[repeat(6,32px)] gap-1.5 [@media(pointer:coarse)]:grid-cols-[repeat(6,36px)] [@media(pointer:coarse)]:gap-0.5"
                    >
                      {presets.map(([color, colorName]) => (
                        <Radio.Root
                          key={color}
                          value={color}
                          render={<button type="button" />}
                          nativeButton
                          aria-label={t('colors.nameHex', {
                            name: t(colorName),
                            hex: color.toUpperCase(),
                          })}
                          onClick={() => choose(color)}
                          className="color-choice group grid size-8 place-items-center outline-none [@media(pointer:coarse)]:size-9"
                        >
                          <span
                            className="relative grid place-items-center"
                            title={t('colors.nameHex', {
                              name: t(colorName),
                              hex: color.toUpperCase(),
                            })}
                          >
                            <ColorSwatch
                              color={color}
                              className="size-5.5 rounded-full shadow-[inset_0_0_0_1px_#00000018] group-hover:shadow-[0_0_0_2px_var(--popover),0_0_0_3px_var(--foreground)] group-data-checked:shadow-[0_0_0_2px_var(--popover),0_0_0_3px_var(--muted-foreground)] group-data-focus-visible:outline-2 group-data-focus-visible:outline-ring group-data-focus-visible:outline-offset-[3px]"
                            />
                            <Radio.Indicator className="absolute">
                              <Check className="size-3.5 text-[#171717]" />
                            </Radio.Indicator>
                          </span>
                        </Radio.Root>
                      ))}
                    </RadioGroup>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="color-custom-choice color-choice absolute right-0 bottom-0 size-8 p-0 hover:bg-transparent [@media(pointer:coarse)]:size-9"
                      aria-label={t('colors.custom')}
                      title={t('colors.custom')}
                      onClick={() => setView('custom')}
                    >
                      <span className="relative grid size-5.5 place-items-center rounded-full bg-[conic-gradient(#c77f87,#d2ae6a,#94b781,#7eb4b4,#7d9cc4,#a398d0,#c77f87)] before:absolute before:inset-[3px] before:rounded-[inherit] before:bg-popover">
                        <Plus className="size-3.5 relative" />
                      </span>
                    </Button>
                  </div>
                  {allowReset && (
                    <Button
                      variant="ghost"
                      className="color-picker-reset mt-2 min-h-8 w-full justify-start px-2 text-sm text-muted-foreground"
                      disabled={!value}
                      onClick={() => choose(undefined)}
                    >
                      {t('colors.default')}
                    </Button>
                  )}
                </>
              )}
              <Popover.Close className="sr-only">{t('common.closePicker')}</Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
