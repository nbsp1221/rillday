import {
  AccountError,
  assertAccountCapacity,
  assertAdministrator,
  assertSetupAvailable,
  assertStatusChangeAllowed,
  maximumAccounts,
} from '../domain/policies.ts';
import type {
  AccountAccess,
  AccountInput,
  AccountRegistration,
  AccountRepository,
} from './ports.ts';

export class AccountService {
  private setupBusy = false;
  private readonly repository: AccountRepository;
  private readonly registration: AccountRegistration;

  constructor(repository: AccountRepository, registration: AccountRegistration) {
    this.repository = repository;
    this.registration = registration;
  }

  configuration() {
    return {
      setupRequired: !this.repository.hasAdministrator(),
      registration: 'administrator',
      maxAccounts: maximumAccounts,
    };
  }

  async setup(input: AccountInput) {
    assertSetupAvailable(this.repository.hasAdministrator());
    if (this.setupBusy) {
      throw new AccountError('setup_complete');
    }

    this.setupBusy = true;
    try {
      return await this.registration.create(input, 'admin');
    } catch (error) {
      // Another process may have won the DB's unique administrator constraint.
      assertSetupAvailable(this.repository.hasAdministrator());
      throw error;
    } finally {
      this.setupBusy = false;
    }
  }

  async current(access: AccountAccess) {
    const session = await this.session(access);
    const { id, email, name, role } = session.user;
    return { user: { id, email, name, role }, expiresAt: session.expiresAt };
  }

  async list(access: AccountAccess) {
    await this.administrator(access);
    return { users: this.repository.list() };
  }

  async create(access: AccountAccess, input: AccountInput) {
    await this.administrator(access);
    assertAccountCapacity(this.repository.count());

    try {
      return await this.registration.create(input, 'user');
    } catch (error) {
      // The DB remains the arbiter when concurrent registrations fill the instance.
      assertAccountCapacity(this.repository.count());
      throw error;
    }
  }

  async setDisabled(access: AccountAccess, id: string, disabled: boolean) {
    await this.administrator(access);
    const target = this.repository.find(id);
    assertStatusChangeAllowed(target);

    await access.setDisabled(target.id, disabled);
    return { ok: true };
  }

  private async session(access: AccountAccess) {
    const session = await access.session();
    if (!session) {
      throw new AccountError('unauthenticated');
    }
    return session;
  }

  private async administrator(access: AccountAccess) {
    const session = await this.session(access);
    assertAdministrator(session.user.role);
  }
}
