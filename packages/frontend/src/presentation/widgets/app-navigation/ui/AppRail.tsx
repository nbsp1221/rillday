import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { Tooltip, TooltipTrigger } from '@repo/ui/components/tooltip';
import { cn } from 'cn';
import {
  CalendarDays,
  Cloud,
  CloudAlert,
  CloudOff,
  Grid2X2,
  Leaf,
  Search,
  Settings,
  SquareCheck,
  UserRound,
} from 'lucide-react';
import type { ProductArea, WorkspaceProfile, WorkspaceSnapshot } from '#application';
import { useI18n } from '#shared/i18n';

const syncIcons = {
  'error': CloudAlert,
  'conflict': CloudAlert,
  'authentication-required': CloudAlert,
  'offline': CloudOff,
  'syncing': Cloud,
  'synced': Cloud,
  'local': Cloud,
} satisfies Record<WorkspaceSnapshot['syncState'], typeof Cloud>;

function RailAction({
  label,
  shortcut,
  children,
  onClick,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<ButtonPrimitive />}
        {...props}
        aria-label={props['aria-label'] ?? label}
        onClick={onClick}
        className={cn(
          "rail-action [.app-rail_&]:relative [.app-rail_&]:grid [.app-rail_&]:place-items-center [.app-rail_&]:shrink-0 [.app-rail_&]:w-(--rail-target) [.app-rail_&]:h-(--rail-target) [.app-rail_&]:p-0 [.app-rail_&]:rounded-lg [.app-rail_&]:text-muted-foreground [.app-rail_&:hover]:text-foreground [.app-rail_&:hover]:bg-surface-hover [.app-rail_&[aria-current='page']]:text-link [.app-rail_&[aria-current='page']]:bg-surface-selected [.app-rail_&[aria-current='page']::before]:[content:''] [.app-rail_&[aria-current='page']::before]:absolute [.app-rail_&[aria-current='page']::before]:left-[calc(-1_*_var(--rail-inset))] [.app-rail_&[aria-current='page']::before]:top-[50%] [.app-rail_&[aria-current='page']::before]:[transform:translateY(-50%)] [.app-rail_&[aria-current='page']::before]:w-[3px] [.app-rail_&[aria-current='page']::before]:h-5 [.app-rail_&[aria-current='page']::before]:rounded-[0_3px_3px_0] [.app-rail_&[aria-current='page']::before]:bg-link [.app-rail_&[aria-current='page']::before]:pointer-events-none",
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="right" sideOffset={6} className="z-80">
          <TooltipPrimitive.Popup className="rail-label flex w-max max-w-[min(280px,_calc(100vw_-_66px))] items-center gap-3 rounded-lg border border-separator bg-popover px-2.5 py-[7px] text-left text-sm font-medium leading-(--text-sm--line-height) text-popover-foreground shadow-[0_2px_8px_var(--shadow)]">
            {label}
            {shortcut && (
              <kbd className="rounded-sm border border-control-border bg-secondary px-[5px] py-0.5 text-xs leading-(--text-xs--line-height) text-muted-foreground whitespace-nowrap [font-family:inherit]">
                {shortcut}
              </kbd>
            )}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

export function AppRail({
  area,
  settingsOpen,
  account,
  navigate,
  search,
  settings,
  profiles,
  syncState,
  syncSettings,
  footer,
}: {
  area: ProductArea;
  settingsOpen: boolean;
  account: WorkspaceProfile;
  navigate: (area: ProductArea) => void;
  search: () => void;
  settings: () => void;
  profiles: () => void;
  syncState: WorkspaceSnapshot['syncState'];
  syncSettings: () => void;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const initial = [...new Intl.Segmenter().segment(account.name)][0]?.segment;
  const SyncIcon = syncIcons[syncState];
  const areas = [
    { id: 'tasks', label: t('area.tasks', { ns: 'labels' }), icon: SquareCheck },
    { id: 'matrix', label: t('area.matrix', { ns: 'labels' }), icon: Grid2X2 },
    { id: 'calendar', label: t('area.calendar', { ns: 'labels' }), icon: CalendarDays },
    { id: 'habits', label: t('area.habits', { ns: 'labels' }), icon: Leaf },
  ] as const;

  return (
    <nav
      className="app-rail [--rail-target:var(--navigation-target)] [--rail-inset:calc(var(--spacing)_*_2)] [--rail-gap:calc(var(--spacing)_*_2)] flex flex-col items-center shrink-0 w-(--app-rail-width) p-(--rail-inset) gap-(--rail-gap) [border-right:1px_solid_var(--separator)] bg-background"
      aria-label={t('navigation.main')}
    >
      <div className="rail-views flex flex-col items-center gap-(--rail-gap) shrink-0">
        {areas.map((view) => (
          <RailAction
            key={view.id}
            label={view.label}
            className={cn(!settingsOpen && area === view.id ? 'active' : '')}
            aria-current={!settingsOpen && area === view.id ? 'page' : undefined}
            onClick={() => navigate(view.id)}
          >
            <view.icon className="size-6 inline-block shrink-0 align-middle" />
          </RailAction>
        ))}
      </div>
      <div className="rail-bottom flex flex-col items-center gap-(--rail-gap) shrink-0 mt-auto">
        {footer}
        {(account.server || syncState === 'conflict') && (
          <RailAction
            label={t(syncState, { ns: 'sync', context: 'rail' })}
            className="rail-sync [.app-rail_&[data-sync-state='conflict']]:text-destructive [.app-rail_&[data-sync-state='authentication-required']]:text-destructive [.app-rail_&[data-sync-state='syncing']]:text-link"
            data-sync-state={syncState}
            onClick={syncSettings}
          >
            <SyncIcon size={24} className="inline-block shrink-0 align-middle" />
          </RailAction>
        )}
        <RailAction label={t('search.all')} shortcut="Ctrl K" onClick={search}>
          <Search className="size-6 inline-block shrink-0 align-middle" />
        </RailAction>
        <RailAction
          label={t('settings.title')}
          aria-label={t('settings.backup')}
          aria-current={settingsOpen ? 'page' : undefined}
          onClick={settings}
        >
          <Settings className="size-6 inline-block shrink-0 align-middle" />
        </RailAction>
        <RailAction label={t('recovery.currentWorkspace')} onClick={profiles}>
          <span
            className="avatar [.app-rail_&]:w-7 [.app-rail_&]:h-7 w-[29px] h-[29px] rounded-full bg-[var(--avatar-color,_var(--primary))] text-primary-foreground text-xs font-semibold inline-flex items-center justify-center shrink-0 leading-(--text-xs--line-height) [&[data-guest]]:bg-surface-hover [&[data-guest]]:text-muted-foreground"
            data-guest={!account.server || undefined}
            style={{ '--avatar-color': account.color } as React.CSSProperties}
          >
            {account.server ? (
              initial
            ) : (
              <UserRound className="size-4 inline-block shrink-0 align-middle" />
            )}
          </span>
        </RailAction>
      </div>
    </nav>
  );
}
