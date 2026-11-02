import { type Workspace, type WorkspaceTarget, canonical, quantityValue } from '@repo/domain';
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
  if (field === 'priority' && (value === 0 || value === 1 || value === 2 || value === 3)) {
    return { type: 'system', label: { system: 'priority', value } };
  }
  if (field === 'matrixMode' && (value === 'simple' || value === 'complex')) {
    return {
      type: 'system',
      label: { system: 'matrix.mode', value },
    };
  }
  if (
    target.collection === 'habits' &&
    field === 'frequency' &&
    (value === 'daily' || value === 'weekdays' || value === 'weekly' || value === 'interval')
  ) {
    return {
      type: 'system',
      label: { system: 'habit.frequency', value },
    };
  }
  if (
    target.collection === 'habits' &&
    field === 'kind' &&
    (value === 'boolean' || value === 'quantity')
  ) {
    return { type: 'system', label: { system: 'habit.kind', value } };
  }
  if (
    target.collection === 'tasks' &&
    field === 'frequency' &&
    (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'weekdays')
  ) {
    return {
      type: 'system',
      label: {
        system: 'repeat.frequency',
        value,
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
  if (target.collection === 'tasks' && 'location' in record) {
    const task = record;

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
  const first = items[0];
  return items.length === 1 && first !== undefined ? first : { type: 'list', items };
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
    if ('habitId' in record) {
      const habit = workspace.habits[record.habitId];
      if (habit) {
        return habit.name;
      }
    }
  }
  return { system: 'pending-edit' };
}

export function workspaceDecisions(reviews: WorkspaceDecision[]): WorkspaceIssue[] {
  return reviews.flatMap((review) => {
    const first = review.choices[0];
    if (!first) {
      return [];
    }
    return [
      {
        id: review.id,
        code: review.code,
        title: title(first.workspace, review.targets),
        choices: review.choices.map((choice, index) => ({
          id: choice.id,
          description: difference(
            choice.workspace,
            review.choices[index === 0 ? 1 : 0]?.workspace ?? choice.workspace,
            review.targets,
            review.choices.length > 1,
          ),
        })),
      },
    ];
  });
}
