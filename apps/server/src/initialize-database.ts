import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';

const tables = readFileSync(new URL('./schema/tables.sql', import.meta.url), 'utf8');
const constraints = readFileSync(
  new URL('./schema/account-constraints.sql', import.meta.url),
  'utf8',
);

export function initializeAccountConstraints(database: Database.Database) {
  database.exec(constraints);
}

export function initializeDatabase(database: Database.Database) {
  database.exec(tables);
  initializeAccountConstraints(database);
}
