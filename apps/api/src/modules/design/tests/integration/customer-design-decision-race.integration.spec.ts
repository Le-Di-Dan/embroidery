/**
 * `APP6-B11` §17–§19 — the three races a design decision owns, on real
 * independent PostgreSQL connections.
 *
 * ### Deterministic, and each runs once
 *
 * Every case follows the shape `APP6-B03` and `APP6-B05` established. A third
 * connection takes the contended row's lock first and holds it, so both
 * contenders are guaranteed to reach their own `FOR UPDATE` before either can
 * write. The suite then waits for a **real condition** — ungranted locks in
 * `pg_locks` — rather than for a duration, and releases the holder. Which of the
 * two wins is left to PostgreSQL and, where both orders are legal, is never
 * asserted; what is asserted is that whichever wins, the outcome is **whole**.
 *
 * There is no process-local mutex anywhere on the decision path, and there must
 * not be: one would be silent about the second API replica.
 *
 * ### The contended rows
 *
 * - **CC-04** (approval vs revision request) contends on the `custom_requests`
 *   row, which is where the delivered lock order puts both decisions first, and
 *   then on the `design_versions` row, which is the arbiter LC-08 names. First
 *   decision wins and the loser is `INVALID_TRANSITION`;
 * - **CC-02** (approval vs a superseding fact) contends on the
 *   `design_versions` row, and the approval's in-transaction eligibility check
 *   is what turns a committed-first supersession into
 *   `APPROVAL_VERSION_MISMATCH`;
 * - **CC-16** (approval vs grant revoke) contends on the `secure_access_grants`
 *   row. This is the case a pre-transaction authorization snapshot cannot
 *   decide, and the reason ADR-DB3-004 r9 exists.
 *
 * ### One honest note on CC-02's competing writer
 *
 * There is **no delivered application path that supersedes a `SENT_FOR_REVIEW`
 * version**: `TR-LC08-05` supersedes `REVISION_REQUESTED` predecessors only, and
 * GRD-004 refuses a second send while a review is open, so `APP6-B09` can never
 * be the competing writer here. The superseding write is therefore issued as a
 * direct row update from an independent connection, guarded by
 * `and status = 'SENT_FOR_REVIEW'` so it is a genuine committed-first race
 * rather than an unconditional overwrite.
 *
 * What that buys is real: a *real* committed fact racing the *real* delivered
 * approval through the *real* lock order, which is what GRD-004's in-transaction
 * eligibility check must survive. What it is honestly **not** is a second
 * delivered use case — none exists to be one, and CC-04 below is where two
 * delivered use cases genuinely contend.
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
import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import { PublishApp6AgreementsUseCase } from '../../../content/application/publish-app6-agreements.use-case';
import { ApproveDesignVersionUseCase } from '../../application/deciding/approve-design-version.use-case';
import { RequestDesignRevisionUseCase } from '../../application/deciding/request-design-revision.use-case';
import { EffectiveAgreementsReader } from '../../application/review/effective-agreements.reader';
import { CustomerDesignDecisionModule } from '../../customer-design-decision.module';
import { DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY } from '../../domain/review/design-approval-agreements.policy';
import { isDesignDecisionError } from '../../domain/review/design-decision.errors';
import type { DesignVersionId } from '../../domain/repositories/design-case.repository';

const MODULES = [RequestContextModule, AuditContextModule, CustomerDesignDecisionModule];

const TEST_PEPPERS: Readonly<Record<string, string>> = {
  VERIFICATION_CODE_SECRET_PEPPER: 'app6-b11-race-verification-pepper-0001',
  SECURE_LINK_TOKEN_SECRET_PEPPER: 'app6-b11-race-secure-link-pepper-0002',
};

const DOCUMENT_HASH = `sha256:${'b'.repeat(64)}`;
const FEEDBACK = 'Vui lòng dời logo sang trái.';

interface Seeded {
  readonly requestId: string;
  readonly customerId: string;
  readonly grantId: string;
  readonly token: string;
  readonly designCaseId: string;
  readonly versionId: DesignVersionId;
  readonly agreements: { readonly agreementVersionId: string; readonly contentHash: string }[];
}

describe('APP6-B11 decision races (integration)', () => {
  let context: ConcurrencyTestContext;
  const restore = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const [name, value] of Object.entries(TEST_PEPPERS)) {
      restore.set(name, process.env[name]);
      process.env[name] = value;
    }
    context = await createConcurrencyTestContext('app6-b11-race', MODULES);
  }, 300_000);

  afterAll(async () => {
    await context?.close();
    for (const [name, value] of restore) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function asRequest<T>(actor: ConcurrencyActor, work: () => Promise<T>): Promise<T> {
    return actor
      .get<RequestContextService>(RequestContextService)
      .run({ requestId: `app6-b11-race-${newId()}` }, work);
  }

  /** One request, one live link, one fresh step-up, one version awaiting decision. */
  async function seed(actor: ConcurrencyActor): Promise<Seeded> {
    const db = context.disposable.client.db;

    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`app6-b11-race-${adminId}@example.test`}, 'Race Admin', 'ACTIVE')
    `);

    const policies = actor.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
    const effectiveFrom = new Date('2020-01-01T00:00:00.000Z');
    await actor.inTransaction(async () => {
      for (const [configKey, value] of [
        [SECURE_LINK_RESOLVE_POLICY_KEY, { maxRequestsPerIpPerMinute: 600 }],
        [
          SECURE_GRANT_POLICY_KEY,
          { standardTtlSeconds: 7 * 24 * 60 * 60, stepUpWindowSeconds: 15 * 60 },
        ],
        [
          DESIGN_APPROVAL_AGREEMENTS_POLICY_KEY,
          { requiredAgreementTypes: ['PAYMENT_POLICY', 'RETURN_POLICY'] },
        ],
      ] as const) {
        await policies.ensureKey(configKey, 'APP6-B11 race fixture.');
        await policies.publishVersion({
          configKey,
          value,
          valueSchemaVersion: 1,
          effectiveFrom,
          createdByAdminId: adminId,
          reason: 'APP6-B11 race fixture.',
        });
      }
    });
    await actor.get<PublishApp6AgreementsUseCase>(PublishApp6AgreementsUseCase).publish(adminId);

    const customerId = newId();
    const contactPointId = newId();
    const contactValue = `app6b11race-${randomBytes(6).toString('hex')}@example.test`;
    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Race Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
         verified_at, verified_source)
      values (${contactPointId}, ${customerId}, 'EMAIL', ${contactValue}, ${contactValue},
              true, now(), 'APP6-B11 race fixture.')
    `);
    const challengeId = newId();
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
         status, expires_at, verified_at)
      values (${challengeId}, ${contactPointId}, 'EMAIL', ${contactValue}, 'STEP_UP',
              ${`race-step-up-digest-${challengeId}`}, 'VERIFIED',
              now() + interval '10 minutes', now())
    `);

    const requestId = newId();
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status)
      values (${requestId}, ${`REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`},
              ${customerId}, 'DESIGN_REVIEW')
    `);
    await db.execute(sql`
      insert into custom_request_quantity_breakdowns
        (id, custom_request_id, product_variant_id, size_label, quantity)
      values (${newId()}, ${requestId}, null, 'M', 20)
    `);
    const customerOwnedProductId = newId();
    await db.execute(sql`
      insert into customer_owned_products (id, custom_request_id, name)
      values (${customerOwnedProductId}, ${requestId}, 'Áo khoác của khách')
    `);

    const designCaseId = newId();
    await db.execute(sql`
      insert into design_cases (id, custom_request_id) values (${designCaseId}, ${requestId})
    `);
    await db.execute(sql`
      update custom_requests set current_design_case_id = ${designCaseId} where id = ${requestId}
    `);

    const versionId = newId();
    await db.execute(sql`
      insert into design_versions
        (id, design_case_id, version, status, design_document, document_schema_version,
         document_hash, sent_at, customer_owned_product_id, placement_side_label,
         placement_area_label, physical_width_mm, physical_height_mm)
      values (${versionId}, ${designCaseId}, 1, 'SENT_FOR_REVIEW',
              ${JSON.stringify({ schemaVersion: 2, elements: [] })}::jsonb, 2,
              ${DOCUMENT_HASH}, now(), ${customerOwnedProductId}, 'Mặt trước', 'Ngực trái',
              '120.00', '80.00')
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

    const effective = await actor
      .get<EffectiveAgreementsReader>(EffectiveAgreementsReader)
      .requireEffectiveSet();

    return {
      requestId,
      customerId,
      grantId,
      token,
      designCaseId,
      versionId: versionId as DesignVersionId,
      agreements: effective.map((agreement) => ({
        agreementVersionId: agreement.agreementVersionId,
        contentHash: agreement.contentHash,
      })),
    };
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
    if (isDesignDecisionError(error)) return error.failure;
    if (isSecureLinkError(error)) return error.code;
    throw error;
  }

  /** The complete state both decisions could have touched. */
  async function wholeStateOf(seeded: Seeded) {
    const [version] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from design_versions where id = ${seeded.versionId}`,
      )
    ).rows;
    const [request] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from custom_requests where id = ${seeded.requestId}`,
      )
    ).rows;
    return {
      versionStatus: version?.status,
      requestStatus: request?.status,
      reviews: await countOf(
        sql`select count(*)::text as count from design_reviews
             where design_version_id = ${seeded.versionId}`,
      ),
      snapshots: await countOf(
        sql`select count(*)::text as count from approval_snapshots
             where design_version_id = ${seeded.versionId}`,
      ),
      approvedTransitions: await countOf(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${seeded.requestId} and to_status = 'APPROVED'`,
      ),
      approvedEvents: await countOf(
        sql`select count(*)::text as count from outbox_events
             where event_type = 'design.approved'`,
      ),
      revisionEvents: await countOf(
        sql`select count(*)::text as count from outbox_events
             where event_type = 'design.revision-requested'`,
      ),
    };
  }

  it('CC-04 — an approval and a revision request at once: the first decision wins', async () => {
    await context.reset();
    const setup = await context.spawnActor('cc04-setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('cc04-holder');
    const approver = await context.spawnActor('cc04-approver');
    const reviser = await context.spawnActor('cc04-reviser');

    // The request row is where the delivered lock order puts both decisions
    // first, so holding it guarantees both contenders are blocked before either
    // can reach the version row that arbitrates the decision itself.
    const lock = await holdRowLock(
      holder,
      sql`select id from custom_requests where id = ${seeded.requestId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(approver, () =>
        approver.get<ApproveDesignVersionUseCase>(ApproveDesignVersionUseCase).approve({
          token: seeded.token,
          versionId: seeded.versionId,
          documentHash: DOCUMENT_HASH,
          acceptedAgreements: seeded.agreements,
        }),
      ),
      asRequest(reviser, () =>
        reviser.get<RequestDesignRevisionUseCase>(RequestDesignRevisionUseCase).requestRevision({
          token: seeded.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      ),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;
    const [approval, revision] = await attempts;

    // Exactly one wins. Which one is PostgreSQL's to decide and is not asserted.
    const winners = [approval, revision].filter((result) => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const loser = [approval, revision].find((result) => result.status === 'rejected');
    expect(failureCodeOf((loser as PromiseRejectedResult).reason)).toBe('INVALID_TRANSITION');

    const state = await wholeStateOf(seeded);
    // Exactly one decision record, whichever it was, and no partial writes from
    // the loser anywhere.
    expect(state.reviews).toBe(1);
    if (approval.status === 'fulfilled') {
      expect(state).toMatchObject({
        versionStatus: 'APPROVED',
        requestStatus: 'APPROVED',
        snapshots: 1,
        approvedTransitions: 1,
        approvedEvents: 1,
        revisionEvents: 0,
      });
    } else {
      expect(state).toMatchObject({
        versionStatus: 'REVISION_REQUESTED',
        // A revision request moves the design version only.
        requestStatus: 'DESIGN_REVIEW',
        snapshots: 0,
        approvedTransitions: 0,
        approvedEvents: 0,
        revisionEvents: 1,
      });
    }
  }, 180_000);

  it('CC-02 — a supersession that commits first defeats the approval', async () => {
    await context.reset();
    const setup = await context.spawnActor('cc02-setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('cc02-holder');
    const approver = await context.spawnActor('cc02-approver');
    const workshop = await context.spawnActor('cc02-workshop');

    // The design version row is CC-02's arbiter. Both contenders must take it:
    // the approval through `lockVersion`, the supersession through its UPDATE.
    const lock = await holdRowLock(
      holder,
      sql`select id from design_versions where id = ${seeded.versionId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(approver, () =>
        approver.get<ApproveDesignVersionUseCase>(ApproveDesignVersionUseCase).approve({
          token: seeded.token,
          versionId: seeded.versionId,
          documentHash: DOCUMENT_HASH,
          acceptedAgreements: seeded.agreements,
        }),
      ),
      // See the header: no delivered path supersedes a SENT_FOR_REVIEW version,
      // so the competing writer is a direct committed update on an independent
      // connection. It races the real approval through the real lock order.
      workshop.inTransaction(async () => {
        await workshop
          .get<DatabaseExecutor>(DatabaseExecutor)
          .current()
          .execute(
            sql`update design_versions set status = 'SUPERSEDED', superseded_at = now()
                 where id = ${seeded.versionId} and status = 'SENT_FOR_REVIEW'`,
          );
      }),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;
    const [approval] = await attempts;

    const state = await wholeStateOf(seeded);
    if (approval.status === 'fulfilled') {
      // The approval got there first. Its evidence is immutable, and the later
      // supersession found no `SENT_FOR_REVIEW` row to move.
      expect(state).toMatchObject({
        versionStatus: 'APPROVED',
        requestStatus: 'APPROVED',
        reviews: 1,
        snapshots: 1,
        approvedEvents: 1,
      });
    } else {
      // The supersession committed first, so GRD-007 refuses inside the
      // approval's transaction and no stale snapshot survives.
      expect(failureCodeOf(approval.reason)).toBe('APPROVAL_VERSION_MISMATCH');
      expect(state).toMatchObject({
        versionStatus: 'SUPERSEDED',
        requestStatus: 'DESIGN_REVIEW',
        reviews: 0,
        snapshots: 0,
        approvedTransitions: 0,
        approvedEvents: 0,
      });
    }
  }, 180_000);

  it('CC-16 — a revoke that commits first defeats the approval, with zero writes', async () => {
    await context.reset();
    const setup = await context.spawnActor('cc16-setup');
    const seeded = await seed(setup);

    const holder = await context.spawnActor('cc16-holder');
    const approver = await context.spawnActor('cc16-approver');
    const revoker = await context.spawnActor('cc16-revoker');

    // The grant row. This is the case a pre-transaction authorization snapshot
    // cannot decide: the outer admission already succeeded for both contenders,
    // and only the in-transaction re-check under this lock can see the revoke.
    const lock = await holdRowLock(
      holder,
      sql`select id from secure_access_grants where id = ${seeded.grantId} for update`,
    );

    const attempts = Promise.allSettled([
      asRequest(approver, () =>
        approver.get<ApproveDesignVersionUseCase>(ApproveDesignVersionUseCase).approve({
          token: seeded.token,
          versionId: seeded.versionId,
          documentHash: DOCUMENT_HASH,
          acceptedAgreements: seeded.agreements,
        }),
      ),
      revoker.inTransaction(async () => {
        await revoker
          .get<DatabaseExecutor>(DatabaseExecutor)
          .current()
          .execute(
            sql`update secure_access_grants
                   set status = 'REVOKED', revoked_at = now(),
                       revoke_reason = 'APP6-B11 race fixture.'
                 where id = ${seeded.grantId} and status = 'ACTIVE'`,
          );
      }),
    ]);

    await waitForBlockedBackends(2);
    lock.release();
    await lock.done;
    const [approval] = await attempts;

    const state = await wholeStateOf(seeded);
    if (approval.status === 'fulfilled') {
      // The approval committed first. The later revoke does not, and must not,
      // mutate or delete the historical evidence.
      expect(state).toMatchObject({ versionStatus: 'APPROVED', snapshots: 1, approvedEvents: 1 });
      const [snapshot] = (
        await context.disposable.client.db.execute<{ grant_id: string }>(
          sql`select grant_id from approval_snapshots where design_version_id = ${seeded.versionId}`,
        )
      ).rows;
      // The grant reference stays, revoked or not: it is evidence of how the
      // approval was authorised, not a live capability.
      expect(snapshot?.grant_id).toBe(seeded.grantId);
    } else {
      expect(failureCodeOf(approval.reason)).toBe('SECURE_LINK_UNAVAILABLE');
      expect(state).toMatchObject({
        versionStatus: 'SENT_FOR_REVIEW',
        requestStatus: 'DESIGN_REVIEW',
        reviews: 0,
        snapshots: 0,
        approvedTransitions: 0,
        approvedEvents: 0,
      });
    }
  }, 180_000);
});
