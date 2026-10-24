import type { DomainContext } from '../shared-kernel/clock.ts';
import { checkInId } from '../habit-tracking/check-ins/record-check-in.ts';
import { quantityValue, recordQuantity } from '../habit-tracking/check-ins/recorded-quantity.ts';
import { canonical, hash } from '../shared-kernel/canonical.ts';
import { taskProperties } from '../task-management/tasks/task.ts';
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
  const inbox = Object.values(target.lists).find((list) => list.system === 'inbox')!;
  if (!workspaceContents(target).hasData) {
    result.matrixMode = source.matrixMode;
    for (const quadrant of Object.values(result.quadrants)) {
      const incoming = Object.values(source.quadrants).find((entry) => entry.key === quadrant.key)!;
      Object.assign(quadrant, incoming, { id: quadrant.id });
    }
    const sourceInbox = Object.values(source.lists).find((list) => list.system === 'inbox')!;
    Object.assign(result.lists[inbox.id], sourceInbox, { id: inbox.id });
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
    const id = habits.get(habit.id)!;
    result.habits[id] = { ...structuredClone(habit), id };
  }
  for (const checkIn of Object.values(source.checkIns)) {
    const habitId = habits.get(checkIn.habitId)!;
    const id = checkInId(habitId, checkIn.date);
    result.checkIns[id] = {
      ...structuredClone(checkIn),
      id,
      habitId,
      quantity: recordQuantity(quantityValue(checkIn.quantity), context.newId()),
    };
  }
  for (const task of Object.values(source.tasks)) {
    const id = tasks.get(task.id)!;
    if (task.trashGroup && !groups.has(task.trashGroup)) {
      groups.set(task.trashGroup, context.newId());
    }
    result.tasks[id] = {
      ...structuredClone(task),
      id,
      location: task.purgedAt
        ? { listId: inbox.id, parentId: null }
        : {
            listId: lists.get(task.location.listId)!,
            parentId: task.location.parentId ? tasks.get(task.location.parentId)! : null,
          },
      labelIds: task.purgedAt ? [] : task.labelIds.map((labelId) => labels.get(labelId)!),
      generatedFromId: task.generatedFromId ? (tasks.get(task.generatedFromId) ?? null) : null,
      trashGroup: task.trashGroup ? groups.get(task.trashGroup)! : null,
    };
    if (task.generatedDigest === hash(canonical({ ...taskProperties(task), voided: false }))) {
      result.tasks[id].generatedDigest = hash(
        canonical({ ...taskProperties(result.tasks[id]), voided: false }),
      );
    }
  }
  validateWorkspace(result);
  return result;
}
