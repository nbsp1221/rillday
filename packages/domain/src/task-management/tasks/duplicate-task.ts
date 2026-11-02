import invariant from 'tiny-invariant';
import { v5 as uuidV5 } from 'uuid';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { resetChecks } from '../completion/markdown-checks.ts';
import { createTask } from './create-task.ts';
import { requireTask, taskDescendants } from './task-hierarchy.ts';
import { taskProperties } from './task.ts';

export function duplicateTask(
  workspace: Workspace,
  id: string,
  newId: string,
  title: string | undefined,
  context: DomainContext,
) {
  const root = requireTask(workspace, id);
  const tree = [root, ...taskDescendants(workspace, id).filter((task) => !task.trashedAt)];
  const mapping = new Map(
    tree.map((task) => [task.id, task === root ? newId : uuidV5(task.id, newId)]),
  );
  for (const targetId of mapping.values()) {
    if (workspace.tasks[targetId]) {
      throw new Fault('id_exists', 'conflict');
    }
  }
  for (const task of tree) {
    const parentId = task.location.parentId;
    const targetId = mapping.get(task.id);
    invariant(targetId !== undefined, 'Every duplicated task must have a mapped ID');
    createTask(
      workspace,
      targetId,
      {
        ...taskProperties(task),
        title: task === root ? (title ?? task.title) : task.title,
        notes: resetChecks(task.notes),
        completedAt: null,
        generatedFromId: null,
        voided: false,
        location: {
          ...task.location,
          parentId: parentId ? (mapping.get(parentId) ?? parentId) : null,
        },
      },
      context,
    );
  }
}
