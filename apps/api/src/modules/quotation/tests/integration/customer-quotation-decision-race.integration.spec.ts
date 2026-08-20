/**
 * `APP6-B05` §18 — the three races an acceptance owns, on real independent
 * PostgreSQL connections.
 *
 * ### Deterministic, and each runs once
 *
 * Every case follows the shape `APP6-B03`'s race suite established. A third
 * connection takes the contended row's lock first and holds it, so both
 * contenders are guaranteed to reach their own `FOR UPDATE` before either can
 * write. The suite then waits for a **real condition** — two ungranted locks in
 * `pg_locks` — rather than for a duration, and releases the holder. Which of the
 * two wins is left to PostgreSQL and is never asserted; what is asserted is that
 * both outcomes are whole.
 *
 * There is no process-local mutex anywhere on the decision path, and there must
 * not be: one would be silent about the second API replica.
 *
 * ### The three contended rows are three different rows, on purpose
 *
 * - **CC-05** contends on the `quotation_versions` row: a newer send supersedes
 *   it, and an acceptance locks it. Whoever gets there first decides whether the
 *   old price is still the offer;
 * - **CC-16** contends on the `secure_access_grants` row: a revoke updates it,
 *   and the acceptance's in-transaction re-check locks it. This is the case a
 *   pre-transaction authorization snapshot cannot decide, and the reason
 *   ADR-DB3-004 r9 exists;
 * - the **request-state race** contends on the `custom_requests` row, so an
 *   accepted quotation can never commit beside a request that could not carry
 *   it.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { DatabaseExecutor, PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { SECURE_GRANT_POLICY_KEY } from '../../../customer/domain/grant/secure-grant-policy';
import { SECURE_LINK_RESOLVE_POLICY_KEY } from '../../../customer/domain/grant/secure-link-policy';
import { digestSecret } from '../../../customer/domain/secret/app4-secret-digest';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { AcceptQuotationUseCase } from '../../application/customer/accept-quotation.use-case';
import { SendQuotationVersionUseCase } from '../../application/sending/send-quotation-version.use-case';
import { isQuotationSendError } from '../../domain/sending/quotation-send.errors';
import { QuotationSendModule } from '../../quotation-send.module';
import { CustomerQuotationDecisionModule } from '../../customer-quotation-decision.module';
import { isQuotationDecisionError } from '../../domain/decision/quotation-decision.errors';
import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { draftInput } from './customer-quotation-context';

const MODULES = [
  RequestContextModule,
  AuditContextModule,
  CustomerQuotationDecisionModule,
  // `APP6-B03`'s send, driven as the real competing writer rather than
  // re-assembled from repository calls. The distinction turned out to matter:
  // `update quotations` re-checks `fk_quotations__custom_request_id` and so
  // takes a key-share lock on the parent `custom_requests` row. Every AGG-14
  // write path therefore has to reach the request row, which the delivered send
  // use case and the acceptance both do explicitly and first — and a
  // hand-rolled fixture that skipped it manufactured a lock-order inversion no
  // delivered code path can reach.
  QuotationSendModule,
];

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b05-race-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b05-race-secure-link-pepper-0002',
};

/** The published key `APP6-B03`'s send reads its window from. */
const QUOTATION_VALIDITY_POLICY_KEY = 'quotation.validity';

interface Seeded {
  readonly adminId: string;
  readonly requestId: CustomRequestId;
  readonly customerId: string;
  readonly grantId: string;
  readonly token: string;
  readonly quotationId: QuotationId;
  readonly versionId: QuotationVersionId;
}

describe('APP6-B05 decision races (integration)', () => {
  let context: ConcurrencyTestContext;
  const restore = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const [name, value] of Object.entries(TEST_PEPPERS)) {
      restore.set(name, process.env[name]);
      process.env[name] = value;
    }
    context = await createConcurrencyTestContext('app6-b05-race', MODULES);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
    for (const [name, value] of restore) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function asAdmin<T>(
    actor: ConcurrencyActor,
    adminId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    return requestContext.run({ requestId: newId() }, () => {
      requestContext.bindActor({ kind: 'ADMIN', adminId });
      return work();
    });
  }

  function asRequest<T>(actor: ConcurrencyActor, work: () => Promise<T>): Promise<T> {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    return requestContext.run({ requestId: newId() }, work);
  }

  /** Seeds policies, a verified customer with a fresh step-up, a QUOTED request and a sent version. */
  async function seed(actor: ConcurrencyActor): Promise<Seeded> {
    const db = context.disposable.client.db;
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b05-race-${adminId}@example.test`}, 'B05 Race Operator', 'ACTIVE')
    `);
    const policies = actor.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    await actor.inTransaction(async () => {
      for (const [key, value] of [
        [SECURE_LINK_RESOLVE_POLICY_KEY, { maxRequestsPerIpPerMinute: 600 }],
        [QUOTATION_VALIDITY_POLICY_KEY, { validityDays: 7 }],
        [
          SECURE_GRANT_POLICY_KEY,
          { standardTtlSeconds: 7 * 24 * 60 * 60, stepUpWindowSeconds: 15 * 60 },
        ],
      ] as const) {
        await policies.ensureKey(key, 'APP6-B05 race fixture.');
        await policies.publishVersion({
          configKey: key,
          value,
          valueSchemaVersion: 1,
          effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          createdByAdminId: adminId,
          reason: 'APP6-B05 race fixture.',
        });
      }
    });

    const customerId = newId();
    const contactPointId = newId();
    const normalizedValue = `b05race-${randomBytes(6).toString('hex')}@example.test`;
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'B05 Race Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
         verified_at, verified_source)
      values (${contactPointId}, ${customerId}, 'EMAIL', ${normalizedValue}, ${normalizedValue},
              true, now(), 'APP6-B05 race fixture.')
    `);
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
         status, expires_at, verified_at)
      values (${newId()}, ${contactPointId}, 'EMAIL', ${normalizedValue}, 'STEP_UP',
              ${`race-step-up-digest-${contactPointId}`}, 'VERIFIED',
              now() + interval '10 minutes', now())
    `);

    const requestId = newId() as CustomRequestId;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${requestId}, ${`REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`},
              ${customerId}, 'QUOTED')
    `);

    const token = randomBytes(32).toString('base64url');
    const grantId = newId();
    await db.execute(sql`
      insert into secure_access_grants (id, customer_id, custom_request_id, token_hash,
                                        scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${requestId},
              ${digestSecret(TEST_PEPPERS['SECURE_LINK_TOKEN_SECRET_PEPPER'] as string, token)},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '7 days')
    `);

    const quotations = actor.get<QuotationRepository>(QUOTATION_REPOSITORY);
    const quotationId = newId() as QuotationId;
    await actor.inTransaction(() =>
      quotations.createForRequest(
        quotationId,
        `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
        requestId,
      ),
    );
    const versionId = await actor.inTransaction(async () => {
      const version = await quotations.addVersion(draftInput(quotationId, { unitPrice: 150_000 }));
      const at = new Date();
      await quotations.send(version.id, new Date(at.getTime() + 7 * 24 * 60 * 60_000), at);
      await quotations.setCurrentVersion(quotationId, version.id);
      return version.id;
    });
    await db.execute(sql`
      update custom_requests set current_quotation_id = ${quotationId} where id = ${requestId}
    `);

    return { adminId, requestId, customerId, grantId, token, quotationId, versionId };
  }

  /** Waits for a real condition: `count` backends blocked on a lock. */
  async function waitForBlockedBackends(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from pg_locks where not granted`,
        )
      ).rows;
      if (Number(row?.count ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${count} blocked backends.`);
  }

  /** Takes and holds one row lock, then hands back a release function. */
  async function holdRowLock(
    holder: ConcurrencyActor,
    query: ReturnType<typeof sql>,
  ): Promise<{ release: () => void; done: Promise<void> }> {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let taken: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      taken = resolve;
    });
    const done = holder.inTransaction(async () => {
      await holder.get<DatabaseExecutor>(DatabaseExecutor).current().execute(query);
      taken();
      await held;
    });
    await lockTaken;
    return { release, done };
  }

  async function countOf(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? -1);
  }

  function failureCodeOf(error: unknown): string {
    if (isQuotationDecisionError(error)) return error.failure;
    if (isSecureLinkError(error)) return error.code;
    throw error;
  }

  async function wholeStateOf(seeded: Seeded) {
    const [version] = (
      await context.disposable.client.db.execute<{ status: string; accepted_at: unknown }>(
        sql`select status, accepted_at from quotation_versions where id = ${seeded.versionId}`,
      )
    ).rows;
    const [request] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from custom_requests where id = ${seeded.requestId}`,
      )
    ).rows;
    return {
      version: version!,
      request: request!,
      acceptances: await countOf(
        sql`select count(*)::text as count from quotation_acceptances
             where quotation_version_id = ${seeded.versionId}`,
      ),
      transitions: await countOf(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${seeded.requestId} and to_status = 'QUOTE_ACCEPTED'`,
      ),
    };
  }

  it('CC-05 — an acceptance and a newer send at once: whichever wins, the outcome is whole', async () => {
    await context.reset();
    const setup = await context.spawnActor('cc05-setup');
    const seeded = await seed(setup);

    // The competing draft is authored in setup: `TR-LC12-01` and `TR-LC12-02`
    // are separate operations in separate transactions, and the race is between
    // an acceptance and a **send**.
    const draftId = await setup.inTransaction(async () => {
      const version = await setup
        .get<QuotationRepository>(QUOTATION_REPOSITORY)
        .addVersion(draftInput(seeded.quotationId, { unitPrice: 175_000 }));
      return version.id;
    });

    const holder = await context.spawnActor('cc05-holder');
    const customer = await context.spawnActor('cc05-customer');
    const workshop = await context.spawnActor('cc05-workshop');

    // The **request** row is the arbiter, and it is the arbiter for a reason
    // that is a fact about PostgreSQL rather than a choice: `update quotations`
    // re-checks `fk_quotations__custom_request_id` and takes a key-share lock on
    // the parent `custom_requests` row, so both write paths must reach it. Both
    // therefore take it explicitly and first, and holding it here guarantees
    // both contenders are blocked before either can write.
    const lock = await holdRowLock(
      holder,
      sql`select id from custom_requests where id = ${seeded.requestId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(customer, () =>
        customer
          .get<AcceptQuotationUseCase>(AcceptQuotationUseCase)
          .accept({ token: seeded.token, versionId: seeded.versionId }),
      ),
      asAdmin(workshop, seeded.adminId, () =>
        workshop
          .get<SendQuotationVersionUseCase>(SendQuotationVersionUseCase)
          .send({ quotationId: seeded.quotationId, versionId: draftId }),
      ),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;

    const [acceptResult] = await attempts;
    const state = await wholeStateOf(seeded);

    const [, sendResult] = await attempts;
    const [draft] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from quotation_versions where id = ${draftId}`,
      )
    ).rows;

    if (acceptResult.status === 'fulfilled') {
      // The acceptance won the request row. Everything it owns committed
      // together — and the send that followed **refused** rather than inventing
      // a backward reopen: the request has left the state a quotation can be
      // sent from, so the accepted price stands and the draft stays a draft.
      expect(state.version.status).toBe('ACCEPTED');
      expect(state.version.accepted_at).not.toBeNull();
      expect(state.acceptances).toBe(1);
      expect(state.transitions).toBe(1);
      expect(state.request.status).toBe('QUOTE_ACCEPTED');
      expect(sendResult.status).toBe('rejected');
      expect(isQuotationSendError((sendResult as PromiseRejectedResult).reason)).toBe(true);
      expect(draft!.status).toBe('DRAFT');
    } else {
      // The send won. The acceptance refused in the canonical vocabulary and
      // left nothing half-accepted behind.
      expect(failureCodeOf(acceptResult.reason)).toBe('QUOTE_VERSION_STALE');
      expect(state.version.status).toBe('SUPERSEDED');
      expect(state.version.accepted_at).toBeNull();
      expect(state.acceptances).toBe(0);
      expect(state.transitions).toBe(0);
      expect(state.request.status).toBe('QUOTED');
      expect(draft!.status).toBe('SENT');
    }

    await Promise.all([setup.close(), holder.close(), customer.close(), workshop.close()]);
  }, 180_000);

  it('CC-16 — a grant revoke and an acceptance at once: a committed revoke wins', async () => {
    await context.reset();
    const setup = await context.spawnActor('cc16-setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('cc16-holder');
    const customer = await context.spawnActor('cc16-customer');
    const operator = await context.spawnActor('cc16-operator');

    // The grant row is the arbiter. This is the case a pre-transaction
    // authorization snapshot cannot decide: the acceptance was already admitted
    // before either transaction opened.
    const lock = await holdRowLock(
      holder,
      sql`select id from secure_access_grants where id = ${seeded.grantId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(customer, () =>
        customer
          .get<AcceptQuotationUseCase>(AcceptQuotationUseCase)
          .accept({ token: seeded.token, versionId: seeded.versionId }),
      ),
      operator.inTransaction(() =>
        operator.get<DatabaseExecutor>(DatabaseExecutor).current().execute(sql`
            update secure_access_grants
               set status = 'REVOKED', revoked_at = now(), revoke_reason = 'Race fixture.'
             where id = ${seeded.grantId}
          `),
      ),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;

    const [acceptResult] = await attempts;
    const state = await wholeStateOf(seeded);
    const [grant] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from secure_access_grants where id = ${seeded.grantId}`,
      )
    ).rows;
    expect(grant!.status).toBe('REVOKED');

    if (acceptResult.status === 'fulfilled') {
      // The acceptance held the grant row first, so the revoke waited behind a
      // decision that was already authorized. Everything committed whole.
      expect(state.version.status).toBe('ACCEPTED');
      expect(state.acceptances).toBe(1);
      expect(state.transitions).toBe(1);
      expect(state.request.status).toBe('QUOTE_ACCEPTED');
    } else {
      // The revoke committed first. The acceptance's in-transaction re-check saw
      // a grant that was no longer live and refused without disclosing why.
      expect(failureCodeOf(acceptResult.reason)).toBe('SECURE_LINK_UNAVAILABLE');
      expect(state.version.status).toBe('SENT');
      expect(state.acceptances).toBe(0);
      expect(state.transitions).toBe(0);
      expect(state.request.status).toBe('QUOTED');
    }

    await Promise.all([setup.close(), holder.close(), customer.close(), operator.close()]);
  }, 180_000);

  it('request-state race — an acceptance and a cancellation cannot both land', async () => {
    await context.reset();
    const setup = await context.spawnActor('req-setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('req-holder');
    const customer = await context.spawnActor('req-customer');
    const moderator = await context.spawnActor('req-moderator');
    const adminId = (
      await context.disposable.client.db.execute<{ id: string }>(
        sql`select id from admin_accounts where status = 'ACTIVE' limit 1`,
      )
    ).rows[0]!.id;

    const lock = await holdRowLock(
      holder,
      sql`select id from custom_requests where id = ${seeded.requestId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(customer, () =>
        customer
          .get<AcceptQuotationUseCase>(AcceptQuotationUseCase)
          .accept({ token: seeded.token, versionId: seeded.versionId }),
      ),
      moderator.inTransaction(() =>
        moderator.get<CustomRequestRepository>(CUSTOM_REQUEST_REPOSITORY).transition({
          id: seeded.requestId,
          to: 'CANCELLED',
          actor: { kind: 'ADMIN', adminId },
          reason: 'Nội bộ: khách đổi ý.',
          customerVisibleReason: 'Yêu cầu đã được huỷ.',
          correlationId: newId(),
        }),
      ),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;

    const [acceptResult] = await attempts;
    const state = await wholeStateOf(seeded);

    if (acceptResult.status === 'fulfilled') {
      // The acceptance won. The cancellation that followed is a legal
      // `QUOTE_ACCEPTED → CANCELLED` move and leaves the acceptance intact.
      expect(state.version.status).toBe('ACCEPTED');
      expect(state.acceptances).toBe(1);
      expect(state.transitions).toBe(1);
      expect(['QUOTE_ACCEPTED', 'CANCELLED']).toContain(state.request.status);
    } else {
      // The cancellation won. There is no accepted quotation standing beside a
      // cancelled request.
      expect(failureCodeOf(acceptResult.reason)).toBe('INVALID_TRANSITION');
      expect(state.version.status).toBe('SENT');
      expect(state.acceptances).toBe(0);
      expect(state.transitions).toBe(0);
      expect(state.request.status).toBe('CANCELLED');
    }

    // Whichever way it went, the request never gained a self-edge or a
    // duplicate move out of QUOTED.
    const transitions = (
      await context.disposable.client.db.execute<{ from_status: string; to_status: string }>(
        sql`select from_status, to_status from custom_request_transitions
             where custom_request_id = ${seeded.requestId} order by id asc`,
      )
    ).rows;
    expect(transitions[0]?.from_status).toBe('QUOTED');
    for (const transition of transitions) {
      expect(transition.from_status).not.toBe(transition.to_status);
    }

    await Promise.all([setup.close(), holder.close(), customer.close(), moderator.close()]);
  }, 180_000);
});
