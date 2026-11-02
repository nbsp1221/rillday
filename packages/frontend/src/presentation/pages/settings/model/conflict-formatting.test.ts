import { createTask, createWorkspace, taskData } from '@repo/domain';
import { expect, test } from 'vitest';
import { workspaceDecisions } from '../../../../application/workspace/conflicts.ts';
import { createTranslations } from '../../../shared/i18n/translations.ts';
import { formatChange } from './conflict-formatting.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('conflict text identifies label alternatives using authored names', () => {
  const first = createWorkspace(context);
  const listId = Object.keys(first.lists)[0];
  expect.assert(listId !== undefined);
  const task = createTask(first, context.newId(), taskData(listId, 'Read'), context);
  first.labels.research = { id: 'research', name: 'Research', color: null, rank: 'a0' };
  first.labels.personal = { id: 'personal', name: 'Personal', color: null, rank: 'a1' };
  task.labelIds = ['research'];
  const second = structuredClone(first);

  const task1 = second.tasks[task.id];
  expect.assert(task1 !== undefined);
  task1.labelIds = ['personal'];
  const [issue] = workspaceDecisions([
    {
      id: 'labels',
      code: 'edit_conflict',
      targets: [{ collection: 'tasks', id: task.id }],
      choices: [
        { id: 'one', workspace: first },
        { id: 'two', workspace: second },
      ],
    },
  ]);
  const { t } = createTranslations('en');
  expect.assert(issue !== undefined);
  expect(issue.choices.map((choice) => formatChange(choice.description, t, []))).toEqual([
    'Labels: Research',
    'Labels: Personal',
  ]);
});

test('conflict text distinguishes matrix view alternatives', () => {
  const simple = createWorkspace(context);
  simple.matrixMode = 'simple';
  const complex = structuredClone(simple);
  complex.matrixMode = 'complex';
  const [issue] = workspaceDecisions([
    {
      id: 'matrix',
      code: 'edit_conflict',
      targets: [{ collection: 'workspace', id: 'matrixMode' }],
      choices: [
        { id: 'one', workspace: simple },
        { id: 'two', workspace: complex },
      ],
    },
  ]);
  const { t } = createTranslations('en');
  expect.assert(issue !== undefined);
  expect(issue.choices.map((choice) => formatChange(choice.description, t, []))).toEqual([
    'Matrix view: Simple',
    'Matrix view: Advanced',
  ]);
});
