import { canonical } from '../shared-kernel/canonical.ts';
import { taskDescendants } from '../task-management/tasks/task-hierarchy.ts';
import type { Workspace } from './workspace.ts';
import {
  type WorkspaceProblem,
  type WorkspaceTarget,
  inspectWorkspace,
} from './validate-workspace.ts';

type RecordScope = { target: WorkspaceTarget; fields?: readonly string[] };

function completionScope(workspace: Workspace, id: string): RecordScope[] {
  let next = workspace.tasks[id];
  if (!next?.generatedFromId) {
    return [];
  }
  const visited = new Set([next.id]);
  while (next.location.parentId) {
    const parent = workspace.tasks[next.location.parentId];
    if (!parent?.generatedFromId || !parent.voided || visited.has(parent.id)) {
      break;
    }
    next = parent;
    visited.add(next.id);
  }
  const occurrences = [next, ...taskDescendants(workspace, next.id)];
  const scopes: RecordScope[] = occurrences.map((task) => ({
    target: { collection: 'tasks', id: task.id },
  }));
  for (const task of occurrences) {
    if (task.generatedFromId) {
      scopes.push({
        target: { collection: 'tasks', id: task.generatedFromId },
        fields: ['completedAt'],
      });
    }
  }
  return scopes;
}

function scopesFor(workspace: Workspace, problem: WorkspaceProblem): RecordScope[] {
  const { code, targets } = problem;
  if (
    code === 'constraint_violation' &&
    targets.every((target) => target.collection === 'labels')
  ) {
    return targets.map((target) => ({ target, fields: ['name'] }));
  }
  if (code === 'cycle' || code === 'tree_too_deep' || code === 'parent_list_mismatch') {
    return targets.map((target) => ({ target, fields: ['location'] }));
  }
  if (code === 'next_occurrence_edited') {
    return targets.flatMap((target) => completionScope(workspace, target.id));
  }
  if (code === 'next_occurrence_exists') {
    return targets.flatMap((target) => {
      const task = workspace.tasks[target.id];
      const scope = completionScope(workspace, target.id);
      if (task?.generatedFromId) {
        scope.push({
          target: { collection: 'tasks', id: task.generatedFromId },
          fields: ['schedule', 'completedAt'],
        });
      }
      return scope;
    });
  }
  if (code === 'trashed') {
    return targets.map((target) => ({ target, fields: ['trashedAt', 'trashGroup'] }));
  }
  if (code === 'not_found' && targets[0]?.collection === 'tasks') {
    const [task, ...references] = targets;
    return [
      {
        target: task,
        fields: references.some((target) => target.collection === 'labels')
          ? ['labelIds']
          : ['location'],
      },
      ...references.map((target) => ({ target })),
    ];
  }
  if (code === 'not_found' && targets[0]?.collection === 'checkIns') {
    return targets.map((target) =>
      target.collection === 'checkIns' ? { target, fields: [] } : { target },
    );
  }
  return targets.map((target) => ({ target }));
}

export function preservesWorkspaceReview(
  incoming: Workspace,
  before: Workspace,
  after: Workspace,
  problems: WorkspaceProblem[],
): boolean {
  return problems
    .flatMap((problem) => scopesFor(incoming, problem))
    .every(({ target, fields }) => {
      if (target.collection === 'workspace') {
        return before.matrixMode === after.matrixMode;
      }
      const previous = before[target.collection][target.id];
      const current = after[target.collection][target.id];
      if (!previous || !current || !fields) {
        return canonical(previous) === canonical(current);
      }
      return fields.every(
        (field) =>
          canonical(Object.entries(previous).find(([name]) => name === field)?.[1]) ===
          canonical(Object.entries(current).find(([name]) => name === field)?.[1]),
      );
    });
}

// Only the implicated product fields are proposed again; unrelated edits stay intact.
export function proposeWorkspaceReview(
  incoming: Workspace,
  previous: Workspace,
  problems: WorkspaceProblem[],
): Workspace {
  const proposal = structuredClone(incoming);
  let pending = problems;
  while (pending.length) {
    const before = canonical(proposal);
    const scopes = pending.flatMap((problem) => scopesFor(proposal, problem));
    for (const { target, fields } of scopes) {
      if (target.collection === 'workspace') {
        proposal.matrixMode = previous.matrixMode;
        continue;
      }
      const source: Record<string, object> = previous[target.collection];
      const destination: Record<string, object> = proposal[target.collection];
      const record = source[target.id];
      if (!record) {
        delete destination[target.id];
      } else if (fields && destination[target.id]) {
        for (const field of fields) {
          const value: unknown = Object.entries(record).find(([name]) => name === field)?.[1];
          Object.assign(destination[target.id], { [field]: structuredClone(value) });
        }
      } else {
        destination[target.id] = structuredClone(record);
      }
    }
    if (canonical(proposal) === before) {
      break;
    }
    pending = inspectWorkspace(proposal).filter((problem) => !problem.code.startsWith('quantity_'));
  }
  return proposal;
}

export function compareWorkspaceReviewChoices(
  left: Workspace,
  right: Workspace,
  problems: WorkspaceProblem[],
  previous?: Workspace,
): number {
  const visibleOccurrences = (workspace: Workspace) =>
    problems
      .filter((problem) => problem.code === 'next_occurrence_edited')
      .flatMap((problem) => problem.targets)
      .filter((target) => {
        const task = workspace.tasks[target.id];
        return task && !task.voided && !task.trashedAt && !task.purgedAt;
      }).length;

  const changesFromPrevious = (workspace: Workspace) =>
    previous
      ? problems
          .flatMap((problem) => problem.targets)
          .filter(
            (target) =>
              target.collection !== 'workspace' &&
              canonical(previous[target.collection][target.id]) !==
                canonical(workspace[target.collection][target.id]),
          ).length
      : 0;

  const preservedRecords = (workspace: Workspace) =>
    Object.keys(workspace.tasks).length +
    Object.keys(workspace.lists).length +
    Object.keys(workspace.labels).length +
    Object.keys(workspace.habits).length +
    Object.keys(workspace.checkIns).length;

  return (
    visibleOccurrences(right) - visibleOccurrences(left) ||
    changesFromPrevious(left) - changesFromPrevious(right) ||
    preservedRecords(right) - preservedRecords(left)
  );
}
