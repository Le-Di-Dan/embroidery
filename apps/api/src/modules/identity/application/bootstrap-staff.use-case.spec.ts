import { persistenceError } from '@embroidery/database';

import {
  BootstrapError,
  BootstrapStaffUseCase,
  type EnsureBootstrapOutcome,
} from './bootstrap-staff.use-case';
import type { AdminAccount } from '../domain/repositories/admin-account.repository';

/**
 * Unit coverage for the idempotent `ensure` bootstrap path (A01-FU03): the
 * create / reuse / mismatch / inactive outcomes, that reuse never rotates or
 * re-hashes, and that the password is validated. Persistence and hashing are
 * mocked; conflict classification uses the real `PersistenceError` type.
 */
const VALID = {
  email: 'admin@example.test',
  password: 'correct horse battery',
  displayName: 'Operator',
};

function activeAccount(id: string, email: string): AdminAccount {
  return {
    id: id as AdminAccount['id'],
    email,
    displayName: 'Operator',
    status: 'ACTIVE',
    lockedAt: undefined,
    disabledAt: undefined,
    replacedByAdminAccountId: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeUseCase() {
  const accounts = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    attachCredential: jest.fn(),
    rotateCredential: jest.fn(),
  };
  const sessions = { revokeAllForAdmin: jest.fn() };
  const hasher = { hash: jest.fn().mockResolvedValue('scrypt$ref') };
  const transactions = {
    runInTransaction: jest.fn(async (work: () => Promise<unknown>) => work()),
  };
  const audit = { credentialBootstrapped: jest.fn() };
  const config = { passwordMinLength: 12 };
  const useCase = new BootstrapStaffUseCase(
    accounts as never,
    sessions as never,
    hasher as never,
    transactions as never,
    audit as never,
    config as never,
  );
  return { useCase, accounts, hasher, audit, transactions };
}

describe('BootstrapStaffUseCase.ensure', () => {
  it('creates a new admin when none exists', async () => {
    const { useCase, accounts, hasher, audit } = makeUseCase();
    accounts.findByEmail.mockResolvedValue(undefined);

    const result = await useCase.ensure(VALID);

    expect(result.outcome).toBe<EnsureBootstrapOutcome>('created');
    expect(result.adminId).toBeDefined();
    expect(accounts.create).toHaveBeenCalledTimes(1);
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    expect(audit.credentialBootstrapped).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing active admin without creating, hashing or rotating', async () => {
    const { useCase, accounts, hasher } = makeUseCase();
    accounts.findByEmail.mockResolvedValue(activeAccount('a1', VALID.email));

    const result = await useCase.ensure(VALID);

    expect(result).toEqual({ outcome: 'reused', adminId: 'a1' });
    expect(accounts.create).not.toHaveBeenCalled();
    expect(accounts.rotateCredential).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('reports inactive for a LOCKED/DISABLED matching admin, never reactivating', async () => {
    const { useCase, accounts } = makeUseCase();
    accounts.findByEmail.mockResolvedValue({
      ...activeAccount('a2', VALID.email),
      status: 'LOCKED',
    });

    const result = await useCase.ensure(VALID);

    expect(result).toEqual({ outcome: 'inactive', adminId: 'a2' });
    expect(accounts.create).not.toHaveBeenCalled();
  });

  it('reports mismatch when a different active admin holds the single slot', async () => {
    const { useCase, accounts } = makeUseCase();
    accounts.findByEmail.mockResolvedValue(undefined);
    accounts.create.mockRejectedValue(
      persistenceError({ kind: 'CONFLICT', code: 'ADMIN_ACCOUNT_ALREADY_ACTIVE', message: 'x' }),
    );

    const result = await useCase.ensure(VALID);

    expect(result).toEqual({ outcome: 'mismatch', adminId: undefined });
  });

  it('reuses on a duplicate-email race that resolves to an active admin', async () => {
    const { useCase, accounts } = makeUseCase();
    accounts.findByEmail
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(activeAccount('a3', VALID.email));
    accounts.create.mockRejectedValue(
      persistenceError({ kind: 'CONFLICT', code: 'DUPLICATE_ADMIN_EMAIL', message: 'x' }),
    );

    const result = await useCase.ensure(VALID);

    expect(result).toEqual({ outcome: 'reused', adminId: 'a3' });
  });

  it('rejects a password shorter than the policy minimum', async () => {
    const { useCase, accounts } = makeUseCase();
    accounts.findByEmail.mockResolvedValue(undefined);

    await expect(useCase.ensure({ ...VALID, password: 'short' })).rejects.toBeInstanceOf(
      BootstrapError,
    );
    expect(accounts.create).not.toHaveBeenCalled();
  });
});
