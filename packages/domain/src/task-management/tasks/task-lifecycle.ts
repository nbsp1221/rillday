import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { requireTask, taskDescendants } from './task-hierarchy.ts';
import { taskData, validateTaskData } from './task.ts';

function restorableTree(workspace: Workspace, id: string) {
  const root = requireTask(workspace, id, true);
  if (root.voided) {
    throw new Fault('voided_occurrence', 'conflict');
  }
  return { root, tree: [root, ...taskDescendants(workspace, id)] };
}

export function trashTask(workspace: Workspace, id: string, context: DomainContext) {
  const { tree } = restorableTree(workspace, id);
  const now = context.now();
  const group = context.newId();
  for (const task of tree) {
    if (!task.trashedAt) {
      task.trashedAt = now;
      task.trashGroup = group;
      task.updatedAt = now;
    }
  }
}

export function restoreTask(workspace: Workspace, id: string, context: DomainContext) {
  const { root, tree } = restorableTree(workspace, id);
  const group = root.trashGroup;
  const now = context.now();
  for (const task of tree) {
    if (task.trashedAt && !task.voided && (task.id === id || task.trashGroup === group)) {
      task.trashedAt = null;
      task.trashGroup = null;
      task.updatedAt = now;
    }
  }
  let parentId = root.location.parentId;
  const ancestors = new Set([id]);
  while (parentId) {
    if (ancestors.has(parentId) || ancestors.size > 100) {
      throw new Fault('cycle');
    }
    ancestors.add(parentId);
    const parent = requireTask(workspace, parentId, true);
    if (parent.trashedAt) {
      parent.trashedAt = null;
      parent.trashGroup = null;
      parent.updatedAt = now;
    }
    parentId = parent.location.parentId;
  }
}

export function purgeTask(workspace: Workspace, id: string, context: DomainContext) {
  const { root, tree } = restorableTree(workspace, id);
  if (!root.trashedAt) {
    throw new Fault('trash_required');
  }
  const now = context.now();
  for (const task of tree) {
    const data = validateTaskData(
      taskData(task.location.listId, '[purged]', {
        generatedFromId: task.generatedFromId,
      }),
    );
    Object.assign(task, data, { purgedAt: now, updatedAt: now });
  }
}
