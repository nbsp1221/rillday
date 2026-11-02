import {
  type DomainContext,
  type Workspace,
  completeTask,
  duplicateTask,
  editLabel,
  incrementCheckIn,
  purgeTask,
  recordCheckIn,
  removeLabel,
  removeList,
  restoreTask,
  trashTask,
  validateWorkspace,
  workspaceCollectionSchema,
} from '@repo/domain';
import { produce } from 'immer';
import type { WorkspaceIntent } from './workspace-intents.ts';
import type { HabitLog, WorkspacePort, WorkspaceSnapshot } from './workspace/index.ts';
import type { WorkspaceRepository } from './workspace/repository.ts';
import { createDomainContext, deviceZone } from './context.ts';
import { WorkspaceHistory } from './workspace-history.ts';
import { applyWorkspaceIntent } from './workspace/apply-intent.ts';
import { workspaceDecisions } from './workspace/conflicts.ts';
import {
  type HabitCheckinAction,
  canEditHabitLog,
  habitAt,
  habitDone,
  habitLogFor,
  habitScheduled,
} from './workspace/habits.ts';
import { presentWorkspace } from './workspace/present-workspace.ts';

export interface WorkspaceArchive {
  exportData(): Promise<string>;
  inspectImport(source: string): { tasks: number; habits: number };
  importData(source: string): Promise<void>;
}

export interface WorkspaceSynchronization {
  getSnapshot(): { state: WorkspaceSnapshot['syncState']; pending: number; error: string };
  subscribe(listener: () => void): () => void;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface WorkspaceSessionOptions {
  archive: WorkspaceArchive;
  synchronization?: WorkspaceSynchronization;
  context?: DomainContext;
  zone?: string;
}

export class WorkspaceSession implements WorkspacePort {
  private state: WorkspaceSnapshot;
  private readonly repository: WorkspaceRepository;
  private readonly options: WorkspaceSessionOptions;
  private readonly context: DomainContext;
  private readonly zone: string;
  private readonly history: WorkspaceHistory<Workspace>;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: (() => void)[];
  private closed = false;
  private paused = false;
  private committing = false;
  private closing: Promise<void> | undefined;

  constructor(repository: WorkspaceRepository, options: WorkspaceSessionOptions) {
    this.repository = repository;
    this.options = options;
    this.context = options.context ?? createDomainContext();
    this.zone = options.zone ?? deviceZone();
    this.history = new WorkspaceHistory(
      ([collection, id]) =>
        repository.version(
          collection === 'matrixMode'
            ? { collection: 'workspace', id: 'matrixMode' }
            : { collection: workspaceCollectionSchema.parse(collection), id: String(id) },
        ),
      validateWorkspace,
    );
    this.state = this.readSnapshot();
    this.unsubscribe = [repository.subscribe(this.publish)];
    if (options.synchronization) {
      this.unsubscribe.push(options.synchronization.subscribe(this.publish));
    }
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private readSnapshot(previous?: WorkspaceSnapshot['data']): WorkspaceSnapshot {
    const saved = this.repository.getSnapshot();
    const network = this.options.synchronization?.getSnapshot();
    const issues = workspaceDecisions(saved.decisions);
    return {
      data: presentWorkspace(saved.workspace, this.zone, previous),
      saveState: saved.error ? 'error' : saved.saved ? 'saved' : 'saving',
      error:
        saved.error instanceof Error && saved.error.name === 'QuotaExceededError'
          ? 'storage_full'
          : saved.error
            ? 'save_failed'
            : (network?.error ?? ''),
      syncState: issues.length ? 'conflict' : (network?.state ?? 'local'),
      pending: network?.pending ?? 0,
      issues,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    };
  }

  private readonly publish = () => {
    if (this.closed || this.committing) {
      return;
    }
    this.state = this.readSnapshot(this.state.data);
    for (const listener of this.listeners) {
      listener();
    }
  };

  private readonly commit = (workspace: Workspace) => {
    // Publish local data only after its synchronous history transition completes.
    this.committing = true;
    try {
      // The repository reports asynchronous save failures in its snapshot and flush().
      void this.repository.commit(workspace).catch(() => undefined);
    } finally {
      this.committing = false;
    }
  };

  private requireActive() {
    if (this.closed) {
      throw new Error('workspace_closed');
    }
    if (this.paused) {
      throw new Error('workspace_transition');
    }
  }

  pause() {
    this.requireActive();
    this.paused = true;
    return () => {
      this.paused = false;
    };
  }

  private change(recipe: (draft: Workspace) => void, key = '', operations = 1, undoable = true) {
    this.requireActive();
    const current = this.repository.getSnapshot().workspace;
    if (undoable) {
      this.history.change(current, recipe, this.commit, key, operations);
    } else {
      const next = produce(current, recipe);
      validateWorkspace(next);
      this.commit(next);
      this.history.clear();
    }
    this.publish();
  }

  apply = (intents: WorkspaceIntent | WorkspaceIntent[], mergeKey = '') => {
    const requested = Array.isArray(intents) ? intents : [intents];
    this.change(
      (workspace) => {
        for (const intent of requested) {
          applyWorkspaceIntent(workspace, intent, this.context, this.zone);
        }
      },
      mergeKey,
      requested.reduce(
        (count, intent) => count + (intent.type === 'task.create' ? intent.tasks.length : 1),
        0,
      ),
    );
  };

  completeTask = (id: string, completed: boolean) =>
    this.change((workspace) => completeTask(workspace, id, completed, this.context));

  trashTask = (id: string) => this.change((workspace) => trashTask(workspace, id, this.context));

  restoreTask = (id: string) =>
    this.change((workspace) => restoreTask(workspace, id, this.context));

  purgeTasks = (ids: string[], undoable = true) => {
    this.change(
      (workspace) => {
        const selected = new Set(ids);
        const roots = ids.filter((id) => {
          let parent = workspace.tasks[id]?.location.parentId;
          while (parent) {
            if (selected.has(parent)) {
              return false;
            }
            parent = workspace.tasks[parent]?.location.parentId;
          }
          return true;
        });
        for (const id of roots) {
          purgeTask(workspace, id, this.context);
        }
      },
      '',
      ids.length,
      undoable,
    );
  };

  duplicateTask = (id: string, title: string) => {
    const newId = this.context.newId();
    this.change((workspace) => duplicateTask(workspace, id, newId, title, this.context));
    return newId;
  };

  renameLabel = (oldName: string, name: string, color: string | null) => {
    this.change((workspace) => {
      const label = Object.values(workspace.labels).find((candidate) => candidate.name === oldName);
      if (!label) {
        throw new Error('not_found');
      }
      editLabel(workspace, label.id, { name, color });
    });
  };

  removeLabel = (name: string) => {
    this.change((workspace) => {
      const label = Object.values(workspace.labels).find((candidate) => candidate.name === name);
      if (label) {
        removeLabel(workspace, label.id, this.context);
      }
    });
  };

  removeList = (id: string) =>
    this.change((workspace) => {
      const listId =
        id === 'inbox'
          ? Object.values(workspace.lists).find((list) => list.system === 'inbox')?.id
          : id;
      if (!listId) {
        throw new Error('not_found');
      }
      removeList(workspace, listId, this.context);
    });

  setHabitLog = (
    habitId: string,
    date: string,
    patch: Partial<Pick<HabitLog, 'value' | 'skipped' | 'note'>>,
  ) => {
    const habit = this.state.data.habits.find((candidate) => candidate.id === habitId);
    if (
      !habit ||
      !canEditHabitLog(habit, date, this.state.data.habitLogs, this.context.now()) ||
      (patch.value !== undefined && !Number.isFinite(patch.value))
    ) {
      return;
    }
    this.change(
      (workspace) => recordCheckIn(workspace, habitId, date, patch, this.context),
      `habit-log:${habitId}:${date}:${Object.keys(patch).sort().join(',')}`,
    );
  };

  addHabitAmount = (habitId: string, date: string, amount: number) => {
    this.change((workspace) => {
      const log = habitLogFor(this.state.data.habitLogs, habitId, date);
      if (log?.skipped) {
        recordCheckIn(workspace, habitId, date, { skipped: false }, this.context);
      }
      incrementCheckIn(workspace, habitId, date, amount, this.context);
    });
  };

  changeHabitCheckin = (habitId: string, date: string, action: HabitCheckinAction) => {
    const habit = this.state.data.habits.find((candidate) => candidate.id === habitId);
    if (!habit || !canEditHabitLog(habit, date, this.state.data.habitLogs, this.context.now())) {
      return;
    }
    const rule = habitAt(habit, date);
    const log = habitLogFor(this.state.data.habitLogs, habitId, date);
    switch (action.type) {
      case 'amount':
        this.setHabitLog(habitId, date, { value: action.value, skipped: false });
        return;
      case 'note':
        this.setHabitLog(habitId, date, { note: action.text });
        return;
      case 'step':
        this.addHabitAmount(
          habitId,
          date,
          action.direction === 'increase'
            ? rule.step || 1
            : -Math.min(log?.value ?? 0, rule.step || 1),
        );
        return;
      case 'complete':
        this.setHabitLog(habitId, date, {
          value: habitDone(habit, log) ? 0 : (log?.goal ?? rule.goal),
          skipped: false,
        });
        return;
      case 'skip':
        this.setHabitLog(habitId, date, { value: 0, skipped: !log?.skipped });
        return;
      case 'reset':
        this.setHabitLog(habitId, date, { value: 0, skipped: false, note: '' });
    }
  };

  toggleHabit = (habitId: string, date: string) => {
    const habit = this.state.data.habits.find((candidate) => candidate.id === habitId);
    if (
      !habit ||
      !canEditHabitLog(habit, date, this.state.data.habitLogs, this.context.now()) ||
      !habitScheduled(habit, date)
    ) {
      return null;
    }
    const rule = habitAt(habit, date);
    if (rule.kind === 'quantity') {
      this.addHabitAmount(habitId, date, rule.step || 1);
    } else {
      this.changeHabitCheckin(habitId, date, { type: 'complete' });
    }
    return rule.kind;
  };

  undo = () => {
    this.requireActive();
    this.history.undo(this.repository.getSnapshot().workspace, this.commit);
    this.publish();
  };

  redo = () => {
    this.requireActive();
    this.history.redo(this.repository.getSnapshot().workspace, this.commit);
    this.publish();
  };

  flush = () => this.repository.flush();
  retrySave = () => this.repository.retrySave();
  refresh = async () => {
    await this.flush();
    this.publish();
  };
  sync = async () => {
    await this.flush();
    await this.options.synchronization?.sync();
  };

  resolve = async (id: string, choice: string) => {
    this.requireActive();
    await this.repository.resolve(id, choice);
    this.publish();
  };

  exportData = async () => {
    await this.flush();
    return this.options.archive.exportData();
  };
  inspectImport = (source: string) => this.options.archive.inspectImport(source);
  importData = async (source: string) => {
    await this.flush();
    await this.options.archive.importData(source);
  };

  close() {
    return (this.closing ??= this.finishClose());
  }

  private async finishClose() {
    this.closed = true;
    const failures = new Set<unknown>();
    const cleanup = [
      this.flush,
      ...this.unsubscribe,
      () => this.options.synchronization?.close(),
      () => this.repository.close(),
    ];
    for (const action of cleanup) {
      try {
        await Promise.resolve(action());
      } catch (error) {
        failures.add(error);
      }
    }
    this.listeners.clear();
    if (failures.size === 1) {
      throw [...failures][0];
    }
    if (failures.size) {
      throw new AggregateError([...failures], 'workspace_close_failed', {
        cause: [...failures][0],
      });
    }
  }
}
