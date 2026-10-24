import { Button } from '@repo/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { type RefObject, useId } from 'react';
import { useI18n } from '#shared/i18n';

export function DemoMenu({
  onReset,
  triggerRef,
}: {
  onReset: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const descriptionId = useId();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        render={<Button variant="ghost" size="icon" />}
        className="h-(--rail-target) w-(--rail-target) rounded-lg p-0 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground aria-expanded:bg-surface-hover aria-expanded:text-foreground"
      >
        {t('label', { ns: 'demo' })}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-72 max-w-[min(var(--available-width),calc(100vw-16px))]"
        aria-label={t('title', { ns: 'demo' })}
        aria-describedby={descriptionId}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('title', { ns: 'demo' })}</DropdownMenuLabel>
          <div
            id={descriptionId}
            className="space-y-2 px-2 pb-2 text-xs leading-relaxed text-muted-foreground"
          >
            <p>{t('description', { ns: 'demo' })}</p>
            <p>{t('storage', { ns: 'demo' })}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onReset}>
            <RotateCcw />
            {t('reset', { ns: 'demo' })}
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="https://rillday.retn0.dev/" />}>
            <ArrowUpRight />
            {t('product', { ns: 'demo' })}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
