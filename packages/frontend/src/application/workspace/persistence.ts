import type { WorkspaceIntent } from '../workspace-intents.ts';
import type { HabitCheckinAction } from './habits.ts';
import type { Habit, HabitLog, Priority, RepeatRule, WorkspaceData } from './model.ts';

export type WorkspaceLabel =
  | { system: 'inbox' | 'pending-edit' | 'backup-import' }
  | { system: 'priority'; value: Priority }
  | { system: 'repeat.frequency'; value: RepeatRule['frequency'] }
  | { system: 'habit.frequency'; value: Habit['frequency'] }
  | { system: 'habit.kind'; value: Habit['kind'] }
  | { system: 'matrix.mode'; value: 'simple' | 'complex' }
  | { system: 'quadrant'; value: 'do' | 'plan' | 'delegate' | 'later' }
  | { system: 'weekday'; value: number };

// Only conflict presentation uses these nodes. Authored text remains a literal leaf.
export type WorkspaceChange =
  | { type: 'literal'; value: string | number | boolean | null }
  | { type: 'system'; label: WorkspaceLabel }
  | { type: 'list'; items: WorkspaceChange[] }
  | { type: 'fields'; fields: Record<string, WorkspaceChange> };

export interface WorkspaceIssue {
  id: string;
  code: string;
  title: string | WorkspaceLabel;
  choices: { id: string; description: WorkspaceChange }[];
}

export interface WorkspaceSnapshot {
  data: WorkspaceData;
  saveState: 'saved' | 'saving' | 'error';
  error: string;
  syncState:
    | 'local'
    | 'syncing'
    | 'synced'
    | 'offline'
    | 'authentication-required'
    | 'conflict'
    | 'error';
  pending: number;
  issues: WorkspaceIssue[];
  canUndo: boolean;
  canRedo: boolean;
}

export interface WorkspacePort {
  getSnapshot: () => WorkspaceSnapshot;
  subscribe: (listener: () => void) => () => void;
  apply: (intents: WorkspaceIntent | WorkspaceIntent[], mergeKey?: string) => void;
  completeTask: (id: string, completed: boolean) => void;
  trashTask: (id: string) => void;
  restoreTask: (id: string) => void;
  purgeTasks: (ids: string[], undoable?: boolean) => void;
  duplicateTask: (id: string, title: string) => string;
  renameLabel: (oldName: string, newName: string, color: string | null) => void;
  removeLabel: (name: string) => void;
  removeList: (id: string) => void;
  setHabitLog: (
    habitId: string,
    date: string,
    patch: Partial<Pick<HabitLog, 'value' | 'skipped' | 'note'>>,
  ) => void;
  toggleHabit: (habitId: string, date: string) => Habit['kind'] | null;
  addHabitAmount: (habitId: string, date: string, amount: number) => void;
  changeHabitCheckin: (habitId: string, date: string, action: HabitCheckinAction) => void;
  undo: () => void;
  redo: () => void;
  flush: () => Promise<void>;
  sync: () => Promise<void>;
  retrySave: () => Promise<void>;
  refresh: () => Promise<void>;
  resolve: (id: string, choice: string) => Promise<void>;
  exportData: () => Promise<string>;
  inspectImport: (source: string) => { tasks: number; habits: number };
  importData: (source: string) => Promise<void>;
}
