import { IDBFactory } from 'fake-indexeddb';
import { expect, onTestFinished, test, vi } from 'vitest';
import { createIndexedDbStorage, withWorkspaceLock } from '../adapters/browser/index.ts';
import { createFetchServerTransport } from '../adapters/http/server-transport.ts';
import { createApplication } from './application.ts';
import { createDemoWorkspace } from './demo.ts';
import { createHabitDraft, habitDone, habitStats } from './workspace/habits.ts';
import { createTaskRecord } from './workspace/tasks.ts';

async function fixture({
  demo = false,
  initialize = true,
  reset = true,
  transport = createFetchServerTransport(),
} = {}) {
  if (reset) {
    vi.stubGlobal('indexedDB', new IDBFactory());
  }
  const storage = createIndexedDbStorage({ demo });
  const app = createApplication({
    transport,
    storage,
    coordination: { withWorkspaceLock },
    credentials: { restore: vi.fn().mockResolvedValue(null), remember: vi.fn(), forget: vi.fn() },
    demo,
  });
  onTestFinished(() => app.dispose());
  if (initialize) {
    await app.initialize();
  }
  return {
    app,
    accounts: storage.accounts,
    documents: storage.documents,
    preferences: storage.preferences,
  };
}

test('account discovery uses the injected transport without accessing ambient HTTP', async () => {
  using ambient = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected HTTP'));
  const server = {
    product: 'Rillday',
    protocol: 1,
    serverId: crypto.randomUUID(),
    setupRequired: false,
    registration: 'administrator',
    maxAccounts: 10,
  };
  const transport = { request: vi.fn().mockResolvedValue(server), verifyIdentity: vi.fn() };
  const { app } = await fixture({ transport });
  await expect(app.connection.checkServer('https://sync.example.test')).resolves.toEqual(server);
  expect(transport.request).toHaveBeenCalledExactlyOnceWith(
    'https://sync.example.test',
    '/v1/server',
  );
  expect(ambient).not.toHaveBeenCalled();
});

test('the actual application starts offline, saves edits and restores an archive by switching the registry document', async () => {
  const { app, accounts } = await fixture();
  const workspace = app.getSnapshot().workspace;
  const task = createTaskRecord('Saved locally', workspace.getSnapshot().data)!;
  workspace.apply({ type: 'task.create', tasks: [task] });
  await app.flushForExit();
  const archive = await workspace.exportData();
  const original = (await accounts.readRegistry()).accounts[0].contentId;
  workspace.apply({ type: 'task.update', id: task.id, patch: { title: 'Later edit' } });
  await workspace.flush();
  await workspace.importData(archive);
  const next = app.getSnapshot().workspace;
  expect(next).not.toBe(workspace);
  expect(next.getSnapshot().data.tasks[0].title).toBe('Saved locally');
  expect(next.getSnapshot().syncState).toBe('local');
  expect((await accounts.readRegistry()).accounts[0].contentId).not.toBe(original);
  expect(next.getSnapshot().canUndo).toBe(false);
  const [backup] = app.connection.getSnapshot().backups!;
  expect(backup.contents.tasks).toBe(1);
  expect(
    next.inspectImport(await app.connection.downloadConnectionBackup(backup.id)),
  ).toMatchObject({ tasks: 1 });
});

test('local applications exchange edits, protect tab-owned Undo and retain conflict alternatives across restart', async () => {
  const first = await fixture();
  const left = first.app.getSnapshot().workspace;
  const task = createTaskRecord('Shared local task', left.getSnapshot().data)!;
  left.apply({ type: 'task.create', tasks: [task] });
  await left.flush();
  const second = await fixture({ reset: false });
  const right = second.app.getSnapshot().workspace;
  expect(right.getSnapshot().canUndo).toBe(false);
  right.apply({ type: 'task.update', id: task.id, patch: { notes: 'Other tab' } });
  await right.flush();
  await expect.poll(() => left.getSnapshot().data.tasks[0].notes).toBe('Other tab');
  expect(() => left.undo()).toThrow('undo_target_changed');
  left.apply({ type: 'task.update', id: task.id, patch: { title: 'Disjoint title' } });
  right.apply({ type: 'task.update', id: task.id, patch: { notes: 'Disjoint note' } });
  await Promise.all([left.flush(), right.flush()]);
  await expect
    .poll(() =>
      [left, right].map((session) => ({
        title: session.getSnapshot().data.tasks[0].title,
        notes: session.getSnapshot().data.tasks[0].notes,
      })),
    )
    .toEqual([
      { title: 'Disjoint title', notes: 'Disjoint note' },
      { title: 'Disjoint title', notes: 'Disjoint note' },
    ]);
  left.apply({ type: 'task.update', id: task.id, patch: { title: 'First alternative' } });
  right.apply({ type: 'task.update', id: task.id, patch: { title: 'Second alternative' } });
  right.apply({ type: 'task.update', id: task.id, patch: { notes: 'Retained dependent note' } });
  await Promise.all([left.flush(), right.flush()]);
  await expect
    .poll(() => [left, right].map((session) => session.getSnapshot().issues.length))
    .toEqual([1, 1]);
  await first.app.dispose();
  await second.app.dispose();
  const restarted = await fixture({ reset: false });
  const current = restarted.app.getSnapshot().workspace;
  const issue = current.getSnapshot().issues[0];
  expect(issue.choices).toHaveLength(2);
  const choice = issue.choices.find((choice) =>
    JSON.stringify(choice.description).includes('Second alternative'),
  )!;
  expect(choice).toBeDefined();
  await current.resolve(issue.id, choice.id);
  await current.flush();
  expect(current.getSnapshot().issues).toEqual([]);
  expect(current.getSnapshot().data.tasks[0]).toMatchObject({
    title: 'Second alternative',
    notes: 'Retained dependent note',
  });
});

test('a failed archive switch preserves the active session and its durable edits', async () => {
  const { app, accounts } = await fixture();
  const workspace = app.getSnapshot().workspace;
  const task = createTaskRecord('Keep this', workspace.getSnapshot().data)!;
  workspace.apply({ type: 'task.create', tasks: [task] });
  const archive = await workspace.exportData();
  const original = (await accounts.readRegistry()).accounts[0].contentId;
  vi.spyOn(accounts, 'saveRegistry').mockRejectedValueOnce(new Error('disk_full'));
  await expect(workspace.importData(archive)).rejects.toThrow('disk_full');
  expect(app.getSnapshot().workspace).toBe(workspace);
  expect((await accounts.readRegistry()).accounts[0].contentId).toBe(original);
  expect(workspace.getSnapshot().data.tasks[0].title).toBe('Keep this');
  expect(workspace.getSnapshot().saveState).toBe('saved');
});

test('the demo uses the same typed repository and domain records as the regular application', async () => {
  const { app } = await fixture({ demo: true });
  const state = app.getSnapshot().workspace.getSnapshot();
  expect(state.data.tasks.length).toBeGreaterThan(20);
  expect(state.data.habits).toHaveLength(5);
  expect(state.data.habitLogs).toHaveLength(140);
  expect(() => createDemoWorkspace()).not.toThrow();
  await app.flushForExit();
  expect(app.getSnapshot().workspace.getSnapshot().saveState).toBe('saved');
});

test('a stale initial profile adopts the document another tab installed while opening', async () => {
  const { app, accounts, documents } = await fixture({ initialize: false });
  const stale = await accounts.loadRegistry();
  const document = await documents.create(createDemoWorkspace());
  onTestFinished(() => document.repository.close());
  await accounts.saveRegistry({
    ...stale,
    accounts: stale.accounts.map((profile) => ({ ...profile, contentId: document.repository.id })),
  });
  vi.spyOn(accounts, 'loadRegistry').mockResolvedValue(stale);
  const create = vi.spyOn(documents, 'create');
  await app.initialize();
  expect(create).not.toHaveBeenCalled();
  expect(app.getSnapshot().workspace.getSnapshot().data.habits).toHaveLength(5);
  expect((await accounts.readRegistry()).accounts[0].contentId).toBe(document.repository.id);
});

test('native archive restoration preserves child trees, selective trash, labels and historical decimal habit goals across reopening', async () => {
  const { app } = await fixture();
  const session = app.getSnapshot().workspace;
  const data = session.getSnapshot().data;
  const parent = createTaskRecord('Parent', data, {
    notes: '- [x] Review',
    tags: ['design'],
    order: 0,
    date: '2026-10-18',
    repeat: { frequency: 'daily', interval: 1 },
  })!;
  const child = createTaskRecord('Child', data, {
    parentId: parent.id,
    tags: ['design'],
    order: 1,
  })!;
  const sibling = createTaskRecord('Sibling', data, {
    parentId: parent.id,
    tags: ['design'],
    order: 2,
  })!;
  session.apply({ type: 'task.create', tasks: [parent, child, sibling] });
  session.renameLabel('design', 'research', '#a855f7');
  const duplicate = session.duplicateTask(parent.id, 'Copy');
  session.trashTask(parent.id);
  session.restoreTask(child.id);
  expect(session.getSnapshot().data.tasks.find((task) => task.id === parent.id)?.deleted).toBe(
    false,
  );
  expect(session.getSnapshot().data.tasks.find((task) => task.id === sibling.id)?.deleted).toBe(
    true,
  );
  session.purgeTasks([sibling.id]);
  session.removeLabel('research');
  const copied = session.getSnapshot().data.tasks.find((task) => task.id === duplicate)!;
  expect(copied.notes).toBe('- [ ] Review');
  expect(
    session.getSnapshot().data.tasks.filter((task) => task.parentId === duplicate),
  ).toHaveLength(2);
  expect(session.getSnapshot().data.tasks.every((task) => task.tags.length === 0)).toBe(true);
  session.completeTask(parent.id, true);
  const next = session.getSnapshot().data.tasks.find((task) => task.generatedFromId === parent.id)!;

  const habit = {
    ...createHabitDraft('L'),
    name: 'Water',
    kind: 'quantity' as const,
    goal: 0.3,
    step: 0.1,
    startDate: '2026-10-01',
    zone: 'UTC',
  };
  session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
  for (let index = 0; index < 3; index++) {
    session.addHabitAmount(habit.id, '2026-10-18', 0.1);
  }
  session.apply({
    type: 'habit.save',
    habit: { ...session.getSnapshot().data.habits[0], goal: 0.5 },
    weekStartsOn: 0,
  });
  const before = structuredClone(session.getSnapshot().data);
  expect(before.habitLogs[0].value).toBe(0.3);
  expect(before.habitLogs[0].goal).toBe(0.3);
  expect(habitDone(before.habits[0], before.habitLogs[0])).toBe(true);
  expect(habitStats(before.habits[0], before.habitLogs, '2026-10-19', 0).total).toBe(1);
  const archive = await session.exportData();
  session.apply({ type: 'task.update', id: parent.id, patch: { title: 'Later edit' } });
  await session.importData(archive);
  expect(app.getSnapshot().workspace.getSnapshot().data).toEqual(before);
  await app.dispose();

  const reopened = await fixture({ reset: false });
  const restored = reopened.app.getSnapshot().workspace;
  expect(restored.getSnapshot().data).toEqual(before);
  restored.completeTask(parent.id, false);
  expect(restored.getSnapshot().data.tasks.some((task) => task.id === next.id)).toBe(false);
  restored.completeTask(parent.id, true);
  expect(restored.getSnapshot().data.tasks.find((task) => task.id === next.id)?.createdAt).toBe(
    next.createdAt,
  );
  restored.addHabitAmount(habit.id, '2026-10-18', 0.1);
  await restored.flush();
  expect(restored.getSnapshot().data.habitLogs).toHaveLength(1);
  expect(restored.getSnapshot().data.habitLogs[0].value).toBe(0.4);
  expect(restored.getSnapshot().data.habitLogs[0].goal).toBe(0.3);
});
