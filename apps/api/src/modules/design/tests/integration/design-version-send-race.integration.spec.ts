/**
 * `APP6-B09` §12 — CC-03: two sends on one design case, at the same moment, on
 * real independent PostgreSQL connections.
 *
 * ### It is deterministic, and it runs once
 *
 * A third connection takes the request's row lock first and holds it. Both
 * senders then start their real transactions and block on the same `SELECT …
 * FOR UPDATE`. The suite waits for a **real condition** — two ungranted locks in
 * `pg_locks` — rather than for a duration, then releases the holder. Which of
 * the two wins is left to PostgreSQL and is never asserted; what is asserted is
 * that exactly one whole outcome exists.
 *
 * ### Two arbiters, and the database is the one that matters
 *
 * `GRD-004` is enforced physically by `uq_design_versions__case__sent_for_review`.
 * The use case also reads `findVersionInReview` first, but that read is
 * diagnostics: it makes the loser's refusal legible, it is not what makes the
 * rule true. The second test here proves the index alone — it calls
 * `DesignCaseRepository.sendForReview` directly, with no preflight anywhere in
 * the call stack, and shows the rejection arrives already carrying
 * `REVIEW_ALREADY_ACTIVE` from the delivered constraint catalog. So a defect
 * that deleted the preflight would still leave one active review.
 *
 * There is no process-local mutex anywhere on the send path, and there must not
 * be: one would be silent about the second API replica.
 */
import { randomBytes } from 'node:crypto';
import { newId, isPersistenceError } from '@embroidery/database';
import { DatabaseExecutor } from '@embroidery/persistence';
import { NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV } from '@embroidery/notification-delivery';
import { sql } from 'drizzle-orm';

import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { createConcurrencyTestContext } from '../../../../tests/integration/db8-concurrency-context';
import type {
  ConcurrencyActor,
  ConcurrencyTestContext,
} from '../../../../tests/integration/db8-concurrency-context';
import {
  SECURE_LINK_TOKEN_PEPPER_ENV,
  VERIFICATION_CODE_PEPPER_ENV,
} from '../../../customer/config/app4-secret-pepper.config';
import { SendDesignVersionUseCase } from '../../application/sending/send-design-version.use-case';
import { isDesignVersionSendError } from '../../domain/design-version-send.errors';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseId,
  type DesignCaseRepository,
  type DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import { DesignVersionSendModule } from '../../design-version-send.module';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';

const MODULES = [RequestContextModule, AuditContextModule, DesignVersionSendModule];

interface Seeded {
  readonly requestId: CustomRequestId;
  readonly designCaseId: DesignCaseId;
  readonly firstVersionId: DesignVersionId;
  readonly secondVersionId: DesignVersionId;
  readonly adminId: string;
}

/** Geometry the seeded Side, Area and document all agree on. */
const GEOMETRY = {
  canvasWidthPx: 1000,
  canvasHeightPx: 1200,
  physicalWidthMm: 400,
  physicalHeightMm: 480,
  pxPerMm: 2.5,
} as const;

describe('APP6-B09 concurrent send (integration)', () => {
  let context: ConcurrencyTestContext;
  const previous = {
    envelope: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    codePepper: process.env[VERIFICATION_CODE_PEPPER_ENV],
    linkPepper: process.env[SECURE_LINK_TOKEN_PEPPER_ENV],
  };

  beforeAll(async () => {
    // Synthetic values generated per run, set for the duration of the suite. No
    // `.env` file is read, written or consulted, and no credential is rotated.
    process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = randomBytes(32).toString('base64');
    process.env[VERIFICATION_CODE_PEPPER_ENV] = `code-${randomBytes(24).toString('hex')}`;
    process.env[SECURE_LINK_TOKEN_PEPPER_ENV] = `link-${randomBytes(24).toString('hex')}`;
    context = await createConcurrencyTestContext('app6-b09-race', MODULES);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
    restore(NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV, previous.envelope);
    restore(VERIFICATION_CODE_PEPPER_ENV, previous.codePepper);
    restore(SECURE_LINK_TOKEN_PEPPER_ENV, previous.linkPepper);
  });

  function asAdmin<T>(actor: ConcurrencyActor, adminId: string, work: () => Promise<T>) {
    const requestContext = actor.get<RequestContextService>(RequestContextService);
    return requestContext.run({ requestId: newId() }, () => {
      requestContext.bindActor({ kind: 'ADMIN', adminId });
      return work();
    });
  }

  /**
   * A DIGITIZING catalog request with a design case carrying **two** eligible
   * drafts, both frozen onto the same authoritative placement.
   *
   * Two sendable drafts on one case is the scenario CC-03 is about, and it is
   * reachable precisely because the send has no current-version guard: LC-08
   * states none, so both drafts are candidates and GRD-004 is what decides
   * between them.
   */
  async function seed(): Promise<Seeded> {
    const db = context.disposable.client.db;
    const adminId = newId();
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`b09-race-${adminId}@example.test`}, 'B09 Race Operator', 'ACTIVE')
    `);
    const customerId = newId();
    await db.execute(sql`
      insert into customers (id, display_name, verified_at) values (${customerId}, 'Race', now())
    `);

    const categoryId = newId();
    const productId = newId();
    const variantId = newId();
    const assetId = newId();
    const sideId = newId();
    const areaId = newId();
    await db.execute(sql`
      insert into categories (id, name, slug, display_order, status, is_indexable)
      values (${categoryId}, 'Áo', ${`ao-${categoryId.slice(0, 8)}`}, 1, 'PUBLISHED', true)
    `);
    await db.execute(sql`
      insert into products (id, category_id, name, slug, base_price_amount, currency_code, status,
                            is_display_out_of_stock, display_order, is_indexable)
      values (${productId}, ${categoryId}, 'Áo thun', ${`ao-${productId.slice(0, 8)}`}, '150000',
              'VND', 'PUBLISHED', false, 1, true)
    `);
    await db.execute(sql`
      insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
      values (${variantId}, ${productId}, 'Trắng', 'L', 1, true)
    `);
    await db.execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
      values (${assetId}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${assetId}.png`}, 'image/png', 1024,
              'ACCEPTED')
    `);
    await db.execute(sql`
      insert into product_sides (id, product_id, code, name, background_asset_id, image_width_px,
                                 image_height_px, physical_width_mm, physical_height_mm, px_per_mm,
                                 display_order)
      values (${sideId}, ${productId}, 'front', 'Front', ${assetId}, ${GEOMETRY.canvasWidthPx},
              ${GEOMETRY.canvasHeightPx}, ${GEOMETRY.physicalWidthMm}, ${GEOMETRY.physicalHeightMm},
              ${GEOMETRY.pxPerMm}, 1)
    `);
    await db.execute(sql`
      insert into embroidery_areas (id, product_side_id, code, name, bound_x_px, bound_y_px,
                                    bound_width_px, bound_height_px, display_order)
      values (${areaId}, ${sideId}, 'chest', 'Chest', 100, 150, 300, 200, 1)
    `);

    const sessionId = newId();
    const requestId = newId() as CustomRequestId;
    await db.execute(sql`
      insert into custom_requests (id, code, customer_id, status, product_id, product_variant_id)
      values (${requestId}, ${`REQ-${randomBytes(8).toString('hex').slice(0, 10).toUpperCase()}`},
              ${customerId}, 'DIGITIZING', ${productId}, ${variantId})
    `);
    await db.execute(sql`
      insert into design_sessions (id, session_secret_hash, product_id, product_variant_id,
                                   product_side_id, embroidery_area_id, design_document,
                                   document_schema_version, autosave_revision, status, expires_at,
                                   last_activity_at, submitted_request_id)
      values (${sessionId}, ${`hash-${sessionId}`}, ${productId}, ${variantId}, ${sideId},
              ${areaId}, ${JSON.stringify({ schemaVersion: 1, elements: [] })}::jsonb, 1, 0,
              'SUBMITTED', now() + interval '30 days', now(), ${requestId})
    `);
    await db.execute(sql`
      update custom_requests set submitted_session_id = ${sessionId} where id = ${requestId}
    `);

    const designCaseId = newId() as DesignCaseId;
    await db.execute(sql`
      insert into design_cases (id, custom_request_id) values (${designCaseId}, ${requestId})
    `);
    await db.execute(sql`
      update custom_requests set current_design_case_id = ${designCaseId} where id = ${requestId}
    `);

    const document = {
      schemaVersion: 1,
      placement: {
        productSideId: sideId,
        embroideryAreaId: areaId,
        canvasWidthPx: GEOMETRY.canvasWidthPx,
        canvasHeightPx: GEOMETRY.canvasHeightPx,
        physicalWidthMm: GEOMETRY.physicalWidthMm,
        physicalHeightMm: GEOMETRY.physicalHeightMm,
        pxPerMm: GEOMETRY.pxPerMm,
      },
      elements: [],
    };
    const versionIds: string[] = [];
    for (const version of [1, 2]) {
      const id = newId();
      versionIds.push(id);
      await db.execute(sql`
        insert into design_versions (id, design_case_id, version, status, design_document,
                                     document_schema_version, product_id, product_variant_id,
                                     product_side_id, embroidery_area_id, physical_width_mm,
                                     physical_height_mm)
        values (${id}, ${designCaseId}, ${version}, 'DRAFT', ${JSON.stringify(document)}::jsonb, 1,
                ${productId}, ${variantId}, ${sideId}, ${areaId},
                ${String(GEOMETRY.physicalWidthMm)}, ${String(GEOMETRY.physicalHeightMm)})
      `);
    }
    // The pointer names the newest authored draft, as `APP6-B08` leaves it. It
    // has no part in what follows: both drafts are sendable regardless, and the
    // send preserves it.
    await db.execute(sql`
      update design_cases set current_version_id = ${versionIds[1]} where id = ${designCaseId}
    `);

    return {
      requestId,
      designCaseId,
      firstVersionId: versionIds[0] as DesignVersionId,
      secondVersionId: versionIds[1] as DesignVersionId,
      adminId,
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

  async function countOf(query: ReturnType<typeof sql>): Promise<number> {
    const [row] = (await context.disposable.client.db.execute<{ count: string }>(query)).rows;
    return Number(row?.count ?? -1);
  }

  it('CC-03 — two versions sent at once: exactly one review, one loser', async () => {
    await context.reset();
    const seeded = await seed();

    const holder = await context.spawnActor('holder');
    const first = await context.spawnActor('sender-one');
    const second = await context.spawnActor('sender-two');

    let releaseHolder: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });

    // A third connection takes the request's row lock first, so both senders are
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
      asAdmin(first, seeded.adminId, () =>
        first
          .get<SendDesignVersionUseCase>(SendDesignVersionUseCase)
          .send({ customRequestId: seeded.requestId, versionId: seeded.firstVersionId }),
      ),
      asAdmin(second, seeded.adminId, () =>
        second
          .get<SendDesignVersionUseCase>(SendDesignVersionUseCase)
          .send({ customRequestId: seeded.requestId, versionId: seeded.secondVersionId }),
      ),
    ]);

    await waitForBlockedBackends(2);
    releaseHolder();
    await holding;

    const results = await attempts;
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    // Exactly one send committed. The other refused in the canonical vocabulary,
    // whichever way PostgreSQL ordered them.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = (rejected[0] as PromiseRejectedResult).reason as unknown;
    expect(isDesignVersionSendError(failure)).toBe(true);
    expect((failure as { failure: string }).failure).toBe('REVIEW_ALREADY_ACTIVE');

    // One active review row for the case, total — the invariant GRD-004 names.
    expect(
      await countOf(sql`select count(*)::text as count from design_versions
                         where design_case_id = ${seeded.designCaseId}
                           and status = 'SENT_FOR_REVIEW'`),
    ).toBe(1);

    // And the request, the audit trail and the outbox match only the winner.
    expect(
      await countOf(sql`select count(*)::text as count from custom_request_transitions
                         where custom_request_id = ${seeded.requestId}`),
    ).toBe(1);
    expect(
      await countOf(sql`select count(*)::text as count from audit_events
                         where action = 'design_version.sent'`),
    ).toBe(1);
    expect(
      await countOf(sql`select count(*)::text as count from outbox_events
                         where event_type = 'design.review-ready'`),
    ).toBe(1);
    const [request] = (
      await context.disposable.client.db.execute<{ status: string }>(
        sql`select status from custom_requests where id = ${seeded.requestId}`,
      )
    ).rows;
    expect(request?.status).toBe('DESIGN_REVIEW');

    await Promise.all([holder.close(), first.close(), second.close()]);
  }, 120_000);

  it('the partial unique index alone refuses a second active review', async () => {
    await context.reset();
    const seeded = await seed();
    const actor = await context.spawnActor('index-only');

    // No preflight anywhere in this call stack: the repository is driven
    // directly, so the only thing that can reject the second write is
    // `uq_design_versions__case__sent_for_review`.
    const cases = actor.get<DesignCaseRepository>(DESIGN_CASE_REPOSITORY);
    const hash = `sha256:${'b'.repeat(64)}`;
    await actor.inTransaction(() => cases.sendForReview(seeded.firstVersionId, hash, new Date()));

    const rejection = await actor
      .inTransaction(() => cases.sendForReview(seeded.secondVersionId, hash, new Date()))
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(isPersistenceError(rejection)).toBe(true);
    // The delivered constraint catalog resolves that one index name to this
    // code, which is what lets the use case map it narrowly — every other
    // unique arbiter still reports a generic duplicate.
    expect((rejection as { code: string }).code).toBe('REVIEW_ALREADY_ACTIVE');
    expect((rejection as { message: string }).message).not.toContain('uq_design_versions');

    expect(
      await countOf(sql`select count(*)::text as count from design_versions
                         where design_case_id = ${seeded.designCaseId}
                           and status = 'SENT_FOR_REVIEW'`),
    ).toBe(1);

    await actor.close();
  }, 120_000);
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
