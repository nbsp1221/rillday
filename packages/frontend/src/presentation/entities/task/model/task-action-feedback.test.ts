import { expect, test, vi } from 'vitest';
import type { TaskActions } from '#application';
import { createTranslations } from '../../../shared/i18n/index';
import { type TaskActionFeedback, withTaskActionFeedback } from './task-action-feedback';

function mockedActions() {
  return {
    create: vi.fn<TaskActions['create']>(),
    createMany: vi.fn<TaskActions['createMany']>(),
    createSubtask: vi.fn<TaskActions['createSubtask']>(),
    createInQuadrant: vi.fn<TaskActions['createInQuadrant']>(),
    update: vi.fn<TaskActions['update']>(),
    setDate: vi.fn<TaskActions['setDate']>(),
    setTime: vi.fn<TaskActions['setTime']>(),
    setRepeat: vi.fn<TaskActions['setRepeat']>(),
    toggle: vi.fn<TaskActions['toggle']>(),
    trash: vi.fn<TaskActions['trash']>(),
    restore: vi.fn<TaskActions['restore']>(),
    purge: vi.fn<TaskActions['purge']>(),
    duplicate: vi.fn<TaskActions['duplicate']>(),
    reorder: vi.fn<TaskActions['reorder']>(),
    schedule: vi.fn<TaskActions['schedule']>(),
    moveToList: vi.fn<TaskActions['moveToList']>(),
    moveToQuadrant: vi.fn<TaskActions['moveToQuadrant']>(),
    undo: vi.fn<TaskActions['undo']>(),
    redo: vi.fn<TaskActions['redo']>(),
  } satisfies TaskActions;
}

test('task feedback keeps rejection and no-op outcomes separate from successful history and notifications', () => {
  const failed = { status: 'failed', code: 'storage_full' } as const;
  const source = mockedActions();
  for (const command of Object.values(source)) {
    command.mockReturnValue(failed);
  }
  const accepted = vi.fn();
  const notify = vi.fn<TaskActionFeedback['notify']>();
  const actions = withTaskActionFeedback(source, { accepted, notify }, createTranslations('en').t);

  const operations = [
    () => actions.create('Task'),
    () => actions.createMany([{ input: 'Task' }]),
    () => actions.createSubtask('parent', 'Task'),
    () => actions.createInQuadrant('do', 'Task'),
    () => actions.update('task', { title: 'Title' }),
    () => actions.setDate('task', null),
    () => actions.setTime('task', '09:30'),
    () => actions.setRepeat('task', null),
    () => actions.toggle('task'),
    () => actions.trash('task'),
    () => actions.restore('task'),
    () => actions.purge(['task']),
    () => actions.duplicate('task', 'copy'),
    () => actions.reorder('task', 'target', 'after'),
    () => actions.schedule('task', { date: null }),
    () => actions.moveToList('task', 'list'),
    () => actions.moveToQuadrant('task', 'do'),
    () => actions.undo(),
    () => actions.redo(),
  ];

  for (const operation of operations) {
    expect(operation()).toBe(failed);
  }

  expect(accepted).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledTimes(operations.length);
  for (const [message, options] of notify.mock.calls) {
    expect(message).toContain('storage is full');
    expect(options?.undoable).toBeFalsy();
  }

  for (const command of Object.values(source)) {
    command.mockReturnValue({ status: 'unchanged' });
  }
  notify.mockClear();
  operations.forEach((operation) => operation());
  expect(accepted).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();

  const applied = { status: 'applied', value: 'copy-id' } as const;
  source.duplicate.mockReturnValue(applied);
  expect(actions.duplicate('task', 'copy')).toBe(applied);
  expect(accepted).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenNthCalledWith(1, 'Task duplicated.', { undoable: true });

  source.undo.mockReturnValue({ status: 'applied', value: undefined });
  actions.undo();
  expect(accepted).toHaveBeenCalledTimes(2);
  expect(notify).toHaveBeenNthCalledWith(2, 'Action undone', { undoable: false });
});

test('unknown task failures use an action error instead of suggesting a server connection problem', () => {
  const source = mockedActions();
  source.create
    .mockReturnValueOnce({ status: 'failed', code: 'unexpected_failure' })
    .mockReturnValueOnce({ status: 'failed', code: 'invalid_task' });
  const accepted = vi.fn();
  const notify = vi.fn<TaskActionFeedback['notify']>();
  const actions = withTaskActionFeedback(source, { accepted, notify }, createTranslations('en').t);
  actions.create('Task');
  expect(notify).toHaveBeenCalledExactlyOnceWith('Could not save changes.');

  actions.create('Task');
  expect(notify).toHaveBeenNthCalledWith(2, 'The change is invalid. Check the values you entered.');
  expect(accepted).not.toHaveBeenCalled();
});
