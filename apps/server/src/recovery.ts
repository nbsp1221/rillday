import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

// Restore to a new file. Never replace an application's open database.
export async function restoreDatabase(backup: string, destination: string) {
  const source = resolve(backup);
  const target = resolve(destination);
  if (source === target || existsSync(target)) {
    throw new Error('Restore destination must be a new file');
  }
  mkdirSync(dirname(target), { recursive: true });
  const input = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (
      JSON.stringify(input.pragma('integrity_check')) !==
      JSON.stringify([{ integrity_check: 'ok' }])
    ) {
      throw new Error('Invalid backup');
    }
    await input.backup(target);
  } finally {
    input.close();
  }
  const output = new Database(target);
  try {
    output.pragma('foreign_keys=ON');
    output
      .transaction(() => {
        const references: unknown = output.pragma('foreign_key_check');
        if (!Array.isArray(references) || references.length) {
          throw new Error('Invalid backup references');
        }
      })
      .immediate();
  } finally {
    output.close();
  }
  return target;
}
