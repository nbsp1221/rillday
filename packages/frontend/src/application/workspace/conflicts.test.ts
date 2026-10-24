import { createTask, createWorkspace, taskData } from '@repo/domain';
import { expect, test } from 'vitest';
import { workspaceDecisions } from './conflicts.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('ordering alternatives use task neighbors and preserve every choice without fabricated provenance', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const task = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Review', { rank: 'a0' }),
    context,
  );
  createTask(workspace, context.newId(), taskData(listId, 'Plan', { rank: 'a1' }), context);
  createTask(workspace, context.newId(), taskData(listId, 'Read', { rank: 'a2' }), context);
  const middle = structuredClone(workspace);
  middle.tasks[task.id].rank = 'a1V';
  const last = structuredClone(workspace);
  last.tasks[task.id].rank = 'a3';
  const [issue] = workspaceDecisions([
    {
      id: 'decision',
      code: 'edit_conflict',
      targets: [{ collection: 'tasks', id: task.id }],
      choices: [
        { id: 'first', workspace },
        { id: 'middle', workspace: middle },
        { id: 'last', workspace: last },
      ],
    },
  ]);
  expect(issue.choices.map((choice) => choice.id)).toEqual(['first', 'middle', 'last']);
  const descriptions = issue.choices.map((choice) => JSON.stringify(choice.description));
  expect(new Set(descriptions).size).toBe(3);
  expect(descriptions.join()).toContain('Plan');
  expect(descriptions.join()).toContain('Read');
  expect(descriptions.join()).not.toContain('a1V');
  expect(descriptions.join()).not.toContain(task.id);
});

test('a single valid alternative remains an explicit nonempty confirmation', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const task = createTask(workspace, context.newId(), taskData(listId, 'Retained task'), context);
  const [issue] = workspaceDecisions([
    {
      id: 'decision',
      code: 'edit_conflict',
      targets: [{ collection: 'tasks', id: task.id }],
      choices: [{ id: 'keep', workspace }],
    },
  ]);
  expect(issue.choices).toHaveLength(1);
  expect(issue.choices[0].description).toMatchObject({
    type: 'fields',
    fields: { title: { type: 'literal', value: 'Retained task' } },
  });
});

test.each(['Import backup', 'Inbox', 'weekly', '{{count}} $t(Save)'])(
  'authored conflict titles remain literal text: %s',
  (title) => {
    const workspace = createWorkspace(context);
    const task = createTask(
      workspace,
      context.newId(),
      taskData(Object.keys(workspace.lists)[0], title),
      context,
    );
    const [issue] = workspaceDecisions([
      {
        id: 'choice',
        code: 'edit_conflict',
        targets: [{ collection: 'tasks', id: task.id }],
        choices: [{ id: 'keep', workspace }],
      },
    ]);
    expect(issue.title).toBe(title);
  },
);

test('system Inbox and unnamed quadrants retain their translation identity while custom names remain literal', () => {
  const workspace = createWorkspace(context);
  const inbox = Object.values(workspace.lists)[0];
  const quadrant = Object.values(workspace.quadrants)[0];
  const custom = structuredClone(workspace);
  custom.lists[inbox.id].system = null;
  custom.quadrants[quadrant.id].name = 'Important and urgent';
  const titles = [workspace, custom].flatMap((state) =>
    [
      { collection: 'lists' as const, id: inbox.id },
      { collection: 'quadrants' as const, id: quadrant.id },
    ].map(
      (target) =>
        workspaceDecisions([
          {
            id: 'choice',
            code: 'edit_conflict',
            targets: [target],
            choices: [{ id: 'keep', workspace: state }],
          },
        ])[0].title,
    ),
  );
  expect(titles).toEqual([
    { system: 'inbox' },
    { system: 'quadrant', value: 'do' },
    'Inbox',
    'Important and urgent',
  ]);
});
