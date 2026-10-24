import { resolve } from 'node:path';
import { ApiClient, freePort, removeOwned, setupAdministrator, tempDir } from '@repo/test-support';
import { expect } from 'vitest';
import { restoreDatabase } from '../src/recovery.ts';
import { createServer } from '../src/server.ts';
import { Store } from '../src/storage.ts';
import { documentFixture } from './support/document.ts';
import { test } from './support/server-fixture.ts';

test('SQLite online backup restores native document bytes, account sessions and integrity into an isolated server', async ({
  server,
  onTestFinished,
}) => {
  const directory = tempDir('native-backup-');
  onTestFinished(() => removeOwned(directory));
  const account = await setupAdministrator(server.origin);
  const original = documentFixture({
    title: 'Backup point',
    schedule: { date: '2026-10-19', time: '09:00', zone: 'Asia/Seoul' },
  });
  expect(
    (await account.request('/v1/connection', { documentId: original.documentId })).status,
  ).toBe(200);
  server.store
    .prepare('UPDATE workspace_documents SET data=? WHERE owner=?')
    .run(original.binary, account.owner);
  const backup = resolve(directory, 'backup.sqlite');
  await server.store.raw.backup(backup);
  const later = documentFixture({ title: 'After backup' });
  server.store
    .prepare('UPDATE workspace_documents SET data=? WHERE owner=?')
    .run(later.binary, account.owner);

  const destination = resolve(directory, 'restored.sqlite');
  await restoreDatabase(backup, destination);
  await expect(restoreDatabase(backup, backup)).rejects.toThrow(
    'Restore destination must be a new file',
  );
  await expect(restoreDatabase(backup, destination)).rejects.toThrow(
    'Restore destination must be a new file',
  );
  const copy = new Store(destination);
  try {
    copy.initialize();
    const record = copy
      .prepare<{ documentId: string; data: Uint8Array }>(
        'SELECT documentId,data FROM workspace_documents WHERE owner=?',
      )
      .get(account.owner);
    expect(record?.documentId).toBe(original.documentId);
    expect(record?.data).toEqual(Buffer.from(original.binary));
    expect(copy.prepare<{ n: number }>('SELECT count(*) n FROM session').get()?.n).toBe(1);
    expect(copy.raw.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(copy.raw.pragma('foreign_key_check')).toEqual([]);
  } finally {
    copy.close();
  }
  const restored = await createServer({ file: destination, port: await freePort(), logger: false });
  onTestFinished(() => restored.close());
  const recovered = new ApiClient(restored.origin, account.token);
  expect((await recovered.request('/v1/account')).body).toHaveProperty('user.id', account.owner);
  expect((await recovered.request('/v1/connection')).body).toEqual({
    documentId: original.documentId,
  });
});
