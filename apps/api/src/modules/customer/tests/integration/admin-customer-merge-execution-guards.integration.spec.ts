/**
 * The refusals, the replay, the race and the rollback of
 * `adminCustomerMerge_execute` (`APP10-B03` §6, §10, §11, §19, §20).
 *
 * The companion of `admin-customer-merge-execution.integration.spec.ts`, which
 * proves what a successful merge does. Everything here is about a merge that
 * must **not** happen, or must happen exactly once, and every case ends with the
 * same question asked of the rows: is the world untouched?
 *
 * `mergeEventRows` is global rather than scoped to the case under test, so a
 * stray step row filed under another case cannot hide inside a passing
 * assertion.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  ROUTES,
  createAdminSupportContext,
  dataOf,
  SECOND_FIXTURE_EMAIL,
  SECOND_FIXTURE_PHONE,
  type AdminSupportTestContext,
} from './admin-support-context';
import { seedContact, tombstone } from './customer-maintenance-queries';
import {
  contactRows,
  grantRows,
  mergeEventRows,
  seedBusinessProfile,
} from './customer-merge-execution-queries';
import {
  auditEventCount,
  mergeAuditRows,
  mergeCaseRows,
  ownershipSnapshot,
  seedBareCustomer,
  seedMergeCase,
  seedOwnedCommerce,
} from './customer-merge-queries';
import { CUSTOMER_MERGE_EVENT_REPOSITORY } from '../../domain/repositories/customer-merge-event.repository';
import type { CustomerMergeEventRepository } from '../../domain/repositories/customer-merge-event.repository';

interface ExecutedPayload {
  readonly mergeCaseId: string;
  readonly status: string;
  readonly outcome: string;
}

interface Pair {
  readonly survivor: string;
  readonly loser: string;
  readonly caseId: string;
}

describe('APP10-B03 · merge execution refusals, replay and rollback', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b03-merge-execution-guards');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const execute = (caseId: string) =>
    request(context.server())
      .post(ROUTES.executeMerge(caseId))
      .set('Cookie', context.adminCookie());

  const seedCase = async (status: 'REQUESTED' | 'REJECTED' = 'REQUESTED'): Promise<Pair> => {
    const survivor = await context.seedCustomer();
    const loser = await context.seedCustomer({
      email: SECOND_FIXTURE_EMAIL,
      phone: SECOND_FIXTURE_PHONE,
    });
    const caseId = await seedMergeCase(context, {
      survivorCustomerId: survivor.customerId,
      loserCustomerId: loser.customerId,
      status,
      adminId: context.adminId(),
    });
    return { survivor: survivor.customerId, loser: loser.customerId, caseId };
  };

  /** Everything a merge would change, for both sides at once. */
  const snapshotPair = async (pair: Pair) => ({
    survivor: await ownershipSnapshot(context, pair.survivor),
    loser: await ownershipSnapshot(context, pair.loser),
    contacts: await contactRows(context),
    grants: await grantRows(context),
  });

  const expectNothingMerged = async (
    pair: Pair,
    before: Awaited<ReturnType<typeof snapshotPair>>,
  ) => {
    expect(await snapshotPair(pair)).toEqual(before);
    expect(await mergeEventRows(context)).toHaveLength(0);
    expect(await mergeAuditRows(context, pair.caseId)).toHaveLength(0);
    expect((await mergeCaseRows(context)).find((row) => row.id === pair.caseId)?.status).toBe(
      'REQUESTED',
    );
  };

  describe('the business-profile collision', () => {
    it('is published by the preview before an operator confirms', async () => {
      const pair = await seedCase();
      await seedBusinessProfile(context, pair.survivor, 'Công ty Còn Lại');
      await seedBusinessProfile(context, pair.loser, 'Công ty Sáp Nhập');

      const detail = await request(context.server())
        .get(ROUTES.mergeCase(pair.caseId))
        .set('Cookie', context.adminCookie())
        .expect(200);

      expect(
        dataOf<{ consequencePreview: { businessProfile: unknown } }>(detail).consequencePreview
          .businessProfile,
      ).toEqual({ loserHasProfile: true, survivorHasProfile: true, conflict: true });
    });

    it('fails closed before any destructive write', async () => {
      const pair = await seedCase();
      await seedOwnedCommerce(context, pair.loser);
      await seedBusinessProfile(context, pair.survivor, 'Công ty Còn Lại');
      const before = await snapshotPair(pair);
      // The premise: the loser really does own things a merge would move.
      expect(before.loser.orders).toBe(1);
      expect(before.loser.activeGrants).toBe(1);

      await execute(pair.caseId).expect(409);

      // Not one of them moved, and the loser was not tombstoned.
      await expectNothingMerged(pair, before);
      expect(before.loser.mergedIntoCustomerId).toBeNull();
      expect((await ownershipSnapshot(context, pair.loser)).mergedIntoCustomerId).toBeNull();
    });

    it('moves the profile when only the loser has one', async () => {
      const pair = await seedCase();
      await seedBusinessProfile(context, pair.loser);

      await execute(pair.caseId).expect(200);

      expect((await ownershipSnapshot(context, pair.survivor)).businessProfiles).toBe(1);
      expect((await ownershipSnapshot(context, pair.loser)).businessProfiles).toBe(0);
    });
  });

  describe('contact collision forms the schema permits', () => {
    /**
     * CST-005 is a **global** partial unique over `(kind, normalized_value)`
     * where the contact is verified and active, so two live customers cannot
     * both hold the same authoritative contact — the collision the merge would
     * have to destroy evidence to resolve is unreachable by construction. What
     * the schema *does* permit is a duplicate that is unverified, or verified
     * but deactivated, and both must move without a rewrite.
     */
    it('moves an unverified duplicate of a survivor contact intact', async () => {
      const pair = await seedCase();
      const duplicate = await seedContact(context, {
        customerId: pair.loser,
        kind: 'EMAIL',
        // The survivor's own verified address, held unverified on the loser.
        value: 'bay.nguyen@vidu-b07.test',
        verified: false,
      });

      await execute(pair.caseId).expect(200);

      const after = await contactRows(context);
      const moved = after.find((row) => row.id === duplicate);
      expect(moved?.customer_id).toBe(pair.survivor);
      // Still unverified. Nothing promoted it to make the merge tidier.
      expect(moved?.verified_at).toBeNull();
      // And the survivor's own verified row is untouched.
      expect(
        after.filter(
          (row) => row.normalized_value === 'bay.nguyen@vidu-b07.test' && row.verified_at !== null,
        ),
      ).toHaveLength(1);
    });

    it('moves a deactivated verified duplicate without reviving it', async () => {
      const pair = await seedCase();
      const retired = await seedContact(context, {
        customerId: pair.loser,
        kind: 'PHONE',
        value: '+84912345678',
        verified: true,
        deactivated: true,
      });

      await execute(pair.caseId).expect(200);

      const moved = (await contactRows(context)).find((row) => row.id === retired);
      expect(moved?.customer_id).toBe(pair.survivor);
      expect(moved?.deactivated_at).not.toBeNull();
      expect(moved?.verified_at).not.toBeNull();
    });

    it('gives the loser’s primary to a survivor that has none', async () => {
      const survivor = await seedBareCustomer(context, 'khong-primary@vidu-b03.test');
      // The survivor’s only contact loses its primary flag — a state
      // `APP10-B01`'s deactivate cannot produce, but retention and history can.
      await context.disposable.client.db.execute(
        sql`update customer_contact_points set is_primary = false
            where customer_id = ${survivor}`,
      );
      const loser = await seedBareCustomer(context, 'co-primary@vidu-b03.test');
      const caseId = await seedMergeCase(context, {
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        status: 'REQUESTED',
        adminId: context.adminId(),
      });

      await execute(caseId).expect(200);

      const primaries = (await contactRows(context)).filter((row) => row.is_primary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.customer_id).toBe(survivor);
      expect(primaries[0]?.normalized_value).toBe('co-primary@vidu-b03.test');
    });
  });

  describe('invalid lifecycle', () => {
    it('answers 404 for a case that does not exist', async () => {
      await seedCase();
      await execute('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099').expect(404);
      expect(await mergeEventRows(context)).toHaveLength(0);
    });

    it('answers 400 for a malformed case id', async () => {
      await execute('not-a-uuid').expect(400);
      expect(await mergeEventRows(context)).toHaveLength(0);
    });

    it('refuses a REJECTED case', async () => {
      const pair = await seedCase('REJECTED');
      await seedOwnedCommerce(context, pair.loser);
      const before = await snapshotPair(pair);

      await execute(pair.caseId).expect(409);

      expect(await snapshotPair(pair)).toEqual(before);
      expect(await mergeEventRows(context)).toHaveLength(0);
      expect((await mergeCaseRows(context))[0]?.status).toBe('REJECTED');
    });

    it('refuses a loser tombstoned after the case was opened', async () => {
      const pair = await seedCase();
      const third = await seedBareCustomer(context, 'nguoi-thu-ba@vidu-b03.test');
      // The state the `APP10-B02` preview could not have known about.
      await tombstone(context, pair.loser, third);
      const before = await snapshotPair(pair);

      await execute(pair.caseId).expect(409);

      expect(await snapshotPair(pair)).toEqual(before);
      expect(await mergeEventRows(context)).toHaveLength(0);
      expect((await mergeCaseRows(context))[0]?.status).toBe('REQUESTED');
    });

    it('refuses a survivor tombstoned after the case was opened', async () => {
      const pair = await seedCase();
      const third = await seedBareCustomer(context, 'nguoi-thu-tu@vidu-b03.test');
      await tombstone(context, pair.survivor, third);

      await execute(pair.caseId).expect(409);

      expect(await mergeEventRows(context)).toHaveLength(0);
      expect((await ownershipSnapshot(context, pair.loser)).mergedIntoCustomerId).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('replays an executed case as a success that changes nothing', async () => {
      const pair = await seedCase();
      await seedOwnedCommerce(context, pair.loser);

      const first = dataOf<ExecutedPayload>(await execute(pair.caseId).expect(200));
      expect(first.outcome).toBe('EXECUTED');
      const afterFirst = await snapshotPair(pair);
      const eventsAfterFirst = await mergeEventRows(context);
      const auditAfterFirst = await auditEventCount(context);

      const second = dataOf<ExecutedPayload>(await execute(pair.caseId).expect(200));

      expect(second).toEqual({
        mergeCaseId: pair.caseId,
        status: 'EXECUTED',
        outcome: 'ALREADY_EXECUTED',
      });
      // Nothing moved a second time, nothing was revoked again, and no row was
      // appended to either evidence table.
      expect(await snapshotPair(pair)).toEqual(afterFirst);
      expect(await mergeEventRows(context)).toEqual(eventsAfterFirst);
      expect(await auditEventCount(context)).toBe(auditAfterFirst);
      expect(await mergeAuditRows(context, pair.caseId)).toHaveLength(1);
    });

    it('lets two concurrent executions perform the merge once', async () => {
      const pair = await seedCase();
      await seedOwnedCommerce(context, pair.loser);

      const [first, second] = await Promise.all([execute(pair.caseId), execute(pair.caseId)]);

      // Both callers succeed; exactly one of them did the work.
      expect([first.status, second.status]).toEqual([200, 200]);
      const outcomes = [
        dataOf<ExecutedPayload>(first).outcome,
        dataOf<ExecutedPayload>(second).outcome,
      ].sort();
      expect(outcomes).toEqual(['ALREADY_EXECUTED', 'EXECUTED']);

      // One step sequence, one audit row, one tombstone. The case row lock is
      // what makes the second transaction wait rather than race.
      expect(await mergeEventRows(context)).toHaveLength(7);
      expect(await mergeAuditRows(context, pair.caseId)).toHaveLength(1);
      const loser = await ownershipSnapshot(context, pair.loser);
      expect(loser.mergedIntoCustomerId).toBe(pair.survivor);
      expect(loser.contactPoints).toBe(0);
      expect((await ownershipSnapshot(context, pair.survivor)).orders).toBe(1);
    });
  });

  describe('atomicity', () => {
    /**
     * The failure is injected at the narrowest seam the composition offers: the
     * append-only evidence writer, which runs **after** every transfer and the
     * tombstone. A throw there proves the rollback covers the whole merge, and
     * it needs no production flag, no test-only branch and no environment
     * variable — the provider is a singleton in the running application and the
     * spy is removed afterwards.
     */
    it('rolls the whole merge back when a later step fails', async () => {
      const pair = await seedCase();
      await seedOwnedCommerce(context, pair.loser);
      const before = await snapshotPair(pair);
      const auditBefore = await auditEventCount(context);

      const events = context.get<CustomerMergeEventRepository>(CUSTOMER_MERGE_EVENT_REPOSITORY);
      const spy = jest
        .spyOn(events, 'append')
        .mockRejectedValueOnce(new Error('injected failure after the transfers'));

      try {
        await execute(pair.caseId).expect(500);
      } finally {
        spy.mockRestore();
      }

      // Every category is exactly as it was: contacts unmoved, grants still
      // ACTIVE, orders and assets still the loser's, no tombstone, no step
      // history, no audit row, and the case still open for a retry.
      await expectNothingMerged(pair, before);
      expect(await auditEventCount(context)).toBe(auditBefore);
      expect((await ownershipSnapshot(context, pair.loser)).mergedIntoCustomerId).toBeNull();

      // And the retry succeeds, which is the point of leaving it REQUESTED.
      await execute(pair.caseId).expect(200);
      expect((await ownershipSnapshot(context, pair.loser)).mergedIntoCustomerId).toBe(
        pair.survivor,
      );
    });
  });
});
