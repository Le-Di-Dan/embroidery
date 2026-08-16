/**
 * `APP5-B05` §6 — two Admins moderating one request, against real, independent
 * PostgreSQL connections.
 *
 * The example the checkpoint names, exactly: a request at `UNDER_REVIEW`, one
 * operator asking for clarification and another rejecting it, at the same
 * moment. At most one may take effect **from that source state**, the loser must
 * receive the canonical stale outcome, and the loser's note and outbox fact must
 * not exist — a rejection whose note landed but whose move did not would be a
 * decision the history cannot explain.
 *
 * ### It is deterministic, and it runs once
 *
 * A third connection takes the request's row lock first and holds it. Both
 * moderators then start their real transactions: each reads the current state —
 * an unblocked `SELECT`, so both see `UNDER_REVIEW` — and each blocks on
 * `SELECT … FOR UPDATE`. The suite waits for a **real condition** (two ungranted
 * locks in `pg_locks`) rather than for a duration, then releases the holder. The
 * two are then serialized by PostgreSQL: whichever acquires first applies its
 * decision, and the other acquires a row that has left the state it judged.
 *
 * That removes the timing from the assertion, so the race is run **once** and
 * the suite does not loop hoping to catch an interleaving. Which of the two wins
 * is left to the database and is never asserted.
 *
 * The arbiter is the row lock and the state comparison performed under it. There
 * is no process-local mutex anywhere in the moderation path, and there must not
 * be: one would be silent about the second API replica.
 */
import { newId } from '@embroidery/database';
import { DatabaseExecutor } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { createAdminActor } from '../../../../platform/actor-context/request-actor';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import { CustomRequestModerationModule } from '../../custom-request-moderation.module';
import { TransitionCustomRequestUseCase } from '../../application/moderation/transition-custom-request.use-case';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';

const CLARIFY_INTERNAL = 'Nội bộ: cần thêm ảnh.';
const CLARIFY_CUSTOMER = 'Bạn gửi giúp mình ảnh rõ hơn nhé.';
const REJECT_INTERNAL = 'Nội bộ: trùng yêu cầu cũ.';
const REJECT_CUSTOMER = 'Rất tiếc, mình chưa nhận được yêu cầu này.';

describe('APP5-B05 competing moderation transitions (integration)', () => {
  let context: ConcurrencyTestContext;

  beforeAll(async () => {
    context = await createConcurrencyTestContext('app5-b05-race', [
      RequestContextModule,
      CustomRequestModerationModule,
    ]);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  /** Seeds the world one `UNDER_REVIEW` request needs, and returns its id. */
  async function seedRequest(): Promise<{ requestId: string; adminId: string }> {
    const db = context.disposable.client.db;
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b05-race-${adminId}@example.test`}, 'B05 Race Operator', 'ACTIVE')
    `);

    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Nguyễn Bảy', now())
    `);

    const requestId = newId();
    const code = `REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${requestId}, ${code}, ${customerId}, 'UNDER_REVIEW')
    `);

    return { requestId, adminId };
  }

  /** Runs one moderator's real transition, inside a real request context. */
  function moderate(
    actor: ConcurrencyActor,
    adminId: string,
    requestId: string,
    command: {
      to: 'NEEDS_CLARIFICATION' | 'REJECTED';
      internalReason: string;
      customerVisibleReason: string;
      moderationNoteKind: 'CLARIFY' | 'REJECT';
    },
  ): Promise<unknown> {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    const useCase = actor.get<TransitionCustomRequestUseCase>(TransitionCustomRequestUseCase);

    return requestContext.run({ requestId: newId() }, () => {
      // The same binding `AuthenticatedAdminGuard` performs in production; the
      // use case reads the operator from here and from nowhere else.
      requestContext.bindActor(createAdminActor(adminId));
      return useCase.transition({
        requestId: requestId as CustomRequestId,
        to: command.to,
        internalReason: command.internalReason,
        customerVisibleReason: command.customerVisibleReason,
        moderationNote: `Ghi chú của ${command.to}.`,
        moderationNoteKind: command.moderationNoteKind,
      });
    });
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
    return Number(row?.count ?? 0);
  }

  it('CC — UNDER_REVIEW clarified and rejected at once: one winner, one stale loser, one set of effects', async () => {
    await context.reset();
    const { requestId, adminId } = await seedRequest();

    const holder = await context.spawnActor('holder');
    const clarifier = await context.spawnActor('clarifier');
    const rejecter = await context.spawnActor('rejecter');

    let releaseHolder: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    // A third connection takes the row lock first, so both moderators are
    // guaranteed to read `UNDER_REVIEW` before either can write.
    const holding = holder.inTransaction(async () => {
      const executor = holder.get<DatabaseExecutor>(DatabaseExecutor);
      await executor
        .current()
        .execute(sql`select id from custom_requests where id = ${requestId} for update`);
      locked();
      await held;
    });
    await lockTaken;

    const attempts = Promise.allSettled([
      moderate(clarifier, adminId, requestId, {
        to: 'NEEDS_CLARIFICATION',
        internalReason: CLARIFY_INTERNAL,
        customerVisibleReason: CLARIFY_CUSTOMER,
        moderationNoteKind: 'CLARIFY',
      }),
      moderate(rejecter, adminId, requestId, {
        to: 'REJECTED',
        internalReason: REJECT_INTERNAL,
        customerVisibleReason: REJECT_CUSTOMER,
        moderationNoteKind: 'REJECT',
      }),
    ]);

    await waitForBlockedBackends(2);
    releaseHolder();
    await holding;

    const [first, second] = await attempts;
    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    const rejected = [first, second].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser is told it lost, in the canonical vocabulary — not that its
    // decision was malformed, and not with a 500.
    const failure = (rejected[0] as PromiseRejectedResult).reason as { failure?: string };
    expect(failure.failure).toBe('REQUEST_TRANSITION_STALE');

    // Exactly one move out of UNDER_REVIEW, and the sequence stays consistent.
    const transitions = (
      await context.disposable.client.db.execute<{ from_status: string; to_status: string }>(
        sql`select from_status, to_status from custom_request_transitions
            where custom_request_id = ${requestId} order by id asc`,
      )
    ).rows;
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.from_status).toBe('UNDER_REVIEW');

    const winningStatus = transitions[0]?.to_status;
    expect(['NEEDS_CLARIFICATION', 'REJECTED']).toContain(winningStatus);

    const [request] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from custom_requests where id = ${requestId}`,
      )
    ).rows;
    expect(request?.status).toBe(winningStatus);

    // Only the winner's note and only the winner's event exist. The loser's
    // required note and outbox fact rolled back with its transition.
    expect(
      await countOf(
        sql`select count(*)::text as count from request_moderation_notes
            where custom_request_id = ${requestId}`,
      ),
    ).toBe(1);
    const [note] = (
      await context.disposable.client.db.execute<{ kind: string }>(
        sql`select kind from request_moderation_notes where custom_request_id = ${requestId}`,
      )
    ).rows;
    expect(note?.kind).toBe(winningStatus === 'REJECTED' ? 'REJECT' : 'CLARIFY');

    const events = (
      await context.disposable.client.db.execute<{ event_type: string }>(
        sql`select event_type from outbox_events where aggregate_id = ${requestId}`,
      )
    ).rows;
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe(
      winningStatus === 'REJECTED' ? 'request.rejected' : 'request.clarification-requested',
    );
  }, 120_000);
});
