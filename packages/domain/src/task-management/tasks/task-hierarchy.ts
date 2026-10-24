import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import type { Task } from './task.ts';

export function requireTask(workspace: Workspace, id: string, includeTrash = false): Task {
  const task = workspace.tasks[id];
  if (!task || task.purgedAt) {
    throw new Fault('not_found', 'not-found');
  }
  if (task.trashedAt && !includeTrash) {
    throw new Fault('trashed', 'conflict');
  }
  return task;
}

export function taskDescendants(workspace: Workspace, id: string): Task[] {
  const tasks = Object.values(workspace.tasks).filter((task) => !task.purgedAt);
  const result: Task[] = [];
  const seen = new Set([id]);
  let parents = new Set([id]);
  while (parents.size) {
    const children = tasks.filter(
      (task) => task.location.parentId && parents.has(task.location.parentId) && !seen.has(task.id),
    );
    for (const task of children) {
      seen.add(task.id);
      result.push(task);
    }
    if (result.length > 2000) {
      throw new Fault('operation_too_large', 'too-large');
    }
    parents = new Set(children.map((task) => task.id));
  }
  return result;
}

export function validateTaskLocation(workspace: Workspace, task: Pick<Task, 'id' | 'location'>) {
  if (!workspace.lists[task.location.listId]) {
    throw new Fault('not_found', 'not-found');
  }
  const ancestors = new Set([task.id]);
  let parentId = task.location.parentId;
  while (parentId) {
    if (ancestors.has(parentId)) {
      throw new Fault('cycle');
    }
    if (ancestors.size > 100) {
      throw new Fault('tree_too_deep');
    }
    ancestors.add(parentId);
    const parent = requireTask(workspace, parentId);
    if (parent.location.listId !== task.location.listId) {
      throw new Fault('parent_list_mismatch');
    }
    parentId = parent.location.parentId;
  }
}
