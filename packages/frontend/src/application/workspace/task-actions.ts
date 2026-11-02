import type { Task, WorkspaceData } from './model.ts';
import type { WorkspacePort } from './persistence.ts';
import { dateKey } from './dates.ts';
import { type QuickInputOptions, parseQuickInput } from './quick-input.ts';
import {
  type TaskPatch,
  type TaskScheduleTarget,
  calendarTaskPatch,
  matrixTaskPatch,
  normalizeTaskPatch,
  quadrantPriorities,
  reorderTask,
  taskBelongsToQuadrant,
} from './task-policies.ts';
import { createTaskRecord } from './tasks.ts';

// Applied means accepted by the local port. Durable saving remains in WorkspaceSnapshot.
export type TaskActionResult<T = undefined> =
  | { status: 'applied'; value: T }
  | { status: 'unchanged' }
  | { status: 'failed'; code: string };

export interface TaskCreation {
  input: string;
  options?: Partial<Task>;
}

export type TaskActionPort = Pick<
  WorkspacePort,
  | 'getSnapshot'
  | 'apply'
  | 'completeTask'
  | 'trashTask'
  | 'restoreTask'
  | 'purgeTasks'
  | 'duplicateTask'
  | 'undo'
  | 'redo'
>;

const unchanged = { status: 'unchanged' } as const;

function applied<T>(value: T): TaskActionResult<T> {
  return { status: 'applied', value };
}

function attempt<T>(operation: () => TaskActionResult<T>): TaskActionResult<T> {
  try {
    return operation();
  } catch (error) {
    return { status: 'failed', code: error instanceof Error ? error.message : 'save_failed' };
  }
}

function requireTaskState(task: Task | undefined, trashed = false): Task {
  if (!task) {
    throw new Error('not_found');
  }

  if (task.deleted !== trashed) {
    throw new Error(task.deleted ? 'trashed' : 'invalid_entity');
  }

  return task;
}

function requireTask(data: WorkspaceData, id: string, trashed = false): Task {
  return requireTaskState(
    data.tasks.find((item) => item.id === id),
    trashed,
  );
}

export function createTaskActions(
  workspace: TaskActionPort,
  recognition: () => QuickInputOptions = () => ({}),
) {
  const current = () => workspace.getSnapshot().data;

  function editTask(id: string, patch: TaskPatch): TaskActionResult {
    const task = requireTask(current(), id);
    const normalized = normalizeTaskPatch(task, patch);

    if (normalized.title !== undefined && !normalized.title.trim()) {
      throw new Error('invalid_entity');
    }

    if (
      Object.entries(normalized).every(
        ([key, value]) => JSON.stringify(Reflect.get(task, key)) === JSON.stringify(value),
      )
    ) {
      return unchanged;
    }

    workspace.apply(
      { type: 'task.update', id, patch: normalized },
      `task:${id}:${Object.keys(patch).sort().join(',')}`,
    );

    return applied(undefined);
  }

  function createMany(items: TaskCreation[]): TaskActionResult<[Task, ...Task[]]> {
    return attempt(() => {
      const data = current();
      const order = -Date.now();
      const created = items.flatMap((item, index) => {
        if (item.options?.parentId) {
          requireTask(data, item.options.parentId);
        }

        const task = createTaskRecord(
          item.input,
          data,
          { order: order + index * 0.001, ...item.options },
          recognition(),
        );

        return task ? [task] : [];
      });

      const [first, ...remaining] = created;
      if (!first) {
        return { status: 'failed', code: 'task_title_required' };
      }

      workspace.apply({ type: 'task.create', tasks: created });

      return applied<[Task, ...Task[]]>([first, ...remaining]);
    });
  }

  return {
    createMany,
    create(this: void, input: string, options?: Partial<Task>): TaskActionResult<Task> {
      const result = createMany([{ input, options }]);

      return result.status === 'applied' ? applied(result.value[0]) : result;
    },
    createSubtask(this: void, parentId: string, input: string): TaskActionResult<Task> {
      return attempt(() => {
        const data = current();
        const parent = requireTask(data, parentId);
        const children = data.tasks.filter((task) => task.parentId === parentId && !task.deleted);
        const result = createMany([
          {
            input,
            options: {
              parentId,
              listId: parent.listId,
              order: children.length ? Math.max(...children.map((task) => task.order)) + 1 : 0,
            },
          },
        ]);

        return result.status === 'applied' ? applied(result.value[0]) : result;
      });
    },
    createInQuadrant(this: void, quadrantId: string, input: string): TaskActionResult<Task> {
      return attempt(() => {
        const data = current();
        const quadrant = data.quadrants.find((item) => item.id === quadrantId);

        if (!quadrant) {
          throw new Error('not_found');
        }

        const parsed = parseQuickInput(input, dateKey(), recognition());
        const result = createMany([
          {
            input,
            options: {
              priority: /(?:^|\s)[!！][1-4](?:\s|$)/.test(input)
                ? parsed.priority
                : quadrantPriorities[quadrant.id],
              ...(data.matrixMode === 'complex' && !parsed.date
                ? { date: quadrant.urgent ? dateKey() : null }
                : {}),
            },
          },
        ]);

        return result.status === 'applied' ? applied(result.value[0]) : result;
      });
    },
    update(this: void, id: string, patch: TaskPatch) {
      return attempt(() => editTask(id, patch));
    },
    setDate(this: void, id: string, date: string | null) {
      return attempt(() => {
        const task = requireTask(current(), id);
        const repeat = task.repeat;

        return editTask(id, {
          date,
          ...(date && repeat?.until && repeat.until < date
            ? { repeat: { ...repeat, until: date } }
            : {}),
        });
      });
    },
    setTime(this: void, id: string, time: Task['time']) {
      return attempt(() => {
        const task = requireTask(current(), id);
        return editTask(id, { time, date: time ? (task.date ?? dateKey()) : task.date });
      });
    },
    setRepeat(this: void, id: string, repeat: Task['repeat']) {
      return attempt(() => {
        const task = requireTask(current(), id);
        return editTask(id, { repeat, date: repeat ? (task.date ?? dateKey()) : task.date });
      });
    },
    toggle(this: void, id: string) {
      return attempt(() => {
        const task = requireTask(current(), id);
        workspace.completeTask(id, !task.completedAt);

        return applied(undefined);
      });
    },
    trash(this: void, id: string) {
      return attempt(() => {
        requireTask(current(), id);
        workspace.trashTask(id);

        return applied(undefined);
      });
    },
    restore(this: void, id: string) {
      return attempt(() => {
        requireTask(current(), id, true);
        workspace.restoreTask(id);

        return applied(undefined);
      });
    },
    purge(this: void, ids: string[], undoable = true) {
      return attempt(() => {
        if (!ids.length) {
          return unchanged;
        }

        const tasks = new Map(current().tasks.map((task) => [task.id, task]));

        ids.forEach((id) => requireTaskState(tasks.get(id), true));
        workspace.purgeTasks(ids, undoable);

        return applied(undefined);
      });
    },
    duplicate(this: void, id: string, title: string) {
      return attempt(() => {
        requireTask(current(), id);

        return applied(workspace.duplicateTask(id, title));
      });
    },
    reorder(this: void, from: string, to: string, placement: 'before' | 'after') {
      return attempt(() => {
        const data = current();
        const draft = { ...data, tasks: data.tasks.map((task) => ({ ...task })) };
        requireTask(draft, from);
        requireTask(draft, to);

        if (!reorderTask(draft, from, to, placement)) {
          return unchanged;
        }

        workspace.apply({ type: 'task.reorder', from, to, placement });

        return applied(undefined);
      });
    },
    schedule(
      this: void,
      id: string,
      target: TaskScheduleTarget,
    ): TaskActionResult<TaskScheduleTarget> {
      return attempt(() => {
        const patch = calendarTaskPatch(requireTask(current(), id), target);
        const result = editTask(id, patch);

        return result.status === 'applied'
          ? applied({ date: patch.date, time: patch.time })
          : result;
      });
    },
    moveToList(this: void, id: string, listId: string) {
      return attempt(() => {
        const data = current();
        const task = requireTask(data, id);
        const list = data.lists.find((item) => item.id === listId);

        if (!list) {
          throw new Error('not_found');
        }

        if (task.listId === listId) {
          return unchanged;
        }

        return editTask(id, { listId, ...(task.parentId ? { parentId: null } : {}) });
      });
    },
    moveToQuadrant(this: void, id: string, quadrantId: string) {
      return attempt(() => {
        const data = current();
        const task = requireTask(data, id);
        const quadrant = data.quadrants.find((item) => item.id === quadrantId);

        if (!quadrant) {
          throw new Error('not_found');
        }

        const mode = data.matrixMode ?? 'simple';

        if (task.completedAt || taskBelongsToQuadrant(task, quadrant, mode)) {
          return unchanged;
        }

        return editTask(id, matrixTaskPatch(task, quadrant, mode));
      });
    },
    undo(this: void) {
      return attempt(() => {
        if (!workspace.getSnapshot().canUndo) {
          return unchanged;
        }

        workspace.undo();

        return applied(undefined);
      });
    },
    redo(this: void) {
      return attempt(() => {
        if (!workspace.getSnapshot().canRedo) {
          return unchanged;
        }

        workspace.redo();

        return applied(undefined);
      });
    },
  };
}

export type TaskActions = ReturnType<typeof createTaskActions>;
