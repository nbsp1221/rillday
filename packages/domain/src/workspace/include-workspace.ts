import invariant from 'tiny-invariant';
import type { DomainContext } from '../shared-kernel/clock.ts';
import { checkInId } from '../habit-tracking/check-ins/record-check-in.ts';
import { quantityValue, recordQuantity } from '../habit-tracking/check-ins/recorded-quantity.ts';
import { canonical, hash } from '../shared-kernel/canonical.ts';
import { type Task, taskProperties } from '../task-management/tasks/task.ts';
import type { Workspace } from './workspace.ts';
import { validateWorkspace } from './validate-workspace.ts';
import { workspaceContents } from './workspace-contents.ts';

// Inclusion copies a local collection into an account; engine replication does not use this path.
export function includeWorkspace(
  target: Workspace,
  source: Workspace,
  context: DomainContext,
): Workspace {
  validateWorkspace(source);
  validateWorkspace(target);
  const result = structuredClone(target);
  const lists = new Map<string, string>();
  const labels = new Map<string, string>();
  const tasks = new Map(Object.keys(source.tasks).map((id) => [id, context.newId()]));
  const habits = new Map(Object.keys(source.habits).map((id) => [id, context.newId()]));
  const groups = new Map<string, string>();
  const inbox = Object.values(target.lists).find((list) => list.system === 'inbox');
  invariant(inbox !== undefined, 'Missing inbox');
  if (!workspaceContents(target).hasData) {
    result.matrixMode = source.matrixMode;
    for (const quadrant of Object.values(result.quadrants)) {
      const incoming = Object.values(source.quadrants).find((entry) => entry.key === quadrant.key);
      Object.assign(quadrant, incoming, { id: quadrant.id });
    }
    const sourceInbox = Object.values(source.lists).find((list) => list.system === 'inbox');
    const targetInbox = result.lists[inbox.id];
    invariant(
      sourceInbox !== undefined && targetInbox !== undefined,
      'Validated workspaces require an inbox',
    );
    Object.assign(targetInbox, sourceInbox, { id: inbox.id });
  }
  for (const list of Object.values(source.lists)) {
    const id = list.system === 'inbox' ? inbox.id : context.newId();
    lists.set(list.id, id);
    if (list.system !== 'inbox') {
      result.lists[id] = { ...structuredClone(list), id };
    }
  }
  for (const label of Object.values(source.labels)) {
    const existing = Object.values(result.labels).find(
      (entry) => entry.name.normalize('NFC') === label.name.normalize('NFC'),
    );
    const id = existing?.id ?? context.newId();
    labels.set(label.id, id);
    if (!existing) {
      result.labels[id] = { ...structuredClone(label), id };
    }
  }
  for (const habit of Object.values(source.habits)) {
    const id = habits.get(habit.id);
    invariant(id !== undefined, 'Every included habit must have a mapped ID');
    result.habits[id] = { ...structuredClone(habit), id };
  }
  for (const checkIn of Object.values(source.checkIns)) {
    const habitId = habits.get(checkIn.habitId);
    invariant(habitId !== undefined, 'Every included check-in must have a mapped habit');
    const id = checkInId(habitId, checkIn.date);
    result.checkIns[id] = {
      ...structuredClone(checkIn),
      id,
      habitId,
      quantity: recordQuantity(quantityValue(checkIn.quantity), context.newId()),
    };
  }
  for (const task of Object.values(source.tasks)) {
    const id = tasks.get(task.id);
    invariant(id !== undefined, 'Every included task must have a mapped ID');
    if (task.trashGroup && !groups.has(task.trashGroup)) {
      groups.set(task.trashGroup, context.newId());
    }
    const listId = task.purgedAt ? inbox.id : lists.get(task.location.listId);
    const parentId =
      task.purgedAt || !task.location.parentId ? null : tasks.get(task.location.parentId);
    const trashGroup = task.trashGroup ? groups.get(task.trashGroup) : null;
    invariant(
      listId !== undefined && parentId !== undefined && trashGroup !== undefined,
      'Included task references must be mapped',
    );
    const copy: Task = {
      ...structuredClone(task),
      id,
      location: { listId, parentId },
      labelIds: task.purgedAt
        ? []
        : task.labelIds.map((labelId) => {
            const mapped = labels.get(labelId);
            invariant(mapped !== undefined, 'Included labels must have mapped IDs');
            return mapped;
          }),
      generatedFromId: task.generatedFromId ? (tasks.get(task.generatedFromId) ?? null) : null,
      trashGroup,
    };
    if (task.generatedDigest === hash(canonical({ ...taskProperties(task), voided: false }))) {
      copy.generatedDigest = hash(canonical({ ...taskProperties(copy), voided: false }));
    }
    result.tasks[id] = copy;
  }
  validateWorkspace(result);
  return result;
}
