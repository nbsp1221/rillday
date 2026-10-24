import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { uuid } from '../../shared-kernel/values.ts';
import { validateTaskLocation } from './task-hierarchy.ts';
import { type Task, instantiateTask, validateTaskData } from './task.ts';

export function createTask(
  workspace: Workspace,
  id: string,
  input: unknown,
  context: DomainContext,
): Task {
  if (!uuid.safeParse(id).success) {
    throw new Fault('invalid_id');
  }
  if (workspace.tasks[id]) {
    throw new Fault('id_exists', 'conflict');
  }
  const data = validateTaskData(input);
  if (data.completedAt || data.generatedFromId || data.voided) {
    throw new Fault('immutable_field');
  }
  validateTaskLocation(workspace, { id, location: data.location });
  for (const labelId of data.labelIds) {
    if (!workspace.labels[labelId]) {
      throw new Fault('not_found', 'not-found');
    }
  }
  const task = instantiateTask(id, data, context);
  workspace.tasks[id] = task;
  return task;
}
