/**
 * `POST /api/admin/customer-merges` — `adminCustomerMerge_open` — and
 * `POST .../{caseId}/reject` — `adminCustomerMerge_reject` (`APP10-B02` §6, §9).
 *
 * Against the real HTTP application, the real `AuthenticatedAdminGuard` and a
 * disposable PostgreSQL — no guard override anywhere, for the reason
 * `admin-support-context.ts` records.
 *
 * The load-bearing assertions here are negative and are phrased against the
 * **rows**: that no ownership moved, that `merged_into_customer_id` stayed NULL
 * on both sides, and that `customer_merge_events` is still empty. A response
 * body cannot show any of those, because none of them has a field in it.
 */
import request from 'supertest';

import {
  ROUTES,
  createAdminSupportContext,
  dataOf,
  SECOND_FIXTURE_EMAIL,
  SECOND_FIXTURE_PHONE,
  type AdminSupportTestContext,
} from './admin-support-context';
import { tombstone } from './customer-maintenance-queries';
import {
  mergeAuditRows,
  mergeCaseRows,
  mergeEventCount,
  ownershipSnapshot,
  seedBareCustomer,
  seedMergeCase,
  seedOwnedCommerce,
} from './customer-merge-queries';

interface OpenedPayload {
  readonly mergeCaseId: string;
  readonly status: string;
}

const OPEN_REASON = 'Same person: the number was re-registered under a new email after a typo.';
const REJECT_REASON = 'Different people: the shared number belongs to a shop, not one customer.';

describe('APP10-B02 · Admin customer merge lifecycle', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b02-merge-lifecycle');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const open = (body: object) =>
    request(context.server())
      .post(ROUTES.openMerge())
      .set('Cookie', context.adminCookie())
      .send(body);

  const reject = (caseId: string, body: object) =>
    request(context.server())
      .post(ROUTES.rejectMerge(caseId))
      .set('Cookie', context.adminCookie())
      .send(body);

  /** Two live customers. The second's contacts differ, as CST-005 requires. */
  const seedPair = async (): Promise<{ survivor: string; loser: string }> => {
    const survivor = await context.seedCustomer();
    const loser = await context.seedCustomer({
      email: SECOND_FIXTURE_EMAIL,
      phone: SECOND_FIXTURE_PHONE,
    });
    return { survivor: survivor.customerId, loser: loser.customerId };
  };

  describe('opening a case', () => {
    it('creates one REQUESTED case attributed to the session Admin', async () => {
      const { survivor, loser } = await seedPair();

      const response = await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);

      const payload = dataOf<OpenedPayload>(response);
      expect(payload.status).toBe('REQUESTED');

      const cases = await mergeCaseRows(context);
      expect(cases).toHaveLength(1);
      expect(cases[0]?.id).toBe(payload.mergeCaseId);
      // The operator's choice, in the operator's order. Nothing swapped it.
      expect(cases[0]?.survivor_customer_id).toBe(survivor);
      expect(cases[0]?.loser_customer_id).toBe(loser);
      expect(cases[0]?.reason).toBe(OPEN_REASON);
      expect(cases[0]?.decided_at).toBeNull();
      // From the session, never from the body — the body has no member for it.
      expect(cases[0]?.requested_by_admin_id).toBe(context.adminId());
    });

    it('transfers nothing and appends no merge event', async () => {
      const { survivor, loser } = await seedPair();
      await seedOwnedCommerce(context, loser);
      const before = await ownershipSnapshot(context, loser);
      const survivorBefore = await ownershipSnapshot(context, survivor);

      await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);

      expect(await ownershipSnapshot(context, loser)).toEqual(before);
      expect(await ownershipSnapshot(context, survivor)).toEqual(survivorBefore);
      expect(before.mergedIntoCustomerId).toBeNull();
      // No CONTACT_MOVE, GRANT_REVOKE, OWNERSHIP_TRANSFER or TOMBSTONE row: every
      // step kind belongs to execution, and B02 executes nothing.
      expect(await mergeEventCount(context)).toBe(0);
    });

    it('audits the opening exactly once, without copying the reason', async () => {
      const { survivor, loser } = await seedPair();

      const response = await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);
      const { mergeCaseId } = dataOf<OpenedPayload>(response);

      const events = await mergeAuditRows(context, mergeCaseId);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('customer.merge_case_opened');
      expect(events[0]?.actor_kind).toBe('ADMIN');
      expect(events[0]?.admin_id).toBe(context.adminId());
      expect(events[0]?.target_kind).toBe('CUSTOMER_MERGE_CASE');
      expect(events[0]?.summary).toEqual({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REQUESTED',
      });
      // The open reason lives on the case row and is not duplicated into an
      // append-only table that has no anonymization path of its own.
      expect(events[0]?.reason).toBeNull();
    });
  });

  describe('the open guards', () => {
    it('requires a reason, and refuses a blank one', async () => {
      const { survivor, loser } = await seedPair();

      await open({ survivorCustomerId: survivor, loserCustomerId: loser }).expect(400);
      await open({ survivorCustomerId: survivor, loserCustomerId: loser, reason: '   ' }).expect(
        400,
      );
      await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: 'x'.repeat(1_001),
      }).expect(400);

      expect(await mergeCaseRows(context)).toHaveLength(0);
    });

    it('refuses a self-merge before any row is read', async () => {
      const { survivor } = await seedPair();

      await open({
        survivorCustomerId: survivor,
        loserCustomerId: survivor,
        reason: OPEN_REASON,
      }).expect(400);

      expect(await mergeCaseRows(context)).toHaveLength(0);
    });

    it('refuses an unknown survivor and an unknown loser separately', async () => {
      const { survivor, loser } = await seedPair();
      const missing = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff';

      await open({
        survivorCustomerId: missing,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(404);
      await open({
        survivorCustomerId: survivor,
        loserCustomerId: missing,
        reason: OPEN_REASON,
      }).expect(404);

      expect(await mergeCaseRows(context)).toHaveLength(0);
    });

    it('refuses an already-merged survivor and an already-merged loser', async () => {
      const { survivor, loser } = await seedPair();
      const third = await seedBareCustomer(context, 'ba.pham@vidu-b02.test');

      await tombstone(context, survivor, third);
      await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(409);

      await tombstone(context, loser, third);
      await open({
        survivorCustomerId: third,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(409);

      // Neither refusal followed the chain to `third` and merged that instead.
      expect(await mergeCaseRows(context)).toHaveLength(0);
    });

    it('refuses a second open case for the same pair', async () => {
      const { survivor, loser } = await seedPair();
      await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);

      await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: 'A second attempt at the same pair.',
      }).expect(409);

      expect(await mergeCaseRows(context)).toHaveLength(1);
    });

    it('lets two concurrent opens of the same pair create only one case', async () => {
      const { survivor, loser } = await seedPair();
      const body = {
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      };

      // Both requests read no open case before either inserts, so the pre-check
      // cannot separate them. `uq_customer_merge_cases__survivor_loser__requested`
      // is what rejects the second INSERT, and the caught conflict is answered
      // with the same 409 an ordinary duplicate gets.
      const [first, second] = await Promise.all([open(body), open(body)]);
      const statuses = [first.status, second.status].sort((a, b) => a - b);

      expect(statuses).toEqual([201, 409]);
      expect(await mergeCaseRows(context)).toHaveLength(1);
      expect(await mergeEventCount(context)).toBe(0);
    });

    it('rejects a body naming a contact, a status or an admin id', async () => {
      const { survivor, loser } = await seedPair();
      const base = { survivorCustomerId: survivor, loserCustomerId: loser, reason: OPEN_REASON };

      await open({ ...base, contact: SECOND_FIXTURE_EMAIL }).expect(400);
      await open({ ...base, status: 'EXECUTED' }).expect(400);
      await open({ ...base, requestedByAdminId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6001' }).expect(
        400,
      );
      await open({ ...base, decidedAt: '2026-08-28T10:00:00.000Z' }).expect(400);

      expect(await mergeCaseRows(context)).toHaveLength(0);
    });
  });

  describe('rejecting a case', () => {
    it('moves REQUESTED to REJECTED, stamps the decision and audits it once', async () => {
      const { survivor, loser } = await seedPair();
      const response = await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);
      const { mergeCaseId } = dataOf<OpenedPayload>(response);

      await reject(mergeCaseId, { reason: REJECT_REASON }).expect(204);

      const [decided] = await mergeCaseRows(context);
      expect(decided?.status).toBe('REJECTED');
      expect(decided?.decided_at).not.toBeNull();
      // The open reason is intact: the declining reason did not overwrite it.
      expect(decided?.reason).toBe(OPEN_REASON);

      const events = await mergeAuditRows(context, mergeCaseId);
      expect(events).toHaveLength(2);
      expect(events[1]?.action).toBe('customer.merge_case_rejected');
      expect(events[1]?.admin_id).toBe(context.adminId());
      expect(events[1]?.summary).toEqual({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REJECTED',
      });
      // The declining reason has one durable home, and this is it.
      expect(events[1]?.reason).toBe(REJECT_REASON);
    });

    it('changes no customer-owned record', async () => {
      const { survivor, loser } = await seedPair();
      await seedOwnedCommerce(context, loser);
      const response = await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);
      const before = await ownershipSnapshot(context, loser);

      await reject(dataOf<OpenedPayload>(response).mergeCaseId, {
        reason: REJECT_REASON,
      }).expect(204);

      expect(await ownershipSnapshot(context, loser)).toEqual(before);
      expect(await mergeEventCount(context)).toBe(0);
    });

    it('requires a reason', async () => {
      const { survivor, loser } = await seedPair();
      const response = await open({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201);
      const { mergeCaseId } = dataOf<OpenedPayload>(response);

      await reject(mergeCaseId, {}).expect(400);
      await reject(mergeCaseId, { reason: '  ' }).expect(400);
      await reject(mergeCaseId, { reason: 'x'.repeat(1_001) }).expect(400);
      await reject(mergeCaseId, { reason: REJECT_REASON, status: 'REJECTED' }).expect(400);

      expect((await mergeCaseRows(context))[0]?.status).toBe('REQUESTED');
    });

    it('refuses an unknown case, a rejected one and an executed one', async () => {
      const { survivor, loser } = await seedPair();
      await reject('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff', { reason: REJECT_REASON }).expect(404);

      const rejected = await seedMergeCase(context, {
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REJECTED',
        adminId: context.adminId(),
      });
      const executed = await seedMergeCase(context, {
        survivorCustomerId: loser,
        loserCustomerId: survivor,
        status: 'EXECUTED',
        adminId: context.adminId(),
      });

      // Not idempotent, deliberately: a replay is indistinguishable from a
      // second operator deciding the case, and its reason would be discarded.
      await reject(rejected, { reason: REJECT_REASON }).expect(409);
      await reject(executed, { reason: REJECT_REASON }).expect(409);
    });
  });

  describe('the guards', () => {
    it('refuses every operation without an Admin session', async () => {
      const { survivor, loser } = await seedPair();
      const caseId = await seedMergeCase(context, {
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REQUESTED',
        adminId: context.adminId(),
      });

      await request(context.server())
        .post(ROUTES.openMerge())
        .send({ survivorCustomerId: survivor, loserCustomerId: loser, reason: OPEN_REASON })
        .expect(401);
      await request(context.server()).get(ROUTES.mergeCase(caseId)).expect(401);
      await request(context.server())
        .post(ROUTES.rejectMerge(caseId))
        .send({ reason: REJECT_REASON })
        .expect(401);

      expect(await mergeCaseRows(context)).toHaveLength(1);
    });

    it('refuses an origin outside the Admin allowlist', async () => {
      const { survivor, loser } = await seedPair();
      await request(context.server())
        .post(ROUTES.openMerge())
        .set('Cookie', context.adminCookie())
        .set('Origin', 'https://not-the-admin.example')
        .send({ survivorCustomerId: survivor, loserCustomerId: loser, reason: OPEN_REASON })
        .expect(403);

      expect(await mergeCaseRows(context)).toHaveLength(0);
    });

    it('refuses a body-bearing mutation that is not application/json', async () => {
      const { survivor, loser } = await seedPair();
      const caseId = await seedMergeCase(context, {
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REQUESTED',
        adminId: context.adminId(),
      });

      await request(context.server())
        .post(ROUTES.openMerge())
        .set('Cookie', context.adminCookie())
        .set('Content-Type', 'text/plain')
        .send('survivorCustomerId=x')
        .expect(415);
      await request(context.server())
        .post(ROUTES.rejectMerge(caseId))
        .set('Cookie', context.adminCookie())
        .set('Content-Type', 'text/plain')
        .send('reason=x')
        .expect(415);

      expect((await mergeCaseRows(context))[0]?.status).toBe('REQUESTED');
    });
  });
});
