import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { rank, uuid } from '../../shared-kernel/values.ts';
import { taskListSchema } from './task-list.ts';

export function createList(workspace: Workspace, id: string, input: unknown) {
  const data = taskListSchema.safeParse(input);
  if (!data.success) {
    throw new Fault('invalid_list');
  }
  if (!uuid.safeParse(id).success) {
    throw new Fault('invalid_id');
  }
  if (workspace.lists[id]) {
    throw new Fault('id_exists', 'conflict');
  }
  if (data.data.system) {
    throw new Fault('immutable_field');
  }
  workspace.lists[id] = { ...data.data, id };
}

export function editList(workspace: Workspace, id: string, input: unknown) {
  const list = workspace.lists[id];
  if (!list) {
    throw new Fault('not_found', 'not-found');
  }
  const patch = taskListSchema.omit({ system: true }).extend({ rank }).partial().safeParse(input);
  if (!patch.success) {
    throw new Fault('invalid_list');
  }
  Object.assign(list, patch.data);
}

export function removeList(workspace: Workspace, id: string, context: DomainContext) {
  const list = workspace.lists[id];
  if (!list) {
    throw new Fault('not_found', 'not-found');
  }
  if (list.system === 'inbox') {
    throw new Fault('inbox_protected');
  }
  const inbox = Object.values(workspace.lists).find((candidate) => candidate.system === 'inbox');
  if (!inbox) {
    throw new Fault('missing_inbox', 'internal');
  }
  const now = context.now();
  for (const task of Object.values(workspace.tasks)) {
    if (!task.purgedAt && task.location.listId === id) {
      task.location.listId = inbox.id;
      task.updatedAt = now;
    }
  }
  delete workspace.lists[id];
}
