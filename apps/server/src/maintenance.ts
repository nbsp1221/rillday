import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { resetAccountPassword } from './modules/accounts/index.ts';
import { restoreDatabase } from './recovery.ts';

export { resetAccountPassword as resetPassword };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [action, ...args] = process.argv.slice(2);
  const file = resolve(
    process.env.RILLDAY_DB ??
      resolve(import.meta.dirname, '../../../../data/rillday-server/data.sqlite'),
  );
  if (action === 'backup' && args.length === 1) {
    const target = resolve(args[0]);
    if (existsSync(target)) {
      throw new Error('Backup destination must be a new file');
    }
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      await db.backup(target);
    } finally {
      db.close();
    }
    console.log('Backup saved.');
  } else if (action === 'restore' && args.length === 2) {
    await restoreDatabase(args[0], args[1]);
    console.log('Restored to a new database.');
  } else if (action === 'reset-password' && args.length === 1) {
    if (process.stdin.isTTY) {
      throw new Error('Pipe the new password on stdin. Do not put passwords in command arguments.');
    }
    let password = '';
    for await (const part of process.stdin) {
      password += String(part);
      if (password.length > 512) {
        throw new Error('Password input is too long');
      }
    }
    await resetAccountPassword(file, args[0], password.replace(/\r?\n$/, ''));
    console.log('Password changed; all account sessions revoked.');
  } else {
    throw new Error(
      'Usage: maintenance.ts backup DEST | restore SOURCE NEW_DEST | reset-password EMAIL (password on stdin)',
    );
  }
}
