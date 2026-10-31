import type Database from 'better-sqlite3';
import type { Store } from '../../../storage.ts';
import type {
  AccountRepository,
  AccountSummary,
  PasswordRecoveryRepository,
} from '../application/ports.ts';

export function findSessionToken(store: Store, owner: string, sessionId: string) {
  return store
    .prepare<{ token: string }>('SELECT token FROM session WHERE id=? AND userId=?')
    .get(sessionId, owner)?.token;
}

export class SqliteAccountRepository implements AccountRepository {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  hasAdministrator() {
    return Boolean(this.store.prepare("SELECT 1 FROM user WHERE role='admin' LIMIT 1").get());
  }

  count() {
    const row = this.store.prepare<{ count: number }>('SELECT count(*) count FROM user').get();
    if (!row) {
      throw new Error('Account count query returned no result');
    }
    return row.count;
  }

  list() {
    return this.store
      .prepare<AccountSummary>('SELECT id,email,name,role,banned FROM user ORDER BY createdAt,id')
      .all();
  }

  find(id: string) {
    return this.store
      .prepare<{ id: string; role: string }>('SELECT id,role FROM user WHERE id=?')
      .get(id);
  }
}

export class SqlitePasswordRecoveryRepository implements PasswordRecoveryRepository {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  findByEmail(email: string) {
    return this.database
      .prepare<[string], { id: string }>('SELECT id FROM user WHERE lower(email)=lower(?)')
      .get(email);
  }

  replaceCredentialAndRevokeSessions(userId: string, digest: string) {
    this.database
      .transaction(() => {
        const changed = this.database
          .prepare("UPDATE account SET password=? WHERE userId=? AND providerId='credential'")
          .run(digest, userId);
        if (changed.changes !== 1) {
          throw new Error('Password account not found');
        }

        this.database.prepare('DELETE FROM session WHERE userId=?').run(userId);
      })
      .immediate();
  }
}
