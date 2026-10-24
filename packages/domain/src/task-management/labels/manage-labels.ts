import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { rank, uuid } from '../../shared-kernel/values.ts';
import { type LabelData, labelSchema } from './label.ts';

function validateLabel(workspace: Workspace, id: string, input: unknown): LabelData {
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) {
    throw new Fault('invalid_label');
  }
  if (
    Object.values(workspace.labels).some(
      (label) =>
        label.id !== id && label.name.normalize('NFC') === parsed.data.name.normalize('NFC'),
    )
  ) {
    throw new Fault('constraint_violation', 'conflict');
  }
  return parsed.data;
}

export function createLabel(workspace: Workspace, id: string, input: unknown) {
  if (!uuid.safeParse(id).success) {
    throw new Fault('invalid_id');
  }
  if (workspace.labels[id]) {
    throw new Fault('id_exists', 'conflict');
  }
  workspace.labels[id] = { ...validateLabel(workspace, id, input), id };
}

export function editLabel(workspace: Workspace, id: string, input: unknown) {
  const label = workspace.labels[id];
  if (!label) {
    throw new Fault('not_found', 'not-found');
  }
  const parsed = labelSchema.extend({ rank }).partial().safeParse(input);
  if (!parsed.success) {
    throw new Fault('invalid_label');
  }
  const { id: _id, ...previous } = label;
  Object.assign(label, validateLabel(workspace, id, { ...previous, ...parsed.data }));
}

export function removeLabel(workspace: Workspace, id: string, context: DomainContext) {
  if (!workspace.labels[id]) {
    throw new Fault('not_found', 'not-found');
  }
  const now = context.now();
  for (const task of Object.values(workspace.tasks)) {
    if (!task.purgedAt && task.labelIds.includes(id)) {
      task.labelIds = task.labelIds.filter((labelId) => labelId !== id);
      task.updatedAt = now;
    }
  }
  delete workspace.labels[id];
}
