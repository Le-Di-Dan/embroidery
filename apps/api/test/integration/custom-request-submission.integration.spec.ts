/**
 * `APP5-B01` — `POST /api/public/custom-requests` over real HTTP.
 *
 * The whole application, the real controller, the real global pipe and exception
 * filter, the real repositories, the real APP4 grant issuer and the real outbox,
 * against a disposable PostgreSQL with every migration applied. Nothing is
 * mocked except one deliberately failing recorder, which exists to prove the
 * rollback claim and could not be proven any other way.
 *
 * The suite is organised around the nine consequences `G01-D11` says "exactly
 * one request" protects, because a submission test that only asserts a `201`
 * proves the happy path and none of the invariants. Every way the endpoint
 * *refuses* is the sibling `-refusals` suite: a different review object, and the
 * split that keeps both inside the 600-line test limit.
 *
 * `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` (`APP5-R00` risk 4) is satisfied by
 * `applyDesignSessionTestEnv` inside `createApiIntegrationContext`, which
 * supplies `DESIGN_SESSION_SECRET_PEPPER` as a synthetic test value. No
 * credential is rotated and nothing is written to `.env`.
 */
import { Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import {
  RequestSubmissionRecorder,
  type RecordSubmissionInput,
} from '../../src/modules/order/application/request-submission.recorder';
import {
  createApiIntegrationContext,
  type ApiIntegrationTestContext,
} from '../support/api-integration-context';
import {
  applyApp5SubmissionSecretEnv,
  publishGrantPolicy,
  seedCustomerAsset,
  seedSubmissionContext,
  submissionHarness,
  submitted,
  type SubmissionEnvelope,
  type SubmissionFixture,
} from '../support/custom-request-submission-fixture';

/**
 * The **last** step of the transaction, made to fail on demand.
 *
 * The rollback claim is about the final write: if the outbox append throws, the
 * request, its COP row, its bindings, its design case, the session move, the
 * grant and its notification intent must all disappear with it. Failing earlier
 * would prove much less. It subclasses the real recorder rather than replacing
 * it, so every other case in this suite still exercises the genuine append.
 */
let recorderFails = false;

@Injectable()
class ProbeSubmissionRecorder extends RequestSubmissionRecorder {
  constructor(outbox: OutboxEventStore) {
    super(outbox);
  }

  override async record(input: RecordSubmissionInput): Promise<void> {
    if (recorderFails) {
      throw new Error('APP5-B01 rollback probe.');
    }
    await super.record(input);
  }
}

describe('APP5-B01 custom request submission (API)', () => {
  let context: ApiIntegrationTestContext;
  let restoreSecretEnv: () => void;
  const { post, catalogBody, countOf, requestCount } = submissionHarness(() => context);

  beforeAll(async () => {
    restoreSecretEnv = applyApp5SubmissionSecretEnv();
    context = await createApiIntegrationContext('app5_b01_submit', (builder) =>
      builder.overrideProvider(RequestSubmissionRecorder).useClass(ProbeSubmissionRecorder),
    );
    await publishGrantPolicy(context.app, context.database);
  }, 240_000);

  afterAll(async () => {
    await context?.close();
    restoreSecretEnv?.();
  });

  beforeEach(() => {
    recorderFails = false;
  });

  const db = () => context.database.client.db;

  describe('a catalog submission', () => {
    let fixture: SubmissionFixture;
    let body: SubmissionEnvelope;

    beforeAll(async () => {
      fixture = await seedSubmissionContext(context.database, { label: 'catalog' });
      const response = await post(fixture, catalogBody(fixture)).expect(201);
      body = submitted(response.body);
    });

    it('returns the request id, its code and NEW — and nothing else', () => {
      expect(body.code).toBe('CUSTOM_REQUEST_SUBMITTED');
      expect(Object.keys(body.data as object).sort()).toEqual(['code', 'requestId', 'status']);
      expect(body.data?.status).toBe('NEW');
      expect(body.data?.code).toMatch(/^REQ-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    });

    it('returns no grant token, secure link, customer, contact or session secret', () => {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(fixture.customerId);
      expect(serialized).not.toContain(fixture.sessionSecret);
      expect(serialized).not.toContain(fixture.challengeId);
      expect(serialized).not.toContain('@example.com');
    });

    it('writes one request at NEW with server-set session provenance and no COP row', async () => {
      const rows = await db().execute<{
        status: string;
        product_id: string;
        product_variant_id: string;
        submitted_session_id: string;
        cop: string;
      }>(sql`
        select r.status, r.product_id, r.product_variant_id, r.submitted_session_id,
               (select count(*) from customer_owned_products c where c.custom_request_id = r.id)
                 as cop
        from custom_requests r where r.id = ${body.data?.requestId ?? ''}
      `);
      expect(rows.rows[0]).toMatchObject({
        status: 'NEW',
        product_id: fixture.productId,
        product_variant_id: fixture.productVariantId,
        submitted_session_id: fixture.designSessionId,
        cop: '0',
      });
    });

    it('keys the quantity line by the request variant, not by anything the client sent', async () => {
      const rows = await db().execute<{
        product_variant_id: string;
        size_label: string;
        quantity: number;
      }>(sql`
        select product_variant_id, size_label, quantity from custom_request_quantity_breakdowns
        where custom_request_id = ${body.data?.requestId ?? ''}
      `);
      expect(rows.rows).toEqual([
        { product_variant_id: fixture.productVariantId, size_label: 'M', quantity: 10 },
      ]);
    });

    it('submits the actual design session and links it back to the request', async () => {
      const rows = await db().execute<{ status: string; submitted_request_id: string }>(sql`
        select status, submitted_request_id from design_sessions where id = ${fixture.designSessionId}
      `);
      expect(rows.rows[0]).toEqual({
        status: 'SUBMITTED',
        submitted_request_id: body.data?.requestId,
      });
    });

    it('creates the design case header and no design version', async () => {
      expect(
        await countOf(
          sql`select count(*) as count from design_cases where custom_request_id = ${body.data?.requestId ?? ''}`,
        ),
      ).toBe(1);
      expect(
        await countOf(sql`
          select count(*) as count from design_versions v
          join design_cases c on c.id = v.design_case_id
          where c.custom_request_id = ${body.data?.requestId ?? ''}
        `),
      ).toBe(0);
    });

    it('issues exactly one ACTIVE REQUEST_ACCESS grant for this request', async () => {
      const rows = await db().execute<{ scope_kind: string; status: string; customer_id: string }>(
        sql`select scope_kind, status, customer_id from secure_access_grants
            where custom_request_id = ${body.data?.requestId ?? ''}`,
      );
      expect(rows.rows).toEqual([
        { scope_kind: 'REQUEST_ACCESS', status: 'ACTIVE', customer_id: fixture.customerId },
      ]);
    });

    it('appends one durable request.submitted outbox event, undelivered', async () => {
      const rows = await db().execute<{ event_type: string; status: string; payload: unknown }>(sql`
        select event_type, status, payload from outbox_events
        where aggregate_kind = 'CUSTOM_REQUEST' and aggregate_id = ${body.data?.requestId ?? ''}
      `);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.event_type).toBe('request.submitted');
      expect(rows.rows[0]?.status).toBe('PENDING');
      // Minimal and versioned: a consumer reads the request row for anything
      // else, so nothing here can go stale or leak.
      expect(rows.rows[0]?.payload).toEqual({
        schemaVersion: 1,
        customRequestId: body.data?.requestId,
        subjectBranch: 'CATALOG',
      });
    });

    it('writes no transition row for the creation (G01-D05)', async () => {
      expect(
        await countOf(sql`
          select count(*) as count from custom_request_transitions
          where custom_request_id = ${body.data?.requestId ?? ''}
        `),
      ).toBe(0);
    });
  });

  describe('a customer-owned submission', () => {
    let fixture: SubmissionFixture;
    let copImage: string;
    let reference: string;
    let requestId: string;

    beforeAll(async () => {
      fixture = await seedSubmissionContext(context.database, { label: 'cop' });
      copImage = await seedCustomerAsset(context.database, { customerId: fixture.customerId });
      reference = await seedCustomerAsset(context.database, { customerId: fixture.customerId });
      const response = await post(
        fixture,
        {
          customerOwnedProduct: {
            name: 'Áo khoác của tôi',
            description: 'Bạc màu ở tay áo',
            physicalWidthMm: '520.00',
          },
          breakdown: [{ sizeLabel: 'Freesize', quantity: 1 }],
          assets: [
            { assetId: copImage, role: 'COP_IMAGE' },
            { assetId: reference, role: 'REFERENCE' },
          ],
        },
        false,
      ).expect(201);
      requestId = submitted(response.body).data?.requestId ?? '';
    });

    it('writes the request with no catalog subject and no session provenance', async () => {
      const rows = await db().execute<{
        product_id: string | null;
        product_variant_id: string | null;
        submitted_session_id: string | null;
        status: string;
      }>(sql`
        select product_id, product_variant_id, submitted_session_id, status
        from custom_requests where id = ${requestId}
      `);
      expect(rows.rows[0]).toEqual({
        product_id: null,
        product_variant_id: null,
        submitted_session_id: null,
        status: 'NEW',
      });
    });

    it('writes exactly one COP child carrying the supplied dimensions', async () => {
      const rows = await db().execute<{ name: string; physical_width_mm: string }>(sql`
        select name, physical_width_mm from customer_owned_products
        where custom_request_id = ${requestId}
      `);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.name).toBe('Áo khoác của tôi');
      expect(Number(rows.rows[0]?.physical_width_mm)).toBe(520);
    });

    it('binds both assets under their roles', async () => {
      const rows = await db().execute<{ asset_id: string; role: string }>(sql`
        select asset_id, role from custom_request_assets where custom_request_id = ${requestId}
        order by role
      `);
      expect(rows.rows).toEqual([
        { asset_id: copImage, role: 'COP_IMAGE' },
        { asset_id: reference, role: 'REFERENCE' },
      ]);
    });

    it('leaves the design session of another fixture untouched and creates its own case', async () => {
      expect(
        await countOf(
          sql`select count(*) as count from design_cases where custom_request_id = ${requestId}`,
        ),
      ).toBe(1);
      expect(
        await countOf(sql`select count(*) as count from design_sessions where status = 'SUBMITTED'
                          and submitted_request_id = ${requestId}`),
      ).toBe(0);
    });

    it('records the branch on the outbox event', async () => {
      const rows = await db().execute<{ payload: { subjectBranch: string } }>(sql`
        select payload from outbox_events
        where aggregate_kind = 'CUSTOM_REQUEST' and aggregate_id = ${requestId}
      `);
      expect(rows.rows[0]?.payload.subjectBranch).toBe('COP');
    });
  });

  describe('idempotency (G01 §4)', () => {
    it('replays the same result for the same challenge and fingerprint', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'replay' });
      const first = await post(fixture, catalogBody(fixture)).expect(201);
      // The session is SUBMITTED now, so a second *execution* could not succeed
      // — which is exactly why an honest replay must not execute at all.
      const second = await post(fixture, catalogBody(fixture)).expect(201);

      expect(submitted(second.body).data).toEqual(submitted(first.body).data);
      expect(await requestCount(fixture.customerId)).toBe(1);

      const requestId = submitted(first.body).data?.requestId ?? '';
      expect(
        await countOf(
          sql`select count(*) as count from design_cases where custom_request_id = ${requestId}`,
        ),
      ).toBe(1);
      expect(
        await countOf(sql`select count(*) as count from secure_access_grants
                          where custom_request_id = ${requestId}`),
      ).toBe(1);
      expect(
        await countOf(sql`select count(*) as count from outbox_events
                          where aggregate_kind = 'CUSTOM_REQUEST' and aggregate_id = ${requestId}`),
      ).toBe(1);
    });

    it('refuses the same challenge with a different fingerprint', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'conflict' });
      await post(fixture, catalogBody(fixture)).expect(201);

      const response = await post(
        fixture,
        catalogBody(fixture, { breakdown: [{ sizeLabel: 'M', quantity: 11 }] }),
      ).expect(409);

      expect(submitted(response.body).code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await requestCount(fixture.customerId)).toBe(1);
    });

    it('ignores the customer note and the asset ids when deciding replay (G01-D02)', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'excluded' });
      const first = await post(
        fixture,
        catalogBody(fixture, { customerNote: 'Giao trước thứ sáu' }),
      ).expect(201);
      const second = await post(
        fixture,
        catalogBody(fixture, { customerNote: 'Hoàn toàn khác' }),
      ).expect(201);

      expect(submitted(second.body).data).toEqual(submitted(first.body).data);
      expect(await requestCount(fixture.customerId)).toBe(1);
    });
  });

  describe('transaction failure', () => {
    it('leaves no request, COP, case, session move, grant or event behind', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'rollback' });
      const intentsBefore = await countOf(sql`select count(*) as count from notification_intents`);
      recorderFails = true;

      await post(fixture, catalogBody(fixture)).expect(500);

      expect(await requestCount(fixture.customerId)).toBe(0);
      expect(
        await countOf(sql`select count(*) as count from secure_access_grants
                          where customer_id = ${fixture.customerId}`),
      ).toBe(0);
      // The grant's notification intent is sealed inside the same transaction,
      // so an unwound submission must leave no envelope behind either.
      expect(await countOf(sql`select count(*) as count from notification_intents`)).toBe(
        intentsBefore,
      );
      const session = await db().execute<{ status: string }>(
        sql`select status from design_sessions where id = ${fixture.designSessionId}`,
      );
      expect(session.rows[0]?.status).toBe('ACTIVE');
      // The claim itself rolled back too, so a genuine retry is not locked out.
      expect(
        await countOf(sql`select count(*) as count from idempotency_records
                          where operation_namespace = 'request.submit'
                            and scope_key = ${fixture.challengeId}`),
      ).toBe(0);
    });

    it('lets the genuine retry succeed once the fault clears', async () => {
      const fixture = await seedSubmissionContext(context.database, { label: 'rollback-retry' });
      recorderFails = true;
      await post(fixture, catalogBody(fixture)).expect(500);

      recorderFails = false;
      await post(fixture, catalogBody(fixture)).expect(201);
      expect(await requestCount(fixture.customerId)).toBe(1);
    });
  });
});
