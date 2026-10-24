import { type Workspace, type WorkspaceTarget, canonical, quantityValue } from '@repo/domain';
import type { Habit, Priority } from './model.ts';
import type { WorkspaceChange, WorkspaceIssue, WorkspaceLabel } from './persistence.ts';
import type { WorkspaceDecision } from './repository.ts';

const hiddenFields = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'rank',
  'generatedDigest',
  'generatedFromId',
  'trashGroup',
]);

function named(value: string | WorkspaceLabel | null): WorkspaceChange {
  return typeof value === 'object' && value !== null
    ? { type: 'system', label: value }
    : { type: 'literal', value };
}

function describe(
  value: unknown,
  workspace: Workspace,
  target: WorkspaceTarget,
  field = '',
): WorkspaceChange {
  if (field === 'habitId') {
    return named(workspace.habits[String(value)]?.name ?? '');
  }
  if (
    field === 'location' &&
    value &&
    typeof value === 'object' &&
    'listId' in value &&
    'parentId' in value
  ) {
    const list = workspace.lists[String(value.listId)];
    const parent = workspace.tasks[String(value.parentId)];
    return {
      type: 'fields',
      fields: {
        list: named(list?.system === 'inbox' ? { system: 'inbox' } : (list?.name ?? '')),
        parent: named(parent?.title ?? null),
      },
    };
  }
  if (field === 'labels' && Array.isArray(value)) {
    return {
      type: 'list',
      items: value.map((id: unknown) => named(workspace.labels[String(id)]?.name ?? String(id))),
    };
  }
  if (Array.isArray(value)) {
    return {
      type: 'list',
      items: value.map((entry: unknown) =>
        field === 'weekdays'
          ? { type: 'system', label: { system: 'weekday', value: Number(entry) } }
          : describe(entry, workspace, target, field),
      ),
    };
  }
  if (field === 'priority') {
    return { type: 'system', label: { system: 'priority', value: value as Priority } };
  }
  if (field === 'matrixMode') {
    return {
      type: 'system',
      label: { system: 'matrix.mode', value: value as Workspace['matrixMode'] },
    };
  }
  if (target.collection === 'habits' && field === 'frequency') {
    return {
      type: 'system',
      label: { system: 'habit.frequency', value: value as Habit['frequency'] },
    };
  }
  if (target.collection === 'habits' && field === 'kind') {
    return { type: 'system', label: { system: 'habit.kind', value: value as Habit['kind'] } };
  }
  if (target.collection === 'tasks' && field === 'frequency') {
    return {
      type: 'system',
      label: {
        system: 'repeat.frequency',
        value: value as 'daily' | 'weekly' | 'monthly' | 'weekdays',
      },
    };
  }
  if (value && typeof value === 'object') {
    return {
      type: 'fields',
      fields: Object.fromEntries(
        Object.entries(value).map(([name, entry]: [string, unknown]) => [
          name,
          describe(entry, workspace, target, name),
        ]),
      ),
    };
  }
  return {
    type: 'literal',
    value:
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : null,
  };
}

function visibleRecord(
  workspace: Workspace,
  target: WorkspaceTarget,
): Record<string, unknown> | null {
  if (target.collection === 'workspace') {
    return { matrixMode: workspace.matrixMode };
  }
  const record = workspace[target.collection][target.id];
  if (!record) {
    return null;
  }
  const fields = Object.fromEntries(
    Object.entries(record)
      .filter(([field]) => !hiddenFields.has(field))
      .map(([field, value]: [string, unknown]) =>
        field === 'completedAt'
          ? ['completed', Boolean(value)]
          : field === 'trashedAt'
            ? ['deleted', Boolean(value)]
            : field === 'quantity' && 'quantity' in record
              ? ['value', quantityValue(record.quantity)]
              : field === 'labelIds'
                ? ['labels', value]
                : [field, value],
      ),
  );
  if (target.collection === 'tasks') {
    const task = workspace.tasks[target.id];
    const siblings = Object.values(workspace.tasks)
      .filter(
        (candidate) =>
          !candidate.voided &&
          !candidate.purgedAt &&
          candidate.location.listId === task.location.listId &&
          candidate.location.parentId === task.location.parentId &&
          candidate.pinned === task.pinned &&
          Boolean(candidate.trashedAt) === Boolean(task.trashedAt) &&
          Boolean(candidate.completedAt) === Boolean(task.completedAt),
      )
      .sort((left, right) =>
        left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : left.id.localeCompare(right.id),
      );
    const index = siblings.findIndex((candidate) => candidate.id === task.id);
    fields.position = {
      after: siblings[index - 1]?.title ?? null,
      before: siblings[index + 1]?.title ?? null,
    };
  }
  return fields;
}

function difference(
  workspace: Workspace,
  other: Workspace,
  targets: WorkspaceTarget[],
  onlyChanged = true,
): WorkspaceChange {
  const unique = new Map(targets.map((target) => [canonical(target), target]));
  const items = [...unique.values()].map((target) => {
    const record = visibleRecord(workspace, target);
    const comparison = visibleRecord(other, target);
    if (!record) {
      return named(null);
    }
    const changed = Object.fromEntries(
      Object.entries(record).filter(
        ([field, value]) => !onlyChanged || canonical(value) !== canonical(comparison?.[field]),
      ),
    );
    return describe(changed, workspace, target);
  });
  return items.length === 1 ? items[0] : { type: 'list', items };
}

function title(workspace: Workspace, targets: WorkspaceTarget[]): string | WorkspaceLabel {
  for (const target of targets) {
    if (target.collection === 'workspace') {
      continue;
    }
    const record = workspace[target.collection][target.id];
    if (!record) {
      continue;
    }
    if ('title' in record) {
      return record.title;
    }
    if ('system' in record && record.system === 'inbox') {
      return { system: 'inbox' };
    }
    if ('key' in record && 'name' in record && record.name === null) {
      return { system: 'quadrant', value: record.key };
    }
    if ('name' in record && record.name) {
      return record.name;
    }
    if ('habitId' in record && workspace.habits[record.habitId]) {
      return workspace.habits[record.habitId].name;
    }
  }
  return { system: 'pending-edit' };
}

export function workspaceDecisions(reviews: WorkspaceDecision[]): WorkspaceIssue[] {
  return reviews
    .filter((review) => review.choices.length > 0)
    .map((review) => ({
      id: review.id,
      code: review.code,
      title: title(review.choices[0].workspace, review.targets),
      choices: review.choices.map((choice, index) => ({
        id: choice.id,
        description: difference(
          choice.workspace,
          review.choices[index === 0 ? 1 : 0]?.workspace ?? choice.workspace,
          review.targets,
          review.choices.length > 1,
        ),
      })),
    }));
}
