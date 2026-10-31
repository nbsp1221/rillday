export const maximumAccounts = 10;
export const minimumPasswordLength = 12;
export const maximumPasswordLength = 128;

export type AccountErrorCode =
  | 'setup_complete'
  | 'unauthenticated'
  | 'administrator_required'
  | 'account_capacity'
  | 'not_found'
  | 'administrator_protected';

export class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode) {
    super(code);
    this.name = 'AccountError';
    this.code = code;
  }
}

export function assertSetupAvailable(hasAdministrator: boolean) {
  if (hasAdministrator) {
    throw new AccountError('setup_complete');
  }
}

export function assertAdministrator(role: string | null | undefined) {
  if (role !== 'admin') {
    throw new AccountError('administrator_required');
  }
}

export function assertAccountCapacity(count: number) {
  if (count >= maximumAccounts) {
    throw new AccountError('account_capacity');
  }
}

export function assertStatusChangeAllowed(
  target: { role: string } | undefined,
): asserts target is { role: string } {
  if (!target) {
    throw new AccountError('not_found');
  }
  if (target.role === 'admin') {
    throw new AccountError('administrator_protected');
  }
}

export function validateRecoveryPassword(password: string) {
  if (password.length < minimumPasswordLength || password.length > maximumPasswordLength) {
    throw new Error(
      `Password must contain ${minimumPasswordLength}–${maximumPasswordLength} characters`,
    );
  }
}
