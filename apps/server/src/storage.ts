import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase } from './initialize-database.ts';

export class Store {
  readonly raw: Database.Database;

  constructor(file: string) {
    if (file !== ':memory:') {
      mkdirSync(dirname(file), { recursive: true });
    }
    this.raw = new Database(file, { timeout: 2000 });
    try {
      this.raw.pragma('foreign_keys=ON');
      this.raw.pragma('journal_mode=WAL');
      this.raw.pragma('synchronous=FULL');
    } catch (error) {
      this.raw.close();
      throw error;
    }
  }

  prepare<Row extends object = Record<string, unknown>>(
    sql: string,
  ): Database.Statement<unknown[], Row> {
    return this.raw.prepare(sql);
  }

  initialize() {
    initializeDatabase(this.raw);
  }

  close() {
    if (this.raw.open) {
      this.raw.close();
    }
  }
}
