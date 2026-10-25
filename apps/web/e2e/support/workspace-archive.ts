import {
  type Workspace,
  checkInId,
  createWorkspace,
  currentRule,
  recordQuantity,
  validateWorkspace,
} from '@repo/domain';
import 'fake-indexeddb/auto';
import {
  type WorkspaceData,
  applyWorkspaceIntent,
  presentWorkspace,
} from '@repo/frontend/application';
import { createIndexedDbStorage } from '@repo/frontend/storage/indexeddb';
import { Temporal } from 'temporal-polyfill/implementation';
import invariant from 'tiny-invariant';

export async function archiveFixture(data: WorkspaceData, zone = 'Asia/Seoul'): Promise<string> {
  const context = { now: () => new Date().toISOString(), newId: () => crypto.randomUUID() };
  const workspace = createWorkspace(context);
  const inbox = Object.values(workspace.lists)[0];
  for (const list of data.lists) {
    if (list.id === 'inbox') {
      invariant(inbox !== undefined, 'Missing inbox');
      Object.assign(inbox, { name: list.name, color: list.color });
    } else {
      applyWorkspaceIntent(workspace, { type: 'list.create', list }, context, zone);
    }
  }
  const labels = new Set([
    ...(data.labels ?? []),
    ...Object.keys(data.labelColors ?? {}),
    ...data.tasks.flatMap((task) => task.tags),
  ]);
  for (const name of labels) {
    applyWorkspaceIntent(
      workspace,
      { type: 'label.create', name, color: data.labelColors?.[name] },
      context,
      zone,
    );
  }
  const tasks = [...data.tasks]
    .sort((left, right) => left.order - right.order)
    .map((task, order) => ({ ...task, order }));
  applyWorkspaceIntent(workspace, { type: 'task.create', tasks }, context, zone);
  for (const source of data.tasks) {
    const task1 = workspace.tasks[source.id];
    invariant(task1 !== undefined, 'Missing task');
    Object.assign(task1, {
      completedAt: source.completedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      generatedFromId: source.generatedFromId ?? null,
      trashedAt: source.deleted ? context.now() : null,
      trashGroup: source.deleted ? context.newId() : null,
    });
  }
  for (const habit of data.habits) {
    const startDate =
      habit.startDate ??
      Temporal.Instant.from(habit.createdAt)
        .toZonedDateTimeISO(habit.zone ?? zone)
        .toPlainDate()
        .toString();
    applyWorkspaceIntent(
      workspace,
      { type: 'habit.save', habit: { ...habit, startDate }, weekStartsOn: 0 },
      context,
      zone,
    );

    const savedHabit = workspace.habits[habit.id];
    invariant(savedHabit !== undefined, 'Missing habit');
    savedHabit.createdAt = habit.createdAt;
    if (habit.rules) {
      savedHabit.rules = structuredClone(habit.rules);
    }
  }
  for (const log of data.habitLogs) {
    const habit = workspace.habits[log.habitId];
    invariant(habit !== undefined, 'Missing habit');
    const rule = currentRule(habit, log.date);
    const id = checkInId(habit.id, log.date);
    workspace.checkIns[id] = {
      id,
      habitId: habit.id,
      date: log.date,
      skipped: log.skipped,
      note: log.note,
      quantity: recordQuantity(log.value, context.newId()),
      goal: log.goal ?? rule.goal,
      unit: log.unit ?? rule.unit,
      ruleFrom: log.ruleFrom ?? rule.from,
    };
  }
  workspace.matrixMode = data.matrixMode ?? 'simple';
  for (const quadrant of Object.values(workspace.quadrants)) {
    const source = data.quadrants.find((item) => item.id === quadrant.key);
    if (source) {
      Object.assign(quadrant, source, { id: quadrant.id });
    }
  }
  validateWorkspace(workspace);
  const storage = createIndexedDbStorage();
  try {
    const document = await storage.documents.create(workspace);
    try {
      return await document.exportData();
    } finally {
      await document.repository.close();
    }
  } finally {
    await storage.accounts.close();
    await storage.close();
  }
}

export async function readArchive(source: string, zone: string): Promise<WorkspaceData> {
  const storage = createIndexedDbStorage();
  try {
    return presentWorkspace(storage.documents.inspectArchive(source), zone);
  } finally {
    await storage.accounts.close();
    await storage.close();
  }
}

export async function conflictingArchive(
  source: string,
  changes: [(workspace: Workspace) => void, (workspace: Workspace) => void],
): Promise<string> {
  const storage = createIndexedDbStorage();
  try {
    const left = await storage.documents.restoreArchive(source);
    try {
      left.pause();
      const right = await storage.documents.restoreArchive(source);
      try {
        right.pause();
        for (const [index, document] of [left, right].entries()) {
          const next = structuredClone(document.repository.getSnapshot().workspace);
          const change = changes[index];
          invariant(change !== undefined, 'Missing change');
          change(next);
          await document.repository.commit(next);
        }
        await left.includeArchive(await right.exportData());
        if (!left.repository.getSnapshot().decisions.length) {
          throw new Error('Expected actual document conflicts');
        }
        return await left.exportData();
      } finally {
        await right.repository.close();
      }
    } finally {
      await left.repository.close();
    }
  } finally {
    await storage.accounts.close();
    await storage.close();
  }
}
