import type { z } from 'zod';
import invariant from 'tiny-invariant';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { canonical } from '../../shared-kernel/canonical.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { requireTask, taskDescendants, validateTaskLocation } from './task-hierarchy.ts';
import { taskProperties, taskSchema, validateTaskData } from './task.ts';

const editSchema = taskSchema
  .omit({ completedAt: true, generatedFromId: true, voided: true })
  .partial();

export type TaskEdit = z.input<typeof editSchema>;

export function editTask(
  workspace: Workspace,
  id: string,
  input: TaskEdit,
  context: DomainContext,
) {
  const task = requireTask(workspace, id);
  const patch = editSchema.safeParse(input);
  if (!patch.success) {
    throw new Fault('invalid_task');
  }
  const previous = taskProperties(task);
  const data = validateTaskData({ ...previous, ...patch.data });
  if (canonical(previous) === canonical(data)) {
    return;
  }
  validateTaskLocation(workspace, { id, location: data.location });
  for (const labelId of data.labelIds) {
    if (!workspace.labels[labelId]) {
      throw new Fault('not_found', 'not-found');
    }
  }
  const now = context.now();
  if ('location' in patch.data) {
    const children = taskDescendants(workspace, id);
    let depth = 0;
    let parentId = data.location.parentId;
    while (parentId) {
      depth++;
      parentId = requireTask(workspace, parentId).location.parentId;
    }
    const depths = new Map([[id, depth]]);
    for (const child of children) {
      const parentId = child.location.parentId;
      invariant(parentId !== null, 'A descendant must have a parent');
      const parentDepth = depths.get(parentId);
      invariant(parentDepth !== undefined, 'Parent depth must be calculated before its children');
      const childDepth = parentDepth + 1;
      if (childDepth > 100) {
        throw new Fault('tree_too_deep');
      }
      depths.set(child.id, childDepth);
    }
    for (const child of children) {
      if (child.location.listId !== data.location.listId) {
        child.location.listId = data.location.listId;
        child.updatedAt = now;
      }
    }
  }
  Object.assign(task, data, { updatedAt: now });
}
