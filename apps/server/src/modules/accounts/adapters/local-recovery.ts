import { hashPassword } from 'better-auth/crypto';
import Database from 'better-sqlite3';
import { recoverAccountPassword } from '../application/recover-password.ts';
import { validateRecoveryPassword } from '../domain/policies.ts';
import { SqlitePasswordRecoveryRepository } from './sqlite.ts';

export async function resetAccountPassword(file: string, email: string, password: string) {
  // Reject malformed input before opening the requested database file.
  validateRecoveryPassword(password);
  const database = new Database(file, { fileMustExist: true });
  try {
    database.pragma('foreign_keys=ON');
    await recoverAccountPassword(
      new SqlitePasswordRecoveryRepository(database),
      hashPassword,
      email,
      password,
    );
  } finally {
    database.close();
  }
}
