import { expect, test, vi } from 'vitest';
import { WorkspaceHistory } from './workspace-history.ts';

function fixture() {
  let data = {
    tasks: {
      first: { title: 'First', completed: false },
      second: { title: 'Second', completed: false },
    },
  };
  const versions = new Map<string, string>();
  const history = new WorkspaceHistory<typeof data>(
    (path) => versions.get(JSON.stringify(path)) ?? 'absent',
    () => {},
  );

  const commit = (next: typeof data, paths: string[][]) => {
    data = next;
    for (const path of paths) {
      versions.set(JSON.stringify(path), crypto.randomUUID());
    }
  };

  function edit(title: string, key = '') {
    history.change(
      data,
      (draft) => {
        draft.tasks.first.title = title;
      },
      (next) => commit(next, [['tasks', 'first']]),
      key,
    );
  }

  return {
    history,
    edit,
    read: () => data,
    commit,
    apply: (next: typeof data) => commit(next, [['tasks', 'first']]),
  };
}

test('patch-based undo and redo preserve a later edit to another task', () => {
  const { history, edit, read, commit, apply } = fixture();
  edit('Edited');
  commit(
    { ...read(), tasks: { ...read().tasks, second: { title: 'Remote change', completed: false } } },
    [['tasks', 'second']],
  );
  history.undo(read(), apply);
  expect(read().tasks).toMatchObject({
    first: { title: 'First' },
    second: { title: 'Remote change' },
  });
  history.redo(read(), apply);
  expect(read().tasks).toMatchObject({
    first: { title: 'Edited' },
    second: { title: 'Remote change' },
  });
});

test('a later write to the same task blocks undo even when its visible value is identical', () => {
  const { history, edit, read, commit, apply } = fixture();
  edit('Edited');
  commit(read(), [['tasks', 'first']]);
  expect(() => history.undo(read(), apply)).toThrow('undo_target_changed');
  expect(read().tasks.first.title).toBe('Edited');
  expect(history.canUndo).toBe(true);
});

test('typing groups use 800ms and expire 15 minutes after their first edit', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
    const { history, edit, read, apply } = fixture();
    edit('One', 'title');
    vi.advanceTimersByTime(799);
    edit('Two', 'title');
    history.undo(read(), apply);
    expect(read().tasks.first.title).toBe('First');
    history.redo(read(), apply);
    vi.advanceTimersByTime(15 * 60 * 1000 - 799);
    expect(history.canUndo).toBe(true);
    vi.advanceTimersByTime(1);
    expect(history.canUndo).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('history retains forty groups and a new edit clears redo', () => {
  const { history, edit, read, apply } = fixture();
  for (let index = 0; index < 41; index++) {
    edit(`Edit ${index}`);
  }
  for (let index = 0; index < 40; index++) {
    history.undo(read(), apply);
  }
  expect(history.canUndo).toBe(false);
  expect(read().tasks.first.title).toBe('Edit 0');
  expect(history.canRedo).toBe(true);
  edit('New edit');
  expect(history.canRedo).toBe(false);
});

test('a remote edit between typing operations breaks the group and remains protected after undo', () => {
  const { history, edit, read, commit, apply } = fixture();
  edit('First local', 'typing');
  commit(
    { ...read(), tasks: { ...read().tasks, first: { title: 'Remote title', completed: false } } },
    [['tasks', 'first']],
  );
  edit('Second local', 'typing');
  history.undo(read(), apply);
  expect(read().tasks.first.title).toBe('Remote title');
  expect(() => history.undo(read(), apply)).toThrow('undo_target_changed');
});

test('undo cannot revive an earlier operation invalidated by an identical remote write', () => {
  const { history, edit, read, commit, apply } = fixture();
  edit('One');
  commit(read(), [['tasks', 'first']]);
  edit('Two');
  history.undo(read(), apply);
  expect(read().tasks.first.title).toBe('One');
  expect(() => history.undo(read(), apply)).toThrow('undo_target_changed');
});

test('a rejected commit leaves Undo history and the current data unchanged', () => {
  const { history, edit, read } = fixture();
  edit('Edited');
  expect(() =>
    history.undo(read(), () => {
      throw new Error('acceptance_failed');
    }),
  ).toThrow('acceptance_failed');
  expect(history.canUndo).toBe(true);
  expect(history.canRedo).toBe(false);
  expect(read().tasks.first.title).toBe('Edited');
});

test('reading history availability from an acceptance notification cannot lose the redo group', () => {
  const { history, edit, read, apply } = fixture();
  edit('Edited');
  history.undo(read(), (next) => {
    apply(next);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });
  expect(history.canRedo).toBe(true);
  history.redo(read(), apply);
  expect(read().tasks.first.title).toBe('Edited');
});
