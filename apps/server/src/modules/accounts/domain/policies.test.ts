import { describe, expect, test } from 'vitest';
import {
  assertAccountCapacity,
  assertAdministrator,
  assertSetupAvailable,
  assertStatusChangeAllowed,
  normalizeAccountName,
  validateRecoveryPassword,
} from './policies.ts';

describe('account domain policies', () => {
  test('names retain their content while whitespace-only names are refused', () => {
    expect(normalizeAccountName('  Admin  ')).toBe('Admin');
    expect(normalizeAccountName('  Alex Example  ')).toBe('Alex Example');
    expect(normalizeAccountName(' \t\n ')).toBeUndefined();
  });

  test('setup is available only before an administrator exists', () => {
    expect(() => assertSetupAvailable(false)).not.toThrow();
    expect(() => assertSetupAvailable(true)).toThrow(
      expect.objectContaining({ code: 'setup_complete' }),
    );
  });

  test.each(['user', '', null, undefined])('role %s cannot administer accounts', (role) => {
    expect(() => assertAdministrator(role)).toThrow(
      expect.objectContaining({ code: 'administrator_required' }),
    );
  });

  test('administrators may administer accounts', () => {
    expect(() => assertAdministrator('admin')).not.toThrow();
  });

  test.each([0, 1, 9])('creation is allowed with %i existing accounts', (count) => {
    expect(() => assertAccountCapacity(count)).not.toThrow();
  });

  test.each([10, 11])('creation is refused with %i existing accounts', (count) => {
    expect(() => assertAccountCapacity(count)).toThrow(
      expect.objectContaining({ code: 'account_capacity' }),
    );
  });

  test('status changes require an existing ordinary account', () => {
    expect(() => assertStatusChangeAllowed(undefined)).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => assertStatusChangeAllowed({ role: 'admin' })).toThrow(
      expect.objectContaining({ code: 'administrator_protected' }),
    );
    expect(() => assertStatusChangeAllowed({ role: 'user' })).not.toThrow();
  });

  test.each([0, 11, 129])('recovery refuses password length %i', (length) => {
    expect(() => validateRecoveryPassword('x'.repeat(length))).toThrow(
      'Password must contain 12–128 characters',
    );
  });

  test.each([12, 128])('recovery accepts password length %i', (length) => {
    expect(() => validateRecoveryPassword('x'.repeat(length))).not.toThrow();
  });
});
