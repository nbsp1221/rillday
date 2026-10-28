import { Popover } from '@base-ui/react/popover';
import { Radio } from '@base-ui/react/radio';
import { Tabs } from '@base-ui/react/tabs';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { useState } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspaceColorPanel } from '#shared/ui/WorkspaceColorField';
import { habitColors } from './habit-display';
import { HabitGlyph, habitIcons } from './habit-icons';

const emoji = [
  '💧',
  '🚶',
  '🏃',
  '🧘',
  '📚',
  '✍️',
  '🎵',
  '🌱',
  '🪥',
  '💊',
  '🍎',
  '🍳',
  '🧹',
  '🐕',
  '🫶',
  '☀️',
  '🌙',
  '🎨',
  '💬',
  '💰',
];

export function HabitAppearancePicker({
  icon,
  color,
  onChange,
}: {
  icon: string;
  color: string;
  onChange: (patch: { icon?: string; color?: string }) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const matches = habitIcons.filter((item) =>
    `${t(item.label)} ${item.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <Popover.Root modal="trap-focus">
      <Popover.Trigger
        aria-label={t('habits.appearance')}
        title={t('habits.appearance')}
        style={habitColors(color)}
        className="habit-appearance-trigger grid size-11 shrink-0 place-items-center rounded-lg border border-transparent bg-habit-color/15 text-habit-color hover:border-habit-color focus-visible:outline-2 focus-visible:outline-ring"
      >
        <HabitGlyph value={icon} size={22} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          collisionPadding={8}
          align="start"
          className="isolate z-50"
        >
          <Popover.Popup
            aria-label={t('habits.appearance')}
            className="habit-appearance-panel w-80 max-w-[calc(100vw-32px)] max-h-(--available-height) overflow-auto rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <Tabs.Root defaultValue="icons">
              <Tabs.List className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
                {(['icons', 'emoji', 'color'] as const).map((tab) => (
                  <Tabs.Tab
                    key={tab}
                    value={tab}
                    className="min-h-8 rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground data-active:bg-popover data-active:text-foreground data-active:shadow-xs"
                  >
                    {t(
                      tab === 'icons'
                        ? 'common.icon'
                        : tab === 'color'
                          ? 'common.color'
                          : 'habits.emoji',
                    )}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              <Tabs.Panel value="icons" className="flex flex-col gap-3">
                <Input
                  aria-label={t('habits.iconSearch')}
                  placeholder={t('habits.iconSearch')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <RadioGroup
                  aria-label={t('common.icon')}
                  value={icon}
                  onValueChange={(icon: string) => onChange({ icon })}
                  className="habit-icon-grid grid max-h-56 grid-cols-7 gap-1 overflow-auto p-1"
                >
                  {matches.map((item) => (
                    <Radio.Root
                      key={item.id}
                      value={item.id}
                      render={<button type="button" />}
                      nativeButton
                      aria-label={t(item.label)}
                      title={t(item.label)}
                      className="grid size-8 place-items-center rounded-md border border-transparent hover:bg-overlay-hover data-checked:border-ring data-checked:bg-surface-selected data-focus-visible:outline-2 data-focus-visible:outline-ring"
                    >
                      <item.icon size={18} />
                    </Radio.Root>
                  ))}
                </RadioGroup>
                {!matches.length && (
                  <p className="text-sm text-muted-foreground">{t('habits.noIcons')}</p>
                )}
                <Button variant="ghost" size="sm" onClick={() => onChange({ icon: 'none' })}>
                  {t('habits.noIcon')}
                </Button>
              </Tabs.Panel>
              <Tabs.Panel value="emoji" className="flex flex-col gap-3">
                <RadioGroup
                  aria-label={t('habits.emoji')}
                  value={icon}
                  onValueChange={(icon: string) => onChange({ icon })}
                  className="grid grid-cols-5 gap-1"
                >
                  {emoji.map((value) => (
                    <Radio.Root
                      key={value}
                      value={value}
                      aria-label={value}
                      render={<button type="button" />}
                      nativeButton
                      className="grid min-h-10 place-items-center rounded-md border border-transparent text-xl hover:bg-overlay-hover data-checked:border-ring data-focus-visible:outline-2 data-focus-visible:outline-ring"
                    >
                      {value}
                    </Radio.Root>
                  ))}
                </RadioGroup>
                <Input
                  aria-label={t('habits.customSymbol')}
                  placeholder={t('habits.customSymbol')}
                  maxLength={60}
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!symbol.trim()}
                  onClick={() => onChange({ icon: symbol.trim() })}
                >
                  {t('habits.chooseSymbol')}
                </Button>
              </Tabs.Panel>
              <Tabs.Panel value="color">
                <WorkspaceColorPanel
                  label={t('common.color')}
                  value={color}
                  onChange={(color) => {
                    if (color) {
                      onChange({ color });
                    }
                  }}
                />
              </Tabs.Panel>
            </Tabs.Root>
            <Popover.Close render={<Button variant="ghost" size="sm" className="mt-3 w-full" />}>
              {t('common.close')}
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
