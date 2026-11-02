import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import type { WorkspaceData } from '@repo/frontend/application';
import { v5 } from 'uuid';
import { readBrowserStore } from './indexed-db';
import { archiveFixture, readArchive } from './workspace-archive';

export const fixtureId = (id: string) => v5('rillday-test:' + id, v5.URL);

function isDemo(page: Page) {
  return new URL(page.url()).searchParams.get('demo') === '1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function storedPreferences(page: Page) {
  const preferences = await readBrowserStore(
    page,
    isDemo(page) ? 'rillday-demo-workspaces' : 'rillday-workspaces',
    'metadata',
    'preferences',
  );
  assert(isRecord(preferences), 'Expected stored preferences');
  return preferences;
}

export async function storedRegistry(page: Page, demo = isDemo(page)) {
  const registry = await readBrowserStore(
    page,
    demo ? 'rillday-demo-workspaces' : 'rillday-workspaces',
    'metadata',
    'profiles',
  );
  assert(isRecord(registry), 'Expected a stored workspace registry');
  assert.equal(typeof registry.activeId, 'string');
  assert(Array.isArray(registry.accounts), 'Expected workspace profiles');
  const accounts: unknown[] = registry.accounts;
  const profiles = accounts.map((account) => {
    assert(isRecord(account) && typeof account.id === 'string', 'Invalid workspace profile');
    assert(typeof account.contentId === 'string', 'Missing workspace document');
    assert(account.server === undefined || isRecord(account.server), 'Invalid server profile');
    return { id: account.id, contentId: account.contentId, server: account.server !== undefined };
  });
  const activeId = registry.activeId;
  assert(typeof activeId === 'string' && profiles.some((profile) => profile.id === activeId));
  return { activeId, accounts: profiles };
}

export async function storedWorkspace(page: Page): Promise<WorkspaceData> {
  await page.locator('.rillday-app').waitFor();
  const registry = await storedRegistry(page);
  const profile = registry.accounts.find((account) => account.id === registry.activeId);
  assert(profile, 'Active workspace profile is missing');
  const stored = await readBrowserStore(
    page,
    isDemo(page) ? 'rillday-demo-documents' : 'rillday-documents',
    'documents',
    [profile.contentId, 'workspace'],
  );
  assert(isRecord(stored) && typeof stored.document === 'string', 'Missing saved workspace');
  const source = JSON.stringify({
    format: 'rillday-workspace',
    version: 1,
    document: stored.document,
  });
  const data = await readArchive(
    source,
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  data.tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.order - b.order);
  return data;
}

export async function seedWorkspace(page: Page, input: WorkspaceData) {
  const data = structuredClone(input);

  const map = (id: string) =>
    id === 'inbox' ? id : /^[0-9a-f-]{36}$/i.test(id) ? id : fixtureId(id);

  for (const list of data.lists) {
    list.id = map(list.id);
  }
  for (const task of data.tasks) {
    task.id = map(task.id);
    task.listId = map(task.listId);
    task.parentId = task.parentId ? map(task.parentId) : null;
    if (task.generatedFromId) {
      task.generatedFromId = map(task.generatedFromId);
    }
  }
  for (const h of data.habits) {
    h.id = map(h.id);
  }
  for (const log of data.habitLogs) {
    log.habitId = map(log.habitId);
  }
  await seedArchive(page, await archiveFixture(data));
}

export async function seedArchive(page: Page, source: string) {
  const registry = await storedRegistry(page);
  const profile = registry.accounts.find((account) => account.id === registry.activeId);
  assert(
    profile && !profile.server && !isDemo(page),
    'Seeding requires a non-demo guest workspace',
  );
  const archive: unknown = JSON.parse(source);
  assert(
    isRecord(archive) && typeof archive.document === 'string',
    'Expected a workspace document archive',
  );
  await page.evaluate(
    async ({ encoded, id }) => {
      const binary = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      let failed = false;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('rillday-documents');

        const fail = (reason: string, cause?: unknown) => {
          failed = true;
          reject(new Error(`Cannot seed guest ${id}: ${reason}`, { cause }));
        };

        r.onupgradeneeded = () => {
          r.transaction?.abort();
          fail('workspace database does not exist');
        };
        r.onerror = () => fail('database open failed', r.error);
        r.onblocked = () => fail('database open blocked');
        r.onsuccess = () => {
          if (failed) {
            r.result.close();
          } else {
            resolve(r.result);
          }
        };
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('documents', 'readwrite');
          const key = [id, 'workspace'];
          tx.objectStore('documents').put({ key, binary }, key);
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () =>
            reject(new Error(`Cannot seed guest ${id}: write aborted`, { cause: tx.error }));
        });
      } finally {
        db.close();
      }
    },
    { encoded: archive.document, id: profile.contentId },
  );
}
