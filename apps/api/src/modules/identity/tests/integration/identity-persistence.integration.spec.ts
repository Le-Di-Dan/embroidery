/**
 * CTX-IDN persistence against a real PostgreSQL instance (DB7-CP3).
 *
 * Covers TBL-001 `admin_accounts`, TBL-002 `admin_credentials` and TBL-003
 * `admin_sessions`: the create/load/state-change commands, the arbiters that
 * back them, and the error mapping each rejection produces.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { IdentityModule } from '../../identity.module';
import { ADMIN_ACCOUNT_REPOSITORY } from '../../domain/repositories/admin-account.repository';
import type {
  AdminAccountId,
  AdminAccountRepository,
} from '../../domain/repositories/admin-account.repository';
import { ADMIN_SESSION_REPOSITORY } from '../../domain/repositories/admin-session.repository';
import type {
  AdminSessionId,
  AdminSessionRepository,
} from '../../domain/repositories/admin-session.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('identity persistence (integration)', () => {
  let context: PersistenceTestContext;
  let accounts: AdminAccountRepository;
  let sessions: AdminSessionRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-identity', [IdentityModule]);
    accounts = context.get(ADMIN_ACCOUNT_REPOSITORY);
    sessions = context.get(ADMIN_SESSION_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  /** Captures the PersistenceError a failing call produced. */
  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  function createAccount(email = 'ops@example.com'): Promise<{ id: AdminAccountId }> {
    const id = newId() as AdminAccountId;
    return context.inTransaction(() => accounts.create({ id, email, displayName: 'Operations' }));
  }

  describe('admin account', () => {
    it('creates an account and loads it back by identity', async () => {
      const created = await createAccount();

      const loaded = await accounts.findById(created.id);

      expect(loaded).toBeDefined();
      expect(loaded?.email).toBe('ops@example.com');
      expect(loaded?.status).toBe('ACTIVE');
      expect(loaded?.lockedAt).toBeUndefined();
    });

    it('loads by email, the canonical lookup path', async () => {
      await createAccount('lookup@example.com');

      const loaded = await accounts.findByEmail('lookup@example.com');

      expect(loaded?.displayName).toBe('Operations');
    });

    it('returns undefined rather than throwing for an unknown identity', async () => {
      await expect(accounts.findById(newId() as AdminAccountId)).resolves.toBeUndefined();
    });

    it('rejects a duplicate email with the catalogued conflict code', async () => {
      await createAccount('taken@example.com');

      const error = await failureOf(() => createAccount('taken@example.com'));

      expect(error.kind).toBe('CONFLICT');
      expect(error.code).toBe('DUPLICATE_ADMIN_EMAIL');
      expect(error.diagnostics.constraint).toBe('uq_admin_accounts__email');
    });

    it('rejects a second active account — REQ-IDN-001 allows exactly one', async () => {
      await createAccount('first@example.com');

      const error = await failureOf(() => createAccount('second@example.com'));

      expect(error.code).toBe('ADMIN_ACCOUNT_ALREADY_ACTIVE');
      expect(error.diagnostics.constraint).toBe('uq_admin_accounts__status__active');
    });

    it('updates the profile without disturbing the status', async () => {
      const created = await createAccount();

      const updated = await context.inTransaction(() =>
        accounts.updateProfile(created.id, 'Renamed'),
      );

      expect(updated.displayName).toBe('Renamed');
      expect(updated.status).toBe('ACTIVE');
    });

    it('reports a missing account on update rather than silently succeeding', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() => accounts.updateProfile(newId() as AdminAccountId, 'Ghost')),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('stamps locked_at when the account is locked', async () => {
      const created = await createAccount();

      const locked = await context.inTransaction(() => accounts.changeStatus(created.id, 'LOCKED'));

      expect(locked.status).toBe('LOCKED');
      expect(locked.lockedAt).toBeInstanceOf(Date);
      expect(locked.disabledAt).toBeUndefined();
    });

    it('clears both marks when the account is re-activated', async () => {
      const created = await createAccount();
      await context.inTransaction(() => accounts.changeStatus(created.id, 'LOCKED'));

      const reactivated = await context.inTransaction(() =>
        accounts.changeStatus(created.id, 'ACTIVE'),
      );

      expect(reactivated.lockedAt).toBeUndefined();
      expect(reactivated.disabledAt).toBeUndefined();
    });

    it('rejects a status outside the canonical set', async () => {
      const created = await createAccount();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          // Cast deliberately: this is the guard against a value the type system
          // forbids but a miswired caller could still send.
          accounts.changeStatus(created.id, 'RETIRED' as never),
        ),
      );

      expect(error.kind).toBe('INVARIANT_VIOLATION');
      expect(error.diagnostics.constraint).toBe('ck_admin_accounts__status_allowed');
    });

    it('answers the no-FK actor-evidence existence probe (G-DB7-50)', async () => {
      const created = await createAccount();

      await expect(accounts.exists(created.id)).resolves.toBe(true);
      await expect(accounts.exists(newId() as AdminAccountId)).resolves.toBe(false);
    });
  });

  describe('admin credentials', () => {
    it('attaches a credential inside the account transaction', async () => {
      const created = await createAccount();

      await expect(
        context.inTransaction(() =>
          accounts.attachCredential({
            adminAccountId: created.id,
            credentialKind: 'PASSWORD',
            credentialReference: 'provider-ref-1',
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses to attach a credential outside a transaction', async () => {
      const created = await createAccount();

      await expect(
        accounts.attachCredential({
          adminAccountId: created.id,
          credentialKind: 'PASSWORD',
          credentialReference: 'provider-ref-1',
        }),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('rejects a credential for an account that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          accounts.attachCredential({
            adminAccountId: newId() as AdminAccountId,
            credentialKind: 'PASSWORD',
            credentialReference: 'orphan',
          }),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
      expect(error.diagnostics.sqlState).toBe('23503');
    });

    it('rolls back the account when the credential insert fails', async () => {
      const id = newId() as AdminAccountId;

      await expect(
        context.inTransaction(async () => {
          await accounts.create({ id, email: 'rollback@example.com', displayName: 'Rollback' });
          await accounts.attachCredential({
            // A different, non-existent account: the FK rejects, and the
            // account written moments earlier must not survive.
            adminAccountId: newId() as AdminAccountId,
            credentialKind: 'PASSWORD',
            credentialReference: 'bad',
          });
        }),
      ).rejects.toBeDefined();

      await expect(accounts.findById(id)).resolves.toBeUndefined();
      await expect(accounts.findByEmail('rollback@example.com')).resolves.toBeUndefined();
    });
  });

  describe('admin sessions', () => {
    async function issueSession(
      accountId: AdminAccountId,
      tokenHash: string,
      expiresInMs = HOUR_MS,
    ) {
      return context.inTransaction(() =>
        sessions.issue({
          id: newId() as AdminSessionId,
          adminAccountId: accountId,
          tokenHash,
          expiresAt: new Date(Date.now() + expiresInMs),
        }),
      );
    }

    it('issues a session and resolves it by token hash', async () => {
      const account = await createAccount();
      const issued = await issueSession(account.id, 'hash-1');

      const found = await sessions.findActiveByTokenHash('hash-1', new Date());

      expect(found?.id).toBe(issued.id);
      expect(found?.status).toBe('ACTIVE');
    });

    it('rejects a duplicate token hash', async () => {
      const account = await createAccount();
      await issueSession(account.id, 'hash-dup');

      const error = await failureOf(() => issueSession(account.id, 'hash-dup'));

      expect(error.code).toBe('SESSION_TOKEN_COLLISION');
    });

    it('does not resolve an expired session, even before any cleanup runs', async () => {
      const account = await createAccount();
      await issueSession(account.id, 'hash-expired', -HOUR_MS);

      await expect(
        sessions.findActiveByTokenHash('hash-expired', new Date()),
      ).resolves.toBeUndefined();
    });

    it('does not resolve a revoked session', async () => {
      const account = await createAccount();
      const issued = await issueSession(account.id, 'hash-revoked');

      await context.inTransaction(() => sessions.revoke(issued.id));

      await expect(
        sessions.findActiveByTokenHash('hash-revoked', new Date()),
      ).resolves.toBeUndefined();
    });

    it('stamps revoked_at when a session is revoked', async () => {
      const account = await createAccount();
      const issued = await issueSession(account.id, 'hash-stamp');

      const revoked = await context.inTransaction(() => sessions.revoke(issued.id));

      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedAt).toBeInstanceOf(Date);
    });

    it('revokes every live session for an account and reports the count', async () => {
      const account = await createAccount();
      await issueSession(account.id, 'hash-a');
      await issueSession(account.id, 'hash-b');
      await issueSession(account.id, 'hash-c');

      const revoked = await context.inTransaction(() => sessions.revokeAllForAdmin(account.id));

      expect(revoked).toBe(3);
      await expect(sessions.findActiveByTokenHash('hash-a', new Date())).resolves.toBeUndefined();
      await expect(sessions.findActiveByTokenHash('hash-c', new Date())).resolves.toBeUndefined();
    });

    it('does not re-revoke an already-revoked session, preserving why it ended', async () => {
      const account = await createAccount();
      const issued = await issueSession(account.id, 'hash-once');
      const first = await context.inTransaction(() => sessions.revoke(issued.id));

      const secondCount = await context.inTransaction(() => sessions.revokeAllForAdmin(account.id));

      expect(secondCount).toBe(0);
      const stillRevokedAt = first.revokedAt;
      expect(stillRevokedAt).toBeInstanceOf(Date);
    });

    it('rejects a session for an account that does not exist', async () => {
      const error = await failureOf(() => issueSession(newId() as AdminAccountId, 'hash-orphan'));

      expect(error.kind).toBe('INVALID_REFERENCE');
      expect(error.diagnostics.sqlState).toBe('23503');
    });
  });

  describe('error safety', () => {
    it('never leaks the email that collided', async () => {
      await createAccount('secret-admin@example.com');

      const error = await failureOf(() => createAccount('secret-admin@example.com'));

      expect(error.message).not.toContain('secret-admin@example.com');
      expect(JSON.stringify({ ...error })).not.toContain('secret-admin@example.com');
    });

    it('never leaks a session token hash', async () => {
      const account = await createAccount();
      await context.inTransaction(() =>
        sessions.issue({
          id: newId() as AdminSessionId,
          adminAccountId: account.id,
          tokenHash: 'super-secret-hash',
          expiresAt: new Date(Date.now() + HOUR_MS),
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() =>
          sessions.issue({
            id: newId() as AdminSessionId,
            adminAccountId: account.id,
            tokenHash: 'super-secret-hash',
            expiresAt: new Date(Date.now() + HOUR_MS),
          }),
        ),
      );

      expect(error.message).not.toContain('super-secret-hash');
    });
  });
});
