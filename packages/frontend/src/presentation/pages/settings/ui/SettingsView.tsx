import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Radio as OptionRadio } from '@base-ui/react/radio';
import { Switch } from '@base-ui/react/switch';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { RadioGroup } from '@repo/ui/components/radio-group';
import {
  ArrowLeft,
  CalendarDays,
  Cloud,
  Database,
  Download,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Settings2,
  SquareCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import type {
  ConnectionPort,
  DataDirectoryPort,
  WorkspacePort,
  WorkspaceProfile,
} from '#application';
import type { HostRuntime } from '#shared/lib/host-runtime';
import { useAppPreferences } from '#entities/preferences';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoice, type WorkspaceChoiceProps } from '#shared/ui/WorkspaceChoice';
import { WorkspaceHeader } from '../../../shared/ui/WorkspaceHeader';
import { DataDirectorySettings } from './DataDirectorySettings';
import { SyncSettings } from './SyncSettings';

function SettingsRow({
  label,
  description,
  controlId,
  children,
}: {
  label: string;
  description?: string;
  controlId?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row flex items-center justify-between gap-(--layout-section-gap) min-h-18 py-4 px-0 [.settings-row_+_&]:[border-top:1px_solid_var(--separator)] [&_>_div:first-child]:flex-1 [&_>_div:first-child]:min-w-0 [&_h3]:block [&_h3]:font-medium [&_h3]:text-sm [&_h3]:m-0 [&_h3]:leading-(--text-sm--line-height) [&_strong]:block [&_strong]:font-medium [&_strong]:text-sm [&_strong]:m-0 [&_strong]:leading-(--text-sm--line-height) [&_label]:block [&_label]:font-medium [&_label]:text-sm [&_label]:m-0 [&_label]:leading-(--text-sm--line-height) [&_>_input]:h-(--control-height) [&_>_input]:w-50 [&_>_input]:max-w-full [&_>_input]:text-sm [&_>_input]:leading-(--text-sm--line-height) [&_label]:w-[fit-content] [&_label]:max-w-full [.settings-shortcuts_>_&]:min-h-12 [.settings-shortcuts_>_&]:py-3 [.settings-shortcuts_>_&]:px-0 [@media(max-width:_760px)]:flex-wrap [@media(max-width:_760px)]:gap-3 [@media(max-width:_760px)]:[&_>_div:first-child]:basis-full">
      <div>
        {controlId ? <Label htmlFor={controlId}>{label}</Label> : <strong>{label}</strong>}
        {description && (
          <p
            id={controlId ? `${controlId}-description` : undefined}
            className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function SettingsChoice<T extends string | number>({
  label,
  description,
  ...props
}: Omit<WorkspaceChoiceProps<T>, 'name'> & {
  label: string;
  description?: string;
}) {
  const controlId = useId();

  return (
    <SettingsRow label={label} description={description} controlId={controlId}>
      <WorkspaceChoice
        {...props}
        id={controlId}
        className="settings-choice h-(--control-height) w-50 max-w-full shrink-0 text-sm"
        contentClassName="w-50"
        name={label}
        describedBy={description ? `${controlId}-description` : undefined}
      />
    </SettingsRow>
  );
}

interface SettingsViewProps {
  section: string;
  setSection: (value: string) => void;
  connection: ConnectionPort;
  workspace: WorkspacePort;
  account: WorkspaceProfile;
  profileName: string;
  renameProfile: (name: string) => void;
  exportData: () => void;
  importData: () => void;
  close: () => void;
  runtime: HostRuntime;
  version: string;
  dataDirectory?: DataDirectoryPort;
  suggestedServerUrl?: string;
}

function GeneralSettings() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      <SettingsChoice
        label={t('settings.language')}
        description={t('settings.languageDescription')}
        value={preferences.language}
        options={[
          { value: 'ko', label: t('settings.korean') },
          { value: 'en', label: 'English' },
        ]}
        onChange={(language) => updatePreferences({ language })}
      />
      <SettingsChoice
        label={t('settings.startupView')}
        description={t('settings.startupDescription')}
        value={preferences.startupView}
        options={(['tasks', 'matrix', 'calendar', 'habits'] as const).map((value) => ({
          value,
          label: t(`area.${value}`, { ns: 'labels' }),
        }))}
        onChange={(startupView) => updatePreferences({ startupView })}
      />
      <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
        {t('settings.devicePreferences')}
      </p>
    </div>
  );
}

function AppearanceSettings() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      <SettingsRow label={t('settings.theme')} description={t('settings.systemThemeDescription')}>
        <RadioGroup
          required
          className="setting-options flex w-fit min-h-(--control-height) items-center gap-[3px] p-[3px] rounded-md bg-secondary shrink-0 [&_button]:h-[calc(var(--control-height)-6px)] [&_button]:min-h-0 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:gap-1.5 [&_button]:py-0 [&_button]:px-[11px] [&_button]:text-sm [&_button]:rounded-sm [&_button]:text-muted-foreground [&_button]:whitespace-nowrap [&_button]:leading-(--text-sm--line-height) [&_button[data-checked]]:bg-background [&_button[data-checked]]:text-foreground [&_button[data-checked]]:shadow-[0_1px_3px_var(--shadow)] [@media(max-width:_560px)]:max-w-full [@media(max-width:_560px)]:flex-wrap"
          aria-label={t('settings.theme')}
          value={preferences.theme}
          onValueChange={(theme: unknown) => {
            if (theme === 'light' || theme === 'dark' || theme === 'system') {
              updatePreferences({ theme });
            }
          }}
        >
          {(
            [
              {
                value: 'light',
                label: t('settings.light'),
                icon: <Sun className="size-4 inline-block shrink-0 align-middle" />,
              },
              {
                value: 'dark',
                label: t('settings.dark'),
                icon: <Moon className="size-4 inline-block shrink-0 align-middle" />,
              },
              {
                value: 'system',
                label: t('settings.system'),
                icon: <Monitor className="size-4 inline-block shrink-0 align-middle" />,
              },
            ] as const
          ).map((option) => (
            <OptionRadio.Root
              render={<button type="button" />}
              nativeButton
              key={option.value}
              value={option.value}
            >
              {option.icon}
              {option.label}
            </OptionRadio.Root>
          ))}
        </RadioGroup>
      </SettingsRow>
      <SettingsChoice
        label={t('settings.density')}
        description={t('settings.densityDescription')}
        value={preferences.density}
        options={[
          { value: 'comfortable', label: t('settings.comfortable') },
          { value: 'compact', label: t('settings.compact') },
        ]}
        onChange={(density) => updatePreferences({ density })}
      />
    </div>
  );
}

function TaskSettings() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      <SettingsRow
        label={t('settings.expandCompleted')}
        description={t('settings.expandCompletedDescription')}
      >
        <Switch.Root
          aria-label={t('settings.expandCompleted')}
          checked={preferences.showCompleted}
          onCheckedChange={(showCompleted) => updatePreferences({ showCompleted })}
          className="inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-secondary p-0.5 data-checked:border-primary data-checked:bg-primary hover:brightness-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-45"
        >
          <Switch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-3.5 data-checked:bg-primary-foreground motion-reduce:transition-none" />
        </Switch.Root>
      </SettingsRow>
      <SettingsRow
        label={t('settings.recognizeDates')}
        description={t('settings.recognizeDatesDescription')}
      >
        <Switch.Root
          aria-label={t('settings.recognizeDates')}
          checked={preferences.recognizeDates}
          onCheckedChange={(recognizeDates) => updatePreferences({ recognizeDates })}
          className="inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-secondary p-0.5 data-checked:border-primary data-checked:bg-primary hover:brightness-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-45"
        >
          <Switch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-3.5 data-checked:bg-primary-foreground motion-reduce:transition-none" />
        </Switch.Root>
      </SettingsRow>
      {preferences.recognizeDates && (
        <SettingsRow
          label={t('settings.removeDateText')}
          description={t('settings.removeDateTextDescription')}
        >
          <Switch.Root
            aria-label={t('settings.removeDateText')}
            checked={preferences.removeDateText}
            onCheckedChange={(removeDateText) => updatePreferences({ removeDateText })}
            className="inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-secondary p-0.5 data-checked:border-primary data-checked:bg-primary hover:brightness-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-45"
          >
            <Switch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-3.5 data-checked:bg-primary-foreground motion-reduce:transition-none" />
          </Switch.Root>
        </SettingsRow>
      )}
      <SettingsRow
        label={t('settings.keepLabelText')}
        description={t('settings.keepLabelTextDescription')}
      >
        <Switch.Root
          aria-label={t('settings.keepLabelText')}
          checked={preferences.keepTagText}
          onCheckedChange={(keepTagText) => updatePreferences({ keepTagText })}
          className="inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-secondary p-0.5 data-checked:border-primary data-checked:bg-primary hover:brightness-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-45"
        >
          <Switch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-3.5 data-checked:bg-primary-foreground motion-reduce:transition-none" />
        </Switch.Root>
      </SettingsRow>
      <div className="settings-card p-(--layout-card-inset) rounded-lg bg-surface-inset [&_>_h3]:[margin:0_0_8px] [&_>_h3]:text-base [&_>_h3]:font-medium [&_>_h3]:leading-(--text-base--line-height) [&_>_p:not(.settings-description)]:m-0 [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [.settings-card_+_&]:mt-(--layout-section-gap) [.settings-row_+_&]:mt-(--layout-section-gap) [.sync-settings_&]:m-0">
        <h3>{t('tasks.quickCapture')}</h3>
        <p>{t('tasks.captureExample')}</p>
        <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {t('tasks.captureHelp')}
        </p>
      </div>
    </div>
  );
}

function CalendarSettings() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      <SettingsChoice
        label={t('settings.weekStartsOn')}
        description={t('settings.weekStartsOnDescription')}
        value={preferences.weekStartsOn}
        options={[
          { value: 0, label: t('dates.sunday') },
          { value: 1, label: t('dates.monday') },
        ]}
        onChange={(weekStartsOn) => updatePreferences({ weekStartsOn })}
      />
      <SettingsChoice
        label={t('settings.timeFormat')}
        value={preferences.timeFormat}
        options={[
          { value: '24h', label: t('time.format24h') },
          { value: '12h', label: t('time.format12h') },
        ]}
        onChange={(timeFormat) => updatePreferences({ timeFormat })}
      />
      <SettingsRow
        label={t('settings.calendarShowCompleted')}
        description={t('settings.calendarShowCompletedDescription')}
      >
        <Switch.Root
          aria-label={t('settings.calendarShowCompleted')}
          checked={preferences.calendarShowCompleted}
          onCheckedChange={(calendarShowCompleted) => updatePreferences({ calendarShowCompleted })}
          className="inline-flex h-5 w-8.5 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-secondary p-0.5 data-checked:border-primary data-checked:bg-primary hover:brightness-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-45"
        >
          <Switch.Thumb className="pointer-events-none block size-3.5 rounded-full bg-muted-foreground transition-transform data-checked:translate-x-3.5 data-checked:bg-primary-foreground motion-reduce:transition-none" />
        </Switch.Root>
      </SettingsRow>
    </div>
  );
}

function DataSettings({
  account,
  profileName,
  renameProfile,
  exportData,
  importData,
  dataDirectory,
}: Pick<
  SettingsViewProps,
  'account' | 'profileName' | 'renameProfile' | 'exportData' | 'importData' | 'dataDirectory'
>) {
  const { t } = useI18n();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      {!account.server && (
        <SettingsRow label={t('profiles.workspaceName')}>
          <Input
            key={profileName}
            aria-label={t('profiles.workspaceName')}
            maxLength={60}
            defaultValue={profileName}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                renameProfile(e.target.value.trim());
              } else {
                e.target.value = profileName;
              }
            }}
            className={
              'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
            }
          />
        </SettingsRow>
      )}
      {dataDirectory && <DataDirectorySettings directory={dataDirectory} />}
      <div className="settings-card p-(--layout-card-inset) rounded-lg bg-surface-inset [&_>_h3]:[margin:0_0_8px] [&_>_h3]:text-base [&_>_h3]:font-medium [&_>_h3]:leading-(--text-base--line-height) [&_>_p:not(.settings-description)]:m-0 [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [.settings-card_+_&]:mt-(--layout-section-gap) [.settings-row_+_&]:mt-(--layout-section-gap) [.sync-settings_&]:m-0">
        <h3>{t('backup.title')}</h3>
        <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {t('backup.deviceStorageDescription')}
        </p>
        <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {t('backup.description')}
        </p>
        <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
          <Button variant="secondary" onClick={exportData} className={'h-(--control-height)'}>
            <Download className="size-3.5 inline-block shrink-0 align-middle" />
            {t('common.export')}
          </Button>
          <Button variant="outline" onClick={importData} className={'h-(--control-height)'}>
            <Upload className="size-3.5 inline-block shrink-0 align-middle" />
            {t('common.import')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShortcutSettings() {
  const { t } = useI18n();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height) settings-shortcuts p-0 [&_>_div]:flex [&_>_div]:justify-between [&_>_div]:gap-4 [&_>_div]:text-sm [&_>_div]:leading-(--text-sm--line-height)">
      {[
        [t('tasks.add'), 'Enter'],
        [t('tasks.multiline'), 'Shift Enter'],
        [t('tasks.quickCapture'), 'Ctrl / ⌘ N'],
        [t('search.all'), 'Ctrl / ⌘ K'],
        [t('common.undo'), 'Ctrl / ⌘ Z'],
        [t('common.redo'), 'Ctrl / ⌘ Shift Z'],
        [t('shortcuts.closePanel'), 'Esc'],
      ].map(([label, key]) => (
        <div
          className="settings-row flex items-center justify-between gap-(--layout-section-gap) min-h-18 py-4 px-0 [.settings-row_+_&]:[border-top:1px_solid_var(--separator)] [&_>_div:first-child]:flex-1 [&_>_div:first-child]:min-w-0 [&_h3]:block [&_h3]:font-medium [&_h3]:text-sm [&_h3]:m-0 [&_h3]:leading-(--text-sm--line-height) [&_strong]:block [&_strong]:font-medium [&_strong]:text-sm [&_strong]:m-0 [&_strong]:leading-(--text-sm--line-height) [&_label]:block [&_label]:font-medium [&_label]:text-sm [&_label]:m-0 [&_label]:leading-(--text-sm--line-height) [&_>_input]:h-(--control-height) [&_>_input]:w-50 [&_>_input]:max-w-full [&_>_input]:text-sm [&_>_input]:leading-(--text-sm--line-height) [&_label]:w-[fit-content] [&_label]:max-w-full [.settings-shortcuts_>_&]:min-h-12 [.settings-shortcuts_>_&]:py-3 [.settings-shortcuts_>_&]:px-0 [@media(max-width:_760px)]:flex-wrap [@media(max-width:_760px)]:gap-3 [@media(max-width:_760px)]:[&_>_div:first-child]:basis-full"
          key={key}
        >
          <span>{label}</span>
          <kbd className="rounded-sm border border-control-border bg-secondary px-[5px] py-0.5 text-xs [font-family:inherit]">
            {key}
          </kbd>
        </div>
      ))}
    </div>
  );
}

function AboutSettings({ runtime, version }: Pick<SettingsViewProps, 'runtime' | 'version'>) {
  const { t } = useI18n();

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height)">
      <h3>Rillday</h3>
      <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
        {version} · {runtime === 'desktop' ? 'Windows' : 'Web'}
      </p>
      <p>{t('about.description')}</p>
      <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
        {t('about.platformDescription')}
      </p>
    </div>
  );
}

export function SettingsView({
  section,
  setSection,
  connection,
  workspace,
  account,
  profileName,
  renameProfile,
  exportData,
  importData,
  close,
  runtime,
  version,
  dataDirectory,
  suggestedServerUrl,
}: SettingsViewProps) {
  const { t } = useI18n();
  const { preferenceSaveState, retryPreferences } = useAppPreferences();
  const sections = [
    {
      id: 'general',
      label: t('settings.general'),
      icon: <Settings2 className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'appearance',
      label: t('settings.appearance'),
      icon: <Palette className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'tasks',
      label: t('area.tasks', { ns: 'labels' }),
      icon: <SquareCheck className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'calendar',
      label: t('area.calendar', { ns: 'labels' }),
      icon: <CalendarDays className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'sync',
      label: t('sync.title'),
      icon: <Cloud className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'data',
      label: t('settings.dataBackups'),
      icon: <Database className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'shortcuts',
      label: t('settings.shortcuts'),
      icon: <Keyboard className="size-4.5 inline-block shrink-0 align-middle" />,
    },
    {
      id: 'about',
      label: t('settings.about'),
      icon: <Info className="size-4.5 inline-block shrink-0 align-middle" />,
    },
  ];

  return (
    <section
      className="settings-page flex flex-1 min-w-0 h-full min-h-0 bg-background [@media(max-width:_560px)]:flex-col"
      aria-label={t('settings.title')}
    >
      <WorkspaceHeader title={t('settings.title')}>
        <Button
          variant="ghost"
          onClick={close}
          className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
        >
          <ArrowLeft className="size-4 inline-block shrink-0 align-middle" />
          {t('navigation.back')}
        </Button>
      </WorkspaceHeader>
      <aside
        id="settings-categories"
        className="settings-nav w-55.5 min-w-0 shrink-0 [border-right:1px_solid_var(--separator)] bg-background [&_nav]:flex [&_nav]:flex-col [&_nav]:gap-1 [&_nav]:h-full [&_nav]:overflow-y-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [&_nav]:py-(--layout-page-inset) [&_nav]:px-2.5 [&_nav_>_button]:flex [&_nav_>_button]:items-center [&_nav_>_button]:gap-(--layout-navigation-gap) [&_nav_>_button]:w-full [&_nav_>_button]:min-h-(--layout-navigation-height) [&_nav_>_button]:shrink-0 [&_nav_>_button]:py-0 [&_nav_>_button]:px-[11px] [&_nav_>_button]:rounded-md [&_nav_>_button]:text-left [&_nav_>_button]:text-sm [&_nav_>_button]:text-muted-foreground [&_nav_>_button]:leading-(--text-sm--line-height) [&_nav_>_button_>_span]:min-w-0 [&_nav_>_button_>_span]:overflow-hidden [&_nav_>_button_>_span]:text-ellipsis [&_nav_>_button_>_span]:whitespace-nowrap [&_nav_>_button:hover]:bg-surface-hover [&_nav_>_button:hover]:text-foreground [&_nav_>_button[aria-current='page']]:bg-surface-selected [&_nav_>_button[aria-current='page']]:text-foreground [@media(max-width:_899px)]:[&_nav]:py-(--layout-page-inset-compact) [@media(max-width:_760px)]:w-45 [@media(max-width:_560px)]:w-full [@media(max-width:_560px)]:[border-right:0] [@media(max-width:_560px)]:[border-bottom:1px_solid_var(--separator)] [@media(max-width:_560px)]:[&_nav]:flex-row [@media(max-width:_560px)]:[&_nav]:h-auto [@media(max-width:_560px)]:[&_nav]:overflow-x-auto [@media(max-width:_560px)]:[&_nav]:overflow-y-hidden [@media(max-width:_560px)]:[&_nav]:py-2 [@media(max-width:_560px)]:[&_nav]:px-(--layout-page-inset-compact) [@media(max-width:_560px)]:[&_nav_>_button]:w-auto [@media(max-width:_560px)]:[&_nav_>_button]:[flex:0_0_auto] [@media(max-width:_560px)]:[&_nav_>_button]:py-0 [@media(max-width:_560px)]:[&_nav_>_button]:px-3"
      >
        <nav aria-label={t('settings.categories')}>
          {sections
            .filter((item) => item.id !== 'sync' || connection.serverConnectionEnabled !== false)
            .map((item) => (
              <ButtonPrimitive
                key={item.id}
                title={item.label}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </ButtonPrimitive>
            ))}
        </nav>
      </aside>
      <div
        key={section}
        className="settings-content flex-1 min-w-0 min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover p-(--layout-page-inset) [@media(max-width:_899px)]:p-(--layout-page-inset-compact)"
      >
        <div className="w-full max-w-190">
          <header className="settings-header min-h-(--layout-navigation-height) flex flex-col justify-center mb-(--layout-section-gap) [&_h1]:m-0 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:[letter-spacing:-0.35px] [&_h1]:leading-(--text-base--line-height) [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:[letter-spacing:-0.35px] [&_h2]:leading-(--text-base--line-height) [&_p]:[margin:4px_0_0] [&_p]:text-xs [&_p]:leading-(--text-xs--line-height) [&_p]:text-muted-foreground">
            <h2>{sections.find((item) => item.id === section)?.label}</h2>
            {preferenceSaveState === 'error' && (
              <div
                className="settings-status text-muted-foreground text-sm leading-(--text-sm--line-height) py-4 px-0"
                role="alert"
              >
                <Button
                  variant="ghost"
                  onClick={retryPreferences}
                  className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
                >
                  {t('settings.saveFailed')}
                </Button>
              </div>
            )}
          </header>
          {section === 'sync' && connection.serverConnectionEnabled !== false && (
            <SyncSettings
              key={account.id}
              connection={connection}
              workspace={workspace}
              account={account}
              runtime={runtime}
              suggestedServerUrl={suggestedServerUrl}
            />
          )}
          {section === 'general' && <GeneralSettings />}
          {section === 'appearance' && <AppearanceSettings />}
          {section === 'tasks' && <TaskSettings />}
          {section === 'calendar' && <CalendarSettings />}
          {section === 'data' && (
            <DataSettings
              account={account}
              profileName={profileName}
              renameProfile={renameProfile}
              exportData={exportData}
              importData={importData}
              dataDirectory={dataDirectory}
            />
          )}
          {section === 'shortcuts' && <ShortcutSettings />}
          {section === 'about' && <AboutSettings runtime={runtime} version={version} />}
        </div>
      </div>
    </section>
  );
}
