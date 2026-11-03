import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import * as Picker from 'emoji-picker-react/primitives';
import { useI18n } from '#shared/i18n';

const datasets = {
  en: () => import('emoji-picker-react/data/emojis-en').then((data) => data.default),
  ko: () => import('emoji-picker-react/data/emojis-ko').then((data) => data.default),
};

const components: Picker.PickerComponents = {
  Emoji: ({ emoji, className, ...props }) => (
    <button
      {...props}
      className={cn(
        className,
        'rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        emoji.isActive && 'bg-accent',
      )}
    />
  ),
  CategoryHeader: ({ category: _category, className, ...props }) => (
    <div
      {...props}
      className={cn(
        className,
        'flex items-center bg-popover px-2 text-xs font-medium text-muted-foreground',
      )}
    />
  ),
};

export function HabitEmojiPicker({ onChange }: { onChange: (value: string) => void }) {
  const { locale, t } = useI18n();
  return (
    <Picker.Root
      className="habit-emoji-picker h-68 w-full shrink-0 bg-popover text-popover-foreground [&_[data-epr-part=variation-picker]]:rounded-md [&_[data-epr-part=variation-picker]]:border [&_[data-epr-part=variation-picker]]:border-border [&_[data-epr-part=variation-picker]]:bg-popover [&_[data-epr-part=variation-picker]]:shadow-md"
      emojiStyle="native"
      emojiData={datasets[locale]}
      autoFocusSearch={false}
      cssLayer="emoji-picker"
      components={components}
      onEmojiClick={({ emoji }) => onChange(emoji)}
      labels={{
        searchPlaceholder: t('emoji.searchPlaceholder'),
        searchLabel: t('emoji.searchLabel'),
        searchClear: t('emoji.searchClear'),
        searchResultsNone: t('emoji.searchResultsNone'),
        searchResultsOne: t('emoji.searchResultsOne'),
        searchResultsMany: t('emoji.searchResultsMany'),
        categoryNavigation: t('emoji.categoryNavigation'),
        reactions: t('emoji.reactions'),
        expandReactions: t('emoji.expandReactions'),
        loading: t('emoji.loading'),
        loadingError: t('emoji.loadingError'),
        retryLoading: t('emoji.retryLoading'),
        skinToneNeutral: t('emoji.skinToneNeutral'),
        skinToneLight: t('emoji.skinToneLight'),
        skinToneMediumLight: t('emoji.skinToneMediumLight'),
        skinToneMedium: t('emoji.skinToneMedium'),
        skinToneMediumDark: t('emoji.skinToneMediumDark'),
        skinToneDark: t('emoji.skinToneDark'),
      }}
    >
      <Picker.SearchInput as={Input} />
      <Picker.Viewport className="mt-2 min-h-0">
        <Picker.List />
        <Picker.Empty className="p-4 text-center text-sm text-muted-foreground" />
        <Picker.Loading className="p-4 text-center text-sm text-muted-foreground" />
        <Picker.LoadError className="flex flex-col items-center gap-2 p-4 text-center text-sm">
          {({ retry }) => (
            <>
              <p>{t('emoji.loadingError')}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                {t('emoji.retryLoading')}
              </Button>
            </>
          )}
        </Picker.LoadError>
      </Picker.Viewport>
    </Picker.Root>
  );
}
