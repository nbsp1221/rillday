import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { ToastProvider } from '@repo/ui/components/toast';
import { TooltipProvider } from '@repo/ui/components/tooltip';
import { cn } from 'cn';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import invariant from 'tiny-invariant';
import type {
  ConnectionPort,
  HostRuntime,
  ProductArea,
  TaskList,
  WorkspacePort,
  WorkspaceProfile,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { type CaptureDraft, WorkspaceContext, type WorkspaceController } from '#entities/workspace';
import { LabelEditor } from '#features/manage-labels';
import { WorkspaceListEditor } from '#features/manage-list';
import { WorkspaceProfileDialog } from '#features/manage-profile';
import { WorkspaceSearch } from '#features/search-workspace';
import { TaskDragProvider } from '#features/task-drag';
import { WorkspaceBackupDialogs, useWorkspaceBackup } from '#features/transfer-workspace';
import { CalendarView } from '#pages/calendar';
import { HabitsView } from '#pages/habits';
import { MatrixView } from '#pages/matrix';
import { SettingsView } from '#pages/settings';
import { TaskListView } from '#pages/tasks';
import { useI18n } from '#shared/i18n';
import { AppRail } from '#widgets/app-navigation';
import { TaskDetail } from '#widgets/task-detail';
import { TaskSidebar } from '#widgets/task-sidebar';
import { WorkspacePanels } from '#widgets/workspace-layout';
import type {} from '../../shared/styles.d.ts';
import './workspace.css';
import './editor.css';
import { syncError } from '../../shared/lib/operation-errors';
import { SidebarToggle } from '../../shared/ui/WorkspaceHeader';
import { WorkspaceToastViewport } from '../../shared/ui/WorkspaceToast';
import { useWorkspaceActions } from '../model/use-workspace-actions';
import { useWorkspaceLayout } from '../model/use-workspace-layout';
import { useWorkspaceLifecycle } from '../model/use-workspace-lifecycle';
import { useWorkspaceNotifications } from '../model/use-workspace-notifications';
import { useWorkspaceShortcuts } from '../model/use-workspace-shortcuts';

export interface RilldayAppProps {
  workspace: WorkspacePort;
  connection: ConnectionPort;
  settingsRequest: number;
  accounts: WorkspaceProfile[];
  activeAccountId: string;
  runtime: HostRuntime;
  version: string;
  navigationFooter?: ReactNode;
  renameAccount: (id: string, name: string) => void | Promise<void>;
}

export function RilldayApp(props: RilldayAppProps) {
  return (
    <TooltipProvider delay={200} timeout={0}>
      <ToastProvider timeout={6000} limit={1}>
        <WorkspaceApp {...props} />
      </ToastProvider>
    </TooltipProvider>
  );
}

function WorkspaceApp(props: RilldayAppProps) {
  const { t } = useI18n();
  const { preferences } = useAppPreferences();
  const appRootRef = useRef<HTMLDivElement>(null);
  const [captureDrafts] = useState(() => new Map<string, CaptureDraft>());
  const connectionState = useSyncExternalStore(
    props.connection.subscribe,
    props.connection.getSnapshot,
  );
  const connectionBusy = Boolean(connectionState.transitioning);
  const snapshot = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot);
  const { data, saveState, error: saveError } = snapshot;
  const [area, setArea] = useState<ProductArea>(preferences.startupView);
  const [filter, setFilter] = useState('list:inbox');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarGroups, setSidebarGroups] = useState({ lists: true, labels: true });
  const [captureRequest, setCaptureRequest] = useState(0);
  const { narrow, mobileSidebarOpen, setMobileSidebarOpen } = useWorkspaceLayout(captureRequest);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { toasts, notify, onAccepted } = useWorkspaceNotifications(connectionState.error);
  const [dialog, setDialog] = useState<'profiles' | 'settings' | 'search' | null>(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const showDetail = area !== 'habits' && Boolean(selectedTaskId);
  const [listEditing, setListEditing] = useState<TaskList | 'new' | null>(null);
  const [labelEditing, setLabelEditing] = useState<{
    name?: string;
  } | null>(null);
  const [settingsSection, setSettingsSection] = useState('general');
  const [previousSettingsRequest, setPreviousSettingsRequest] = useState(0);

  if (previousSettingsRequest !== props.settingsRequest) {
    setPreviousSettingsRequest(props.settingsRequest);

    if (props.settingsRequest) {
      setSettingsSection('sync');
      setDialog('settings');
    }
  }

  const activeAccount = props.accounts.find((a) => a.id === props.activeAccountId);
  invariant(activeAccount !== undefined, 'Missing activeAccount');

  function openSyncSettings() {
    setSettingsSection('sync');
    setDialog('settings');
  }

  const beginCapture = useCallback(() => {
    setDialog(null);
    setArea('tasks');
    setFilter('list:inbox');
    setSelectedTaskId(null);
    setMobileSidebarOpen(false);
    setCaptureRequest((value) => value + 1);
  }, [setMobileSidebarOpen]);
  const backup = useWorkspaceBackup({
    workspace: props.workspace,
    notify,
    onInspect: () => setDialog(null),
    onImported: () => setSelectedTaskId(null),
  });
  const { apply, runOperation, taskActions, deleteTask } = useWorkspaceActions({
    workspace: props.workspace,
    preferences,
    notify,
    selectTask: setSelectedTaskId,
    onAccepted,
  });
  useWorkspaceShortcuts({
    connection: props.connection,
    settingsOpen: dialog === 'settings',
    closeSettings: () => setDialog(null),
    openSearch: () => {
      setDialog('search');
      setGlobalQuery('');
    },
    beginCapture,
    undo: taskActions.undo,
    redo: taskActions.redo,
  });
  useWorkspaceLifecycle({
    workspace: props.workspace,
    connection: props.connection,
    saveState,
    connectionError: connectionState.error,
    captureDrafts,
  });

  if (selectedTaskId && !data.tasks.some((task) => task.id === selectedTaskId)) {
    setSelectedTaskId(null);
  }

  const controller = useMemo<WorkspaceController>(
    () => ({
      captureDrafts,
      data,
      apply,
      runOperation,
      selectedTaskId,
      selectTask: setSelectedTaskId,
      taskActions,
      deleteTask,
      notify,
      persistence: props.workspace,
    }),
    [
      captureDrafts,
      data,
      apply,
      runOperation,
      selectedTaskId,
      taskActions,
      deleteTask,
      notify,
      props.workspace,
    ],
  );

  function navigate(value: string) {
    setDialog(null);
    setArea('tasks');
    setFilter(value);
    setSelectedTaskId(null);
    setMobileSidebarOpen(false);
  }

  const renameProfile = async (name: string) => {
    try {
      await props.renameAccount(activeAccount.id, name);
    } catch (error) {
      notify(error instanceof Error ? syncError(t, error.message) : t('profiles.renameFailed'));
    }
  };

  return (
    <WorkspaceContext value={controller}>
      <TaskDragProvider identity={`${area}:${filter}`}>
        <div
          ref={appRootRef}
          inert={connectionBusy || undefined}
          aria-busy={connectionBusy || undefined}
          className="rillday-app isolate flex h-dvh min-h-105 overflow-hidden bg-background [--sidebar-width:222px] [--detail-width:360px]"
          data-runtime={props.runtime}
        >
          <AppRail
            footer={props.navigationFooter}
            syncState={snapshot.syncState}
            syncSettings={openSyncSettings}
            area={area}
            settingsOpen={dialog === 'settings'}
            account={activeAccount}
            navigate={(next) => {
              setDialog(null);
              setArea(next);
              setSelectedTaskId(null);
              setMobileSidebarOpen(false);
            }}
            search={() => {
              setDialog('search');
              setGlobalQuery('');
            }}
            settings={() => {
              setSettingsSection('general');
              setDialog('settings');
            }}
            profiles={() => setDialog('profiles')}
          />
          <WorkspacePanels
            appRoot={appRootRef}
            narrow={narrow}
            sidebarVisible={dialog !== 'settings' && area === 'tasks' && sidebarExpanded}
            detailVisible={dialog !== 'settings' && showDetail}
            detail={dialog !== 'settings' && showDetail ? <TaskDetail /> : null}
            sidebar={
              dialog !== 'settings' &&
              area === 'tasks' && (
                <TaskSidebar
                  key={narrow ? 'sheet' : 'sidebar'}
                  portalContainer={appRootRef}
                  filter={filter}
                  groups={sidebarGroups}
                  setGroupExpanded={(group, expanded) =>
                    setSidebarGroups((previous) => ({ ...previous, [group]: expanded }))
                  }
                  navigate={navigate}
                  editLabel={(name) => {
                    setMobileSidebarOpen(false);
                    setLabelEditing({ name });
                  }}
                  editList={setListEditing}
                  mobile={narrow}
                  expanded={narrow ? mobileSidebarOpen : sidebarExpanded}
                  close={() => setMobileSidebarOpen(false)}
                />
              )
            }
          >
            <main
              className={cn(
                'main-workspace flex-1 min-w-0 min-h-0 relative overflow-hidden flex flex-col [.workspace-main-panel_>_&]:w-full',
                `area-${area}`,
              )}
            >
              {saveState === 'error' && (
                <div
                  className="save-error py-[9px] px-4 bg-danger-surface text-danger-text text-sm flex justify-between leading-(--text-sm--line-height) [&_button]:text-sm [&_button]:underline [&_button]:leading-(--text-sm--line-height)"
                  role="alert"
                >
                  {syncError(t, saveError)}
                  <ButtonPrimitive
                    onClick={() => void props.workspace.retrySave().catch(() => undefined)}
                  >
                    {t('storage.retrySaving')}
                  </ButtonPrimitive>
                </div>
              )}
              {dialog === 'settings' ? (
                <SettingsView
                  section={settingsSection}
                  setSection={setSettingsSection}
                  connection={props.connection}
                  workspace={props.workspace}
                  account={activeAccount}
                  profileName={activeAccount.name}
                  renameProfile={(name) => {
                    void renameProfile(name);
                  }}
                  exportData={backup.exportData}
                  importData={backup.openImport}
                  close={() => setDialog(null)}
                  runtime={props.runtime}
                  version={props.version}
                />
              ) : (
                <WorkspaceArea
                  narrow={narrow}
                  area={area}
                  filter={filter}
                  navigate={navigate}
                  sidebarControl={
                    <SidebarToggle
                      expanded={narrow ? mobileSidebarOpen : sidebarExpanded}
                      controls="task-context-sidebar"
                      onClick={() =>
                        narrow
                          ? setMobileSidebarOpen((value) => !value)
                          : setSidebarExpanded((value) => !value)
                      }
                    />
                  }
                />
              )}
            </main>
          </WorkspacePanels>
          <WorkspaceToastViewport
            toasts={toasts}
            canUndo={snapshot.canUndo}
            undo={taskActions.undo}
          />
          {labelEditing && (
            <LabelEditor
              label={labelEditing.name}
              close={() => setLabelEditing(null)}
              navigate={(next) => {
                navigate(next);
                setCaptureRequest((value) => value + 1);
              }}
            />
          )}
          {listEditing && (
            <WorkspaceListEditor
              key={listEditing === 'new' ? 'new' : listEditing.id}
              list={listEditing}
              close={() => setListEditing(null)}
              onCreated={(id) => setFilter(`list:${id}`)}
              onRemoved={() => setFilter('list:inbox')}
            />
          )}
          {dialog === 'profiles' && (
            <WorkspaceProfileDialog
              account={activeAccount}
              close={() => setDialog(null)}
              openSync={
                props.connection.serverConnectionEnabled === false ? undefined : openSyncSettings
              }
            />
          )}
          {dialog === 'search' && (
            <WorkspaceSearch
              query={globalQuery}
              onQueryChange={setGlobalQuery}
              close={() => setDialog(null)}
              onSelect={(task) => {
                setArea('tasks');
                setFilter(`list:${task.listId}`);
                setSelectedTaskId(task.id);
                setDialog(null);
              }}
            />
          )}
          <WorkspaceBackupDialogs backup={backup} />
        </div>
        <ConnectionProgress busy={connectionBusy} />
      </TaskDragProvider>
    </WorkspaceContext>
  );
}

function ConnectionProgress({ busy }: { busy: boolean }) {
  const { t } = useI18n();

  return busy ? (
    <p className="sr-only" role="status">
      {t('connection.updating')}
    </p>
  ) : null;
}

function WorkspaceArea({
  area,
  ...taskProps
}: {
  area: ProductArea;
} & ComponentProps<typeof TaskListView>) {
  if (area === 'tasks') {
    return <TaskListView {...taskProps} />;
  }

  if (area === 'matrix') {
    return <MatrixView />;
  }

  if (area === 'calendar') {
    return <CalendarView />;
  }

  return <HabitsView />;
}
