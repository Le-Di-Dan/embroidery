/**
 * APP1-B01 code-only repository additions, the bootstrap CLI use case, and the
 * lock cascade, against a real disposable PostgreSQL database (T01). No schema
 * change is exercised — only new repository methods on existing tables.
 */
import { newId } from '@embroidery/database';

import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { IdentityModule } from '../../identity.module';
import {
  ADMIN_ACCOUNT_REPOSITORY,
  type AdminAccountId,
  type AdminAccountRepository,
} from '../../domain/repositories/admin-account.repository';
import {
  ADMIN_SESSION_REPOSITORY,
  type AdminSessionId,
  type AdminSessionRepository,
} from '../../domain/repositories/admin-session.repository';
import { BootstrapStaffUseCase, BootstrapError } from '../../application/bootstrap-staff.use-case';
import {
  ScryptPasswordHasher,
  PASSWORD_CREDENTIAL_KIND,
} from '../../infrastructure/crypto/scrypt-password-hasher';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';

const HOUR_MS = 60 * 60 * 1000;
const PASSWORD = 'operator-secret-123';

describe('staff auth persistence (integration)', () => {
  let context: PersistenceTestContext;
  let accounts: AdminAccountRepository;
  let sessions: AdminSessionRepository;
  let bootstrap: BootstrapStaffUseCase;
  let hasher: ScryptPasswordHasher;
  let audit: AuditEventRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('b01-persistence', [
      RequestContextModule,
      IdentityModule,
    ]);
    accounts = context.get(ADMIN_ACCOUNT_REPOSITORY);
    sessions = context.get(ADMIN_SESSION_REPOSITORY);
    bootstrap = context.get(BootstrapStaffUseCase);
    hasher = context.get(ScryptPasswordHasher);
    audit = context.get(AUDIT_EVENT_REPOSITORY);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

  async function seedAdmin(email = 'ops@example.test'): Promise<string> {
    const result = await bootstrap.bootstrap({
      email,
      password: PASSWORD,
      displayName: 'Ops',
      rotate: false,
    });
    return result.adminId;
  }

  describe('credential repository additions', () => {
    it('finds the live password credential and none after supersession', async () => {
      const id = (await seedAdmin()) as AdminAccountId;
      const live = await accounts.findActiveCredential(id, PASSWORD_CREDENTIAL_KIND);
      expect(live?.credentialReference.startsWith('scrypt$')).toBe(true);

      const newRef = await hasher.hash('a-brand-new-secret');
      await context.inTransaction(() =>
        accounts.rotateCredential({
          adminAccountId: id,
          credentialKind: PASSWORD_CREDENTIAL_KIND,
          credentialReference: newRef,
        }),
      );
      const rotated = await accounts.findActiveCredential(id, PASSWORD_CREDENTIAL_KIND);
      expect(rotated?.credentialReference).toBe(newRef);
      expect(rotated?.credentialReference).not.toBe(live?.credentialReference);
    });

    it('requires a transaction to rotate a credential', async () => {
      const id = (await seedAdmin()) as AdminAccountId;
      await expect(
        accounts.rotateCredential({
          adminAccountId: id,
          credentialKind: PASSWORD_CREDENTIAL_KIND,
          credentialReference: 'scrypt$x',
        }),
      ).rejects.toThrow(/must run inside a transaction/);
    });
  });

  describe('extendExpiry', () => {
    it('slides a live session forward and rejects nothing after revoke', async () => {
      const id = (await seedAdmin()) as AdminAccountId;
      const issued = await context.inTransaction(() =>
        sessions.issue({
          id: newId() as AdminSessionId,
          adminAccountId: id,
          tokenHash: 'hash-extend',
          expiresAt: new Date(Date.now() + HOUR_MS),
        }),
      );
      const later = new Date(Date.now() + 3 * HOUR_MS);
      const extended = await sessions.extendExpiry(issued.id, later);
      expect(extended?.expiresAt.getTime()).toBe(later.getTime());

      await context.inTransaction(() => sessions.revoke(issued.id));
      // A revoked session cannot be revived by a late extend.
      await expect(sessions.extendExpiry(issued.id, later)).resolves.toBeUndefined();
    });
  });

  describe('bootstrap CLI use case', () => {
    it('creates the first admin with a verifiable credential and a SYSTEM audit', async () => {
      const id = await seedAdmin('first@example.test');
      const account = await accounts.findById(id as AdminAccountId);
      expect(account?.status).toBe('ACTIVE');

      const credential = await accounts.findActiveCredential(
        id as AdminAccountId,
        PASSWORD_CREDENTIAL_KIND,
      );
      const verify = await hasher.verify(PASSWORD, credential?.credentialReference ?? '');
      expect(verify.ok).toBe(true);

      const events = await audit.listByTarget('ADMIN_ACCOUNT', id);
      const bootstrapped = events.find((e) => e.action === 'staff.credential.bootstrapped');
      expect(bootstrapped?.actorKind).toBe('SYSTEM');
      // The password is never written to the audit trail.
      expect(JSON.stringify(events)).not.toContain(PASSWORD);
    });

    it('refuses a second bootstrap while an active admin exists', async () => {
      await seedAdmin('only@example.test');
      await expect(
        bootstrap.bootstrap({
          email: 'second@example.test',
          password: PASSWORD,
          displayName: 'Two',
          rotate: false,
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });

    it('rotates the credential and revokes live sessions in recovery mode', async () => {
      const id = (await seedAdmin('rotate@example.test')) as AdminAccountId;
      await context.inTransaction(() =>
        sessions.issue({
          id: newId() as AdminSessionId,
          adminAccountId: id,
          tokenHash: 'hash-rotate',
          expiresAt: new Date(Date.now() + HOUR_MS),
        }),
      );

      const result = await bootstrap.bootstrap({
        email: 'rotate@example.test',
        password: 'a-fresh-operator-secret',
        displayName: 'Ops',
        rotate: true,
      });
      expect(result.outcome).toBe('rotated');

      const credential = await accounts.findActiveCredential(id, PASSWORD_CREDENTIAL_KIND);
      expect(
        (await hasher.verify('a-fresh-operator-secret', credential?.credentialReference ?? '')).ok,
      ).toBe(true);
      // The rotation revoked the previously live session.
      await expect(
        sessions.findActiveByTokenHash('hash-rotate', new Date()),
      ).resolves.toBeUndefined();
    });

    it('rejects an invalid email and an under-length password', async () => {
      await expect(
        bootstrap.bootstrap({
          email: 'not-an-email',
          password: PASSWORD,
          displayName: 'X',
          rotate: false,
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
      await expect(
        bootstrap.bootstrap({
          email: 'short@example.test',
          password: 'short',
          displayName: 'X',
          rotate: false,
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });

    it('refuses rotate when no active admin with that email exists', async () => {
      await expect(
        bootstrap.bootstrap({
          email: 'ghost@example.test',
          password: PASSWORD,
          displayName: 'X',
          rotate: true,
        }),
      ).rejects.toBeInstanceOf(BootstrapError);
    });
  });
});
