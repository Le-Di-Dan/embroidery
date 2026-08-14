/**
 * CTX-CUS verification and secure-access persistence against a real PostgreSQL
 * instance (DB7-CP3).
 *
 * TBL-006..008: the challenge lifecycle (G-DB7-41/43/45) and the secure-grant
 * guards that stand between a leaked link and someone else's order
 * (G-DB7-38/39/40).
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { CustomerModule } from '../../customer.module';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository';
import type {
  ContactPointId,
  CustomerId,
  CustomerRepository,
} from '../../domain/repositories/customer.repository';
import { VERIFICATION_CHALLENGE_REPOSITORY } from '../../domain/repositories/verification-challenge.repository';
import type {
  ChallengeId,
  VerificationChallengeRepository,
} from '../../domain/repositories/verification-challenge.repository';
import { SECURE_ACCESS_GRANT_REPOSITORY } from '../../domain/repositories/secure-access-grant.repository';
import type {
  GrantId,
  SecureAccessGrantRepository,
} from '../../domain/repositories/secure-access-grant.repository';

const HOUR_MS = 60 * 60 * 1000;

describe('verification and secure access persistence (integration)', () => {
  let context: PersistenceTestContext;
  let customers: CustomerRepository;
  let challenges: VerificationChallengeRepository;
  let grants: SecureAccessGrantRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-customer-secure', [
      // The global platform context modules. In production `CustomerModule`
      // reaches them through `AppModule`; a suite that composes it alone has to
      // say so, because its application layer correlates by request id.
      RequestContextModule,
      AuditContextModule,
      CustomerModule,
    ]);
    customers = context.get(CUSTOMER_REPOSITORY);
    challenges = context.get(VERIFICATION_CHALLENGE_REPOSITORY);
    grants = context.get(SECURE_ACCESS_GRANT_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
  });

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

  function createCustomer(value = 'a@example.com'): Promise<{ id: CustomerId }> {
    const id = newId() as CustomerId;
    return context.inTransaction(() =>
      customers.createWithVerifiedContact({
        id,
        displayName: 'Test Customer',
        contact: {
          id: newId() as ContactPointId,
          contactKind: 'EMAIL',
          normalizedValue: value,
          displayValue: value,
          verifiedSource: 'OTP',
        },
        verifiedAt: new Date(),
      }),
    );
  }

  /**
   * Seeds a `custom_requests` row directly.
   *
   * A grant's `custom_request_id` is NOT NULL with a real FK, and the Request
   * aggregate belongs to CTX-ORD (CP4). Reaching into another context's tables
   * from a *test fixture* is acceptable where reaching from production code
   * would not be — the alternative is not testing the grant guards until CP4.
   *
   * The code uses the whole id, not a prefix: uuidv7 begins with a timestamp,
   * so two requests seeded in the same millisecond share their leading bytes
   * and would collide on `uq_custom_requests__code`.
   */
  async function seedRequest(customerId: CustomerId): Promise<string> {
    const id = newId();
    await context.disposable.client.db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${id}, ${`REQ-${id}`}, ${customerId}, 'NEW')
    `);
    return id;
  }

  describe('verification challenges', () => {
    const openChallenge = (
      value = 'verify@example.com',
      purpose: 'SUBMISSION' | 'STEP_UP' = 'SUBMISSION',
    ) =>
      context.inTransaction(() =>
        challenges.openChallenge({
          id: newId() as ChallengeId,
          contactKind: 'EMAIL',
          normalizedValue: value,
          purpose,
          codeHash: 'hash-of-code',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + HOUR_MS),
        }),
      );

    it('opens a challenge and resolves it while live', async () => {
      const opened = await openChallenge();

      const found = await challenges.resolveOpen(
        'EMAIL',
        'verify@example.com',
        'SUBMISSION',
        new Date(),
      );

      expect(found?.id).toBe(opened.id);
    });

    it('allows only one open challenge per contact and purpose', async () => {
      await openChallenge();

      const error = await failureOf(() => openChallenge());

      expect(error.code).toBe('CHALLENGE_ALREADY_OPEN');
    });

    it('allows a step-up challenge alongside a submission one', async () => {
      await openChallenge('same@example.com', 'SUBMISSION');

      await expect(openChallenge('same@example.com', 'STEP_UP')).resolves.toBeDefined();
    });

    it('does not resolve an expired challenge (G-DB7-41)', async () => {
      const opened = await context.inTransaction(() =>
        challenges.openChallenge({
          id: newId() as ChallengeId,
          contactKind: 'EMAIL',
          normalizedValue: 'stale@example.com',
          purpose: 'SUBMISSION',
          codeHash: 'hash',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() - HOUR_MS),
        }),
      );

      expect(opened.id).toBeDefined();
      await expect(
        challenges.resolveOpen('EMAIL', 'stale@example.com', 'SUBMISSION', new Date()),
      ).resolves.toBeUndefined();
    });

    it('completes an open challenge', async () => {
      const opened = await openChallenge();

      const completed = await context.inTransaction(() =>
        challenges.completeChallenge(opened.id, new Date()),
      );

      expect(completed.verifiedAt).toBeInstanceOf(Date);
    });

    it('refuses to complete an expired challenge', async () => {
      const opened = await context.inTransaction(() =>
        challenges.openChallenge({
          id: newId() as ChallengeId,
          contactKind: 'EMAIL',
          normalizedValue: 'late@example.com',
          purpose: 'SUBMISSION',
          codeHash: 'hash',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() - 1000),
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => challenges.completeChallenge(opened.id, new Date())),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('refuses to complete a failed challenge, so it cannot be laundered into a credential', async () => {
      const opened = await openChallenge();
      await context.inTransaction(() => challenges.failChallenge(opened.id));

      const error = await failureOf(() =>
        context.inTransaction(() => challenges.completeChallenge(opened.id, new Date())),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('counts attempts, the input to the rate policy (G-DB7-45)', async () => {
      const opened = await openChallenge();

      await context.inTransaction(async () => {
        await challenges.recordAttempt(opened.id, 'MISMATCH', new Date());
        await challenges.recordAttempt(opened.id, 'MISMATCH', new Date());
      });

      await expect(challenges.countAttempts(opened.id)).resolves.toBe(2);
    });

    it('answers the step-up window question (G-DB7-43)', async () => {
      const opened = await openChallenge('stepup@example.com', 'STEP_UP');
      await context.inTransaction(() => challenges.completeChallenge(opened.id, new Date()));

      await expect(
        challenges.hasRecentCompleted(
          'EMAIL',
          'stepup@example.com',
          'STEP_UP',
          new Date(Date.now() - HOUR_MS),
        ),
      ).resolves.toBe(true);

      // Outside the window, the same completion no longer counts.
      await expect(
        challenges.hasRecentCompleted(
          'EMAIL',
          'stepup@example.com',
          'STEP_UP',
          new Date(Date.now() + HOUR_MS),
        ),
      ).resolves.toBe(false);
    });

    it('rejects a purpose outside the canonical set', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          challenges.openChallenge({
            id: newId() as ChallengeId,
            contactKind: 'EMAIL',
            normalizedValue: 'bad@example.com',
            purpose: 'MYSTERY' as never,
            codeHash: 'hash',
            issuedAt: new Date(),
            expiresAt: new Date(Date.now() + HOUR_MS),
          }),
        ),
      );

      expect(error.diagnostics.constraint).toBe(
        'ck_contact_verification_challenges__purpose_allowed',
      );
    });
  });

  describe('secure access grants', () => {
    async function issueGrant(tokenHash = 'grant-hash') {
      const customer = await createCustomer(`${tokenHash}@example.com`);
      const requestId = await seedRequest(customer.id);
      const grant = await context.inTransaction(() =>
        grants.issue({
          id: newId() as GrantId,
          customerId: customer.id,
          customRequestId: requestId,
          tokenHash,
          scopeKind: 'REQUEST_ACCESS',
          expiresAt: new Date(Date.now() + HOUR_MS),
        }),
      );
      return { customer, requestId, grant };
    }

    it('resolves a live grant for the right customer, request and scope', async () => {
      const { customer, requestId, grant } = await issueGrant();

      const resolved = await grants.resolveActive(
        'grant-hash',
        { customerId: customer.id, customRequestId: requestId, scopeKind: 'REQUEST_ACCESS' },
        new Date(),
      );

      expect(resolved?.id).toBe(grant.id);
    });

    it('refuses a grant presented for another customer (G-DB7-38)', async () => {
      const { requestId } = await issueGrant();
      const intruder = await createCustomer('intruder@example.com');

      await expect(
        grants.resolveActive(
          'grant-hash',
          { customerId: intruder.id, customRequestId: requestId, scopeKind: 'REQUEST_ACCESS' },
          new Date(),
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses a grant presented for another request (G-DB7-39)', async () => {
      const { customer } = await issueGrant();
      const otherRequest = await seedRequest(customer.id);

      await expect(
        grants.resolveActive(
          'grant-hash',
          {
            customerId: customer.id,
            customRequestId: otherRequest,
            scopeKind: 'REQUEST_ACCESS',
          },
          new Date(),
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses an expired grant (G-DB7-40)', async () => {
      const { customer, requestId } = await issueGrant();

      await expect(
        grants.resolveActive(
          'grant-hash',
          { customerId: customer.id, customRequestId: requestId, scopeKind: 'REQUEST_ACCESS' },
          new Date(Date.now() + 2 * HOUR_MS),
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses a revoked grant (G-DB7-40)', async () => {
      const { customer, requestId, grant } = await issueGrant();

      await context.inTransaction(() => grants.revoke(grant.id, 'customer requested revocation'));

      await expect(
        grants.resolveActive(
          'grant-hash',
          { customerId: customer.id, customRequestId: requestId, scopeKind: 'REQUEST_ACCESS' },
          new Date(),
        ),
      ).resolves.toBeUndefined();
    });

    it('gives every rejection the same empty result, disclosing nothing about which check failed', async () => {
      const { customer, requestId } = await issueGrant();
      const now = new Date();

      const outcomes = await Promise.all([
        grants.resolveActive(
          'wrong-token',
          { customerId: customer.id, customRequestId: requestId, scopeKind: 'REQUEST_ACCESS' },
          now,
        ),
        grants.resolveActive(
          'grant-hash',
          {
            customerId: newId() as CustomerId,
            customRequestId: requestId,
            scopeKind: 'REQUEST_ACCESS',
          },
          now,
        ),
        grants.resolveActive(
          'grant-hash',
          { customerId: customer.id, customRequestId: newId(), scopeKind: 'REQUEST_ACCESS' },
          now,
        ),
      ]);

      expect(outcomes).toEqual([undefined, undefined, undefined]);
    });

    it('allows only one active grant per customer and request', async () => {
      const { customer, requestId } = await issueGrant();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          grants.issue({
            id: newId() as GrantId,
            customerId: customer.id,
            customRequestId: requestId,
            tokenHash: 'second-hash',
            scopeKind: 'REQUEST_ACCESS',
            expiresAt: new Date(Date.now() + HOUR_MS),
          }),
        ),
      );

      expect(error.code).toBe('GRANT_ALREADY_ACTIVE');
    });

    it('requires a reason to revoke — the CHECK backs the application rule', async () => {
      const { grant } = await issueGrant();

      // Raw SQL, deliberately: the repository always supplies a reason, so this
      // asserts the *database* refuses even when the code is bypassed. Mapped
      // explicitly because this path skips the repository funnel.
      const error = await failureOf(() =>
        withMappedErrors('probe.revokeWithoutReason', () =>
          context.disposable.client.db.execute(
            sql`update secure_access_grants set status = 'REVOKED' where id = ${grant.id}`,
          ),
        ),
      );

      expect(error.diagnostics.constraint).toBe('ck_secure_access_grants__revoke_reason_required');
    });

    it('refuses to revoke a grant that is not active', async () => {
      const { grant } = await issueGrant();
      await context.inTransaction(() => grants.revoke(grant.id, 'first'));

      const error = await failureOf(() =>
        context.inTransaction(() => grants.revoke(grant.id, 'second')),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('links a superseded grant to its replacement', async () => {
      const { customer, requestId, grant } = await issueGrant();

      const replacementId = newId() as GrantId;
      await context.inTransaction(async () => {
        // Order matters, and the self-referencing FK enforces it: the pointer
        // cannot name a grant that does not exist yet. Revoking the old grant
        // first is also what frees the active-per-(customer, request) arbiter
        // for the replacement.
        await grants.revoke(grant.id, 'reissued');
        await grants.issue({
          id: replacementId,
          customerId: customer.id,
          customRequestId: requestId,
          tokenHash: 'replacement-hash',
          scopeKind: 'REQUEST_ACCESS',
          expiresAt: new Date(Date.now() + HOUR_MS),
        });
        await grants.supersede(grant.id, replacementId, 'reissued');
      });

      const active = await grants.listActiveForRequest(requestId);
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe(replacementId);
    });
  });
});
