import { Popover } from '@base-ui/react/popover';
import { Radio } from '@base-ui/react/radio';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { RadioGroup } from '@repo/ui/components/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/tabs';
import { CircleOff, Palette, Shapes, Smile, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspaceColorPanel } from '#shared/ui/WorkspaceColorField';
import { HabitEmojiPicker } from './HabitEmojiPicker';
import { habitColors } from './habit-display';
import { HabitGlyph, habitIcons } from './habit-icons';

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
        <HabitGlyph value={icon} className="size-5.5" />
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
            className="habit-appearance-panel w-80 max-w-[calc(100vw-32px)] max-h-(--available-height) flex flex-col gap-3 overflow-hidden rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <Tabs defaultValue="icons" className="min-h-0 flex-1 gap-3">
              <TabsList
                variant="line"
                className="w-full shrink-0"
                aria-label={t('habits.appearance')}
              >
                {(['icons', 'emoji', 'color'] as const).map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="text-muted-foreground">
                    {tab === 'icons' ? <Shapes /> : tab === 'emoji' ? <Smile /> : <Palette />}
                    {t(
                      tab === 'icons'
                        ? 'common.icon'
                        : tab === 'color'
                          ? 'common.color'
                          : 'habits.emoji',
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="icons" className="min-h-0 overflow-auto flex flex-col gap-3">
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
                  className="habit-icon-grid grid max-h-56 grid-cols-7 justify-items-center gap-1 overflow-auto p-1"
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
              </TabsContent>
              <TabsContent value="emoji" className="min-h-0 overflow-auto flex flex-col gap-3">
                <HabitEmojiPicker onChange={(icon) => onChange({ icon })} />
                <Input
                  aria-label={t('habits.customSymbol')}
                  placeholder={t('habits.customSymbol')}
                  maxLength={60}
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      if (symbol.trim()) {
                        onChange({ icon: symbol.trim() });
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!symbol.trim()}
                  onClick={() => onChange({ icon: symbol.trim() })}
                >
                  {t('habits.chooseSymbol')}
                </Button>
              </TabsContent>
              <TabsContent value="color" className="min-h-0 overflow-auto">
                <WorkspaceColorPanel
                  label={t('common.color')}
                  value={color}
                  onChange={(color) => {
                    if (color) {
                      onChange({ color });
                    }
                  }}
                />
              </TabsContent>
            </Tabs>
            <div className="habit-appearance-actions flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={() => onChange({ icon: 'none' })}>
                <CircleOff className="size-4" />
                {t('habits.noIcon')}
              </Button>
              <Popover.Close render={<Button variant="ghost" size="sm" />}>
                <X className="size-4" />
                {t('common.close')}
              </Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
