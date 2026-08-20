/**
 * `APP6-B03` §12 — a quotation send and a moderation decision on the same
 * request, at the same moment, on real independent PostgreSQL connections.
 *
 * The send's eligibility decision and its writes must see one request state. The
 * arbiter is `CustomRequestRepository.lockById`, taken **before** the version is
 * touched: whichever transaction acquires the row lock first applies its
 * decision, and the other resumes against a request that has left the state it
 * judged.
 *
 * ### It is deterministic, and it runs once
 *
 * A third connection takes the request's row lock first and holds it. Both
 * contenders then start their real transactions and block on `SELECT … FOR
 * UPDATE`. The suite waits for a **real condition** — two ungranted locks in
 * `pg_locks` — rather than for a duration, then releases the holder. Which of
 * the two wins is left to PostgreSQL and is never asserted; what is asserted is
 * that both outcomes are whole.
 *
 * The two whole outcomes are:
 *
 * - the **send wins**: the version is frozen, both pointers are set, the request
 *   is `QUOTED`, one event exists — and the cancellation that follows is a legal
 *   `QUOTED → CANCELLED` move that leaves all of that intact;
 * - the **cancellation wins**: the send refuses `REQUEST_NOT_SENDABLE` with the
 *   version still a `DRAFT`, no pointer moved and no event appended.
 *
 * There is no process-local mutex anywhere on the send path, and there must not
 * be: one would be silent about the second API replica.
 */
import { newId } from '@embroidery/database';
import {
  DatabaseExecutor,
  OutboxEventStore,
  PolicyConfigurationRepository,
  TransactionManager,
} from '@embroidery/persistence';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { AuditModule } from '../../../audit/audit.module';
import { AUDIT_EVENT_REPOSITORY } from '../../../audit/domain/repositories/audit-event.repository';
import type { AuditEventRepository } from '../../../audit/domain/repositories/audit-event.repository';
import { OrderModule } from '../../../order/order.module';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { QuotationSendRecorder } from '../../application/sending/quotation-send.recorder';
import { SendQuotationVersionUseCase } from '../../application/sending/send-quotation-version.use-case';
import { isQuotationSendError } from '../../domain/sending/quotation-send.errors';
import { QuotationValidityPolicyReader } from '../../infrastructure/policy/quotation-validity-policy.reader';
import { QuotationModule } from '../../quotation.module';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import { draftInput } from './quotation-send-context';

const MODULES = [RequestContextModule, AuditModule, OrderModule, QuotationModule];

interface Seeded {
  readonly requestId: CustomRequestId;
  readonly quotationId: QuotationId;
  readonly versionId: QuotationVersionId;
  readonly adminId: string;
}

describe('APP6-B03 send versus moderation (integration)', () => {
  let context: ConcurrencyTestContext;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app6-b03-race', MODULES);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  /** The send use case, built on one actor's own independently pooled graph. */
  function senderOf(actor: ConcurrencyActor): SendQuotationVersionUseCase {
    return new SendQuotationVersionUseCase(
      actor.get<TransactionManager>(TransactionManager),
      actor.get<QuotationRepository>(QUOTATION_REPOSITORY),
      actor.get<CustomRequestRepository>(CUSTOM_REQUEST_REPOSITORY),
      new QuotationValidityPolicyReader(
        actor.get<PolicyConfigurationRepository>(PolicyConfigurationRepository),
      ),
      new QuotationSendRecorder(
        actor.get<AuditEventRepository>(AUDIT_EVENT_REPOSITORY),
        actor.get<OutboxEventStore>(OutboxEventStore),
        actor.get<RequestContextService>(RequestContextService),
      ),
      actor.get<RequestContextService>(RequestContextService),
      new AuditClock(),
    );
  }

  function asAdmin<T>(actor: ConcurrencyActor, adminId: string, work: () => Promise<T>) {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    return requestContext.run({ requestId: newId() }, () => {
      requestContext.bindActor({ kind: 'ADMIN', adminId });
      return work();
    });
  }

  /** Seeds an admin, a customer, an UNDER_REVIEW request, a quotation, a draft. */
  async function seed(actor: ConcurrencyActor): Promise<Seeded> {
    const db = context.disposable.client.db;
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b03-race-${adminId}@example.test`}, 'B03 Race Operator', 'ACTIVE')
    `);
    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);

    const requestId = newId() as CustomRequestId;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${requestId}, ${`REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`},
              ${customerId}, 'UNDER_REVIEW')
    `);

    const quotations = actor.get<QuotationRepository>(QUOTATION_REPOSITORY);
    const policies = actor.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    const quotationId = newId() as QuotationId;
    const versionId = await actor.inTransaction(async () => {
      await quotations.createForRequest(
        quotationId,
        `QUO-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`,
        requestId,
      );
      const version = await quotations.addVersion(draftInput(quotationId, 150_000));
      await policies.ensureKey('quotation.validity', 'Quotation validity for tests.');
      await policies.publishVersion({
        configKey: 'quotation.validity',
        value: { validityDays: 7 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'test fixture',
      });
      return version.id;
    });

    return { requestId, quotationId, versionId, adminId };
  }

  /** Waits for a real condition: `count` backends blocked on a lock. */
  async function waitForBlockedBackends(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from pg_locks where not granted`,
        )
      ).rows;
      if (Number(row?.count ?? 0) >= count) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${count} blocked backends.`);
  }

  async function countOf(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? -1);
  }

  it('CC — a send and a cancellation at once: whichever wins, the outcome is whole', async () => {
    await context.reset();
    const setup = await context.spawnActor('setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('holder');
    const sender = await context.spawnActor('sender');
    const moderator = await context.spawnActor('moderator');

    let releaseHolder: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    // A third connection takes the row lock first, so both contenders are
    // guaranteed to reach their own `FOR UPDATE` before either can write.
    const holding = holder.inTransaction(async () => {
      await holder
        .get<DatabaseExecutor>(DatabaseExecutor)
        .current()
        .execute(sql`select id from custom_requests where id = ${seeded.requestId} for update`);
      locked();
      await held;
    });
    await lockTaken;

    const attempts = Promise.allSettled([
      asAdmin(sender, seeded.adminId, () =>
        senderOf(sender).send({ quotationId: seeded.quotationId, versionId: seeded.versionId }),
      ),
      asAdmin(moderator, seeded.adminId, () =>
        moderator.inTransaction(() =>
          moderator.get<CustomRequestRepository>(CUSTOM_REQUEST_REPOSITORY).transition({
            id: seeded.requestId,
            to: 'CANCELLED',
            actor: { kind: 'ADMIN', adminId: seeded.adminId },
            reason: 'Nội bộ: khách đổi ý.',
            customerVisibleReason: 'Yêu cầu đã được huỷ.',
            correlationId: newId(),
          }),
        ),
      ),
    ]);

    await waitForBlockedBackends(2);
    releaseHolder();
    await holding;

    const [sendResult] = await attempts;

    const [version] = (
      await context.disposable.client.db.execute<{ status: string; sent_at: unknown }>(
        sql`select status, sent_at from quotation_versions where id = ${seeded.versionId}`,
      )
    ).rows;
    const [request] = (
      await context.disposable.client.db.execute<{
        status: string;
        current_quotation_id: string | null;
      }>(
        sql`select status, current_quotation_id from custom_requests where id = ${seeded.requestId}`,
      )
    ).rows;
    const [quotation] = (
      await context.disposable.client.db.execute<{ current_version_id: string | null }>(
        sql`select current_version_id from quotations where id = ${seeded.quotationId}`,
      )
    ).rows;
    const events = await countOf(sql`select count(*)::text as count from outbox_events
                                      where event_type = 'quotation.sent'`);

    if (sendResult.status === 'fulfilled') {
      // The send won the lock. Everything it owns committed together, and the
      // cancellation that followed is a legal `QUOTED → CANCELLED` move which
      // leaves the frozen price and both pointers exactly as the send left them.
      expect(version!.status).toBe('SENT');
      expect(version!.sent_at).not.toBeNull();
      expect(request!.current_quotation_id).toBe(seeded.quotationId);
      expect(quotation!.current_version_id).toBe(seeded.versionId);
      expect(events).toBe(1);
      expect(['QUOTED', 'CANCELLED']).toContain(request!.status);
    } else {
      // The cancellation won. The send refused in the canonical vocabulary and
      // left no half-sent quotation behind: still a draft, no pointer, no event.
      const error = sendResult.reason as unknown;
      expect(isQuotationSendError(error)).toBe(true);
      expect((error as { failure: string }).failure).toBe('REQUEST_NOT_SENDABLE');
      expect(version!.status).toBe('DRAFT');
      expect(version!.sent_at).toBeNull();
      expect(request!.current_quotation_id).toBeNull();
      expect(quotation!.current_version_id).toBeNull();
      expect(events).toBe(0);
      expect(request!.status).toBe('CANCELLED');
    }

    // Whichever way it went, the request moved exactly once out of UNDER_REVIEW
    // and never gained a duplicate or a self-edge.
    const transitions = (
      await context.disposable.client.db.execute<{ from_status: string; to_status: string }>(
        sql`select from_status, to_status from custom_request_transitions
             where custom_request_id = ${seeded.requestId} order by id asc`,
      )
    ).rows;
    expect(transitions[0]?.from_status).toBe('UNDER_REVIEW');
    for (const transition of transitions) {
      expect(transition.from_status).not.toBe(transition.to_status);
    }

    await Promise.all([setup.close(), holder.close(), sender.close(), moderator.close()]);
  }, 120_000);
});
