import { randomBytes, randomUUID } from 'node:crypto';
import type { Store } from '../storage.ts';

export function instanceConfiguration(store: Store) {
  store.raw.exec(`
    CREATE TABLE IF NOT EXISTS instance_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      serverId TEXT NOT NULL,
      secret TEXT NOT NULL
    )
  `);
  store
    .prepare('INSERT OR IGNORE INTO instance_config VALUES(1,?,?)')
    .run(randomUUID(), randomBytes(48).toString('base64url'));

  return store
    .prepare<{ serverId: string; secret: string }>(
      'SELECT serverId,secret FROM instance_config WHERE id=1',
    )
    .get();
}
