import { expect, test } from 'vitest';
import { BrowserWorkspaceRepository } from '../../src/adapters/browser/browser.ts';

const preferenceTest = test.extend('repositories', async ({ onTestFinished }) => {
  const first = new BrowserWorkspaceRepository();
  const second = new BrowserWorkspaceRepository();
  onTestFinished(async () => {
    await Promise.all([first.close(), second.close()]);
  });
  await first.savePreferences({ language: 'ko', theme: 'dark', density: 'compact', taskViews: {} });
  return { first, second };
});

preferenceTest(
  'independent preference transactions preserve disjoint changes and existing fields',
  async ({ repositories }) => {
    const { first, second } = repositories;
    await Promise.all([
      first.savePreferences({ language: 'en' }),
      second.savePreferences({ theme: 'light' }),
    ]);
    await expect(first.loadPreferences()).resolves.toMatchObject({
      language: 'en',
      theme: 'light',
      density: 'compact',
    });
  },
);

preferenceTest(
  'task view scopes merge atomically while later edits to the same field win',
  async ({ repositories }) => {
    const { first, second } = repositories;
    await Promise.all([
      first.savePreferences({ taskViews: { 'list:inbox': { sort: 'priority', group: 'none' } } }),
      second.savePreferences({ taskViews: { today: { sort: 'manual', group: 'date' } } }),
    ]);
    await first.savePreferences({ language: 'en' });
    await second.savePreferences({ language: 'ko' });
    await expect(first.loadPreferences()).resolves.toMatchObject({
      language: 'ko',
      taskViews: {
        'list:inbox': { sort: 'priority', group: 'none' },
        'today': { sort: 'manual', group: 'date' },
      },
    });
  },
);
