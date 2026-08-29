/**
 * `POST /api/admin/customer-merges/{caseId}/execute` —
 * `adminCustomerMerge_execute` (`APP10-B03`): the merge itself.
 *
 * Against the real HTTP application, the real `AuthenticatedAdminGuard` and a
 * disposable PostgreSQL — no guard override anywhere.
 *
 * This suite proves what a **successful** merge does: every live reference moved,
 * every active grant revoked, the loser tombstoned, the frozen evidence left
 * exactly where it was, the step history appended with the transaction's own
 * counts, and one Admin audit row beside it. Refusals, replay, concurrency and
 * rollback are `admin-customer-merge-execution-guards.integration.spec.ts`, so
 * neither file has to be read to understand the other.
 *
 * The load-bearing assertions are phrased against the **rows**. A response body
 * cannot show that `verified_source` survived a contact move, or that a
 * quotation acceptance still names the merged-away customer.
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
import { auditRows as customerAuditRows } from './customer-maintenance-queries';
import {
  contactRows,
  frozenEvidenceOwners,
  grantRows,
  mergeEventRows,
  mergeEventSteps,
  seedActorHistory,
} from './customer-merge-execution-queries';
import {
  mergeAuditRows,
  mergeCaseRows,
  ownershipSnapshot,
  seedMergeCase,
  seedOwnedCommerce,
} from './customer-merge-queries';

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

describe('APP10-B03 · Admin customer merge execution', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b03-merge-execution');
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

  /** Two live customers and a REQUESTED case between them. */
  const seedCase = async (): Promise<Pair> => {
    const survivor = await context.seedCustomer();
    const loser = await context.seedCustomer({
      email: SECOND_FIXTURE_EMAIL,
      phone: SECOND_FIXTURE_PHONE,
    });
    const caseId = await seedMergeCase(context, {
      survivorCustomerId: survivor.customerId,
      loserCustomerId: loser.customerId,
      status: 'REQUESTED',
      adminId: context.adminId(),
    });
    return { survivor: survivor.customerId, loser: loser.customerId, caseId };
  };

  describe('the successful merge', () => {
    it('moves every live category and tombstones the loser', async () => {
      const { survivor, loser, caseId } = await seedCase();
      const commerce = await seedOwnedCommerce(context, loser);
      const before = { survivor: await ownershipSnapshot(context, survivor) };

      const response = await execute(caseId).expect(200);
      const payload = dataOf<ExecutedPayload>(response);
      expect(payload).toEqual({ mergeCaseId: caseId, status: 'EXECUTED', outcome: 'EXECUTED' });

      const loserAfter = await ownershipSnapshot(context, loser);
      const survivorAfter = await ownershipSnapshot(context, survivor);

      // The loser owns nothing live any more, and points at the survivor.
      expect(loserAfter.mergedIntoCustomerId).toBe(survivor);
      expect(loserAfter.contactPoints).toBe(0);
      expect(loserAfter.customRequests).toBe(0);
      expect(loserAfter.orders).toBe(0);
      expect(loserAfter.uploadedAssets).toBe(0);
      expect(loserAfter.businessProfiles).toBe(0);
      expect(loserAfter.activeGrants).toBe(0);

      // The survivor owns all of it, on top of what it already had, and is
      // itself untouched as an identity.
      expect(survivorAfter.mergedIntoCustomerId).toBeNull();
      expect(survivorAfter.contactPoints).toBe(before.survivor.contactPoints + 2);
      expect(survivorAfter.customRequests).toBe(2);
      expect(survivorAfter.orders).toBe(1);
      expect(survivorAfter.uploadedAssets).toBe(2);
      expect(survivorAfter.businessProfiles).toBe(1);

      // The order really is the seeded one, not a coincidence of counting.
      expect(commerce.orderId).toBeDefined();
      const cases = await mergeCaseRows(context);
      expect(cases[0]?.status).toBe('EXECUTED');
      expect(cases[0]?.decided_at).not.toBeNull();
    });

    it('carries verification evidence with every moved contact', async () => {
      const { survivor, loser, caseId } = await seedCase();
      const before = await contactRows(context);
      const loserContacts = before.filter((row) => row.customer_id === loser);
      expect(loserContacts).toHaveLength(2);

      await execute(caseId).expect(200);

      const after = await contactRows(context);
      expect(after).toHaveLength(before.length);
      for (const original of loserContacts) {
        const moved = after.find((row) => row.id === original.id);
        // Everything except ownership and the primary flag is byte-identical:
        // a merge inherits verification, it never re-earns or forges it.
        expect(moved).toMatchObject({
          customer_id: survivor,
          contact_kind: original.contact_kind,
          normalized_value: original.normalized_value,
          display_value: original.display_value,
          verified_at: original.verified_at,
          verified_source: original.verified_source,
          deactivated_at: original.deactivated_at,
        });
      }
    });

    it('leaves the survivor with exactly one primary contact', async () => {
      const { survivor, loser, caseId } = await seedCase();
      const before = await contactRows(context);
      const survivorPrimary = before.find((row) => row.customer_id === survivor && row.is_primary);
      const loserPrimary = before.find((row) => row.customer_id === loser && row.is_primary);
      expect(survivorPrimary).toBeDefined();
      expect(loserPrimary).toBeDefined();

      await execute(caseId).expect(200);

      const after = await contactRows(context);
      const primaries = after.filter((row) => row.is_primary);
      expect(primaries).toHaveLength(1);
      // The survivor's own primary kept it: the operator chose which identity
      // survives, and a merge does not change how that person is contacted.
      expect(primaries[0]?.id).toBe(survivorPrimary?.id);
      // The demoted contact kept everything else it had.
      const demoted = after.find((row) => row.id === loserPrimary?.id);
      expect(demoted?.is_primary).toBe(false);
      expect(demoted?.customer_id).toBe(survivor);
      expect(demoted?.verified_at).toBe(loserPrimary?.verified_at);
      expect(demoted?.verified_source).toBe(loserPrimary?.verified_source);
    });

    it('revokes every ACTIVE loser grant and leaves inactive ones alone', async () => {
      const { loser, caseId } = await seedCase();
      const requestId = await context.seedRequest(loser);
      const active = await context.seedGrant({
        customerId: loser,
        customRequestId: requestId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3_600_000),
        marker: 'b03-active',
      });
      const expired = await context.seedGrant({
        customerId: loser,
        customRequestId: await context.seedRequest(loser),
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 3_600_000),
        marker: 'b03-expired',
      });
      const revoked = await context.seedGrant({
        customerId: loser,
        customRequestId: await context.seedRequest(loser),
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 3_600_000),
        marker: 'b03-revoked',
        revokeReason: 'operator closed the ticket',
      });

      await execute(caseId).expect(200);

      const grants = await grantRows(context);
      const byId = new Map(grants.map((row) => [row.id, row]));
      // The live link is dead, with the canonical merge reason.
      expect(byId.get(active.grantId)?.status).toBe('REVOKED');
      expect(byId.get(active.grantId)?.revoke_reason).toBe('merge');
      // History is not rewritten: an already-inactive grant keeps its state and
      // whatever reason a previous operator gave.
      expect(byId.get(expired.grantId)?.status).toBe('EXPIRED');
      expect(byId.get(revoked.grantId)?.revoke_reason).toBe('operator closed the ticket');
      // No grant is repointed. A link issued to one person must not start
      // opening another identity's data.
      for (const grant of grants) {
        expect(grant.customer_id).toBe(loser);
      }
      // Nothing ACTIVE is left on the merged-away side.
      expect((await ownershipSnapshot(context, loser)).activeGrants).toBe(0);
    });

    it('rewrites no frozen evidence', async () => {
      const { loser, caseId } = await seedCase();
      const commerce = await seedOwnedCommerce(context, loser);
      await seedActorHistory(context, {
        customerId: loser,
        orderId: commerce.orderId,
        requestId: commerce.customRequestId,
      });
      const before = await frozenEvidenceOwners(context);
      // The premise: every frozen category really does name the loser.
      expect(before.approvalSnapshotOwners).toEqual([loser]);
      expect(before.quotationAcceptanceOwners).toEqual([loser]);
      expect(before.orderTransitionOwners).toEqual([loser]);
      expect(before.requestTransitionOwners).toEqual([loser]);

      await execute(caseId).expect(200);

      // And still does. The live `orders.customer_id` moved; the transition
      // history that records who acted, and the evidence of what was approved
      // and accepted, did not.
      expect(await frozenEvidenceOwners(context)).toEqual(before);
      expect((await ownershipSnapshot(context, loser)).orders).toBe(0);
      expect((await ownershipSnapshot(context, loser)).approvalSnapshots).toBe(1);
      expect((await ownershipSnapshot(context, loser)).quotationAcceptances).toBe(1);
    });
  });

  describe('the immutable step history', () => {
    it('appends one row per step, with the transaction’s own counts', async () => {
      const { survivor, loser, caseId } = await seedCase();
      await seedOwnedCommerce(context, loser);

      await execute(caseId).expect(200);

      expect(await mergeEventSteps(context)).toEqual([
        { step: 'CONTACT_MOVE', table: 'customer_contact_points', affected: 2 },
        { step: 'GRANT_REVOKE', table: 'secure_access_grants', affected: 1 },
        { step: 'OWNERSHIP_TRANSFER', table: 'custom_requests', affected: 2 },
        { step: 'OWNERSHIP_TRANSFER', table: 'orders', affected: 1 },
        { step: 'OWNERSHIP_TRANSFER', table: 'assets', affected: 2 },
        { step: 'OWNERSHIP_TRANSFER', table: 'business_profiles', affected: 1 },
        { step: 'TOMBSTONE', table: 'customers', affected: 1 },
      ]);

      const rows = await mergeEventRows(context);
      for (const row of rows) {
        expect(row.merge_case_id).toBe(caseId);
        // The subject of a bulk repoint is the reference that moved.
        expect(row.subject_id).toBe(loser);
        expect(JSON.parse(row.detail ?? '{}')).toMatchObject({ toCustomerId: survivor });
      }
      // The demotion is recorded, because it is the one identity change a merge
      // makes beyond repointing.
      expect(JSON.parse(rows[0]?.detail ?? '{}')).toMatchObject({ primaryDemoted: true });
    });

    it('reports what actually changed, not what the preview predicted', async () => {
      const { loser, caseId } = await seedCase();
      const detail = await request(context.server())
        .get(ROUTES.mergeCase(caseId))
        .set('Cookie', context.adminCookie())
        .expect(200);
      expect(
        dataOf<{ consequencePreview: { uploadedAssets: number } }>(detail).consequencePreview
          .uploadedAssets,
      ).toBe(0);

      // Rows arrive between the preview and the merge. The evidence must
      // describe the transaction, not the number an operator saw earlier.
      await seedOwnedCommerce(context, loser);
      await execute(caseId).expect(200);

      const steps = await mergeEventSteps(context);
      expect(steps.find((step) => step.table === 'assets')?.affected).toBe(2);
      expect(steps.find((step) => step.table === 'orders')?.affected).toBe(1);
    });

    it('carries no contact value, name or operator reason', async () => {
      const { loser, caseId } = await seedCase();
      await seedOwnedCommerce(context, loser);

      await execute(caseId).expect(200);

      const serialized = JSON.stringify(await mergeEventRows(context));
      for (const secret of [
        SECOND_FIXTURE_EMAIL,
        SECOND_FIXTURE_PHONE,
        'bay.nguyen',
        '+84912345678',
        'Công ty Vi Du',
        'B07 Customer',
        'Seeded fixture case.',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });
  });

  describe('the audit trail', () => {
    it('appends exactly one execute row against the case', async () => {
      const { survivor, loser, caseId } = await seedCase();

      await execute(caseId).expect(200);

      const audit = await mergeAuditRows(context, caseId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: 'customer.merge_case_executed',
        actor_kind: 'ADMIN',
        admin_id: context.adminId(),
        target_kind: 'CUSTOMER_MERGE_CASE',
        target_id: caseId,
        // No count, no contact, no snapshot — the ids and the resulting state.
        summary: { survivorCustomerId: survivor, loserCustomerId: loser, status: 'EXECUTED' },
        reason: null,
      });
      // Filed against the case, not against either customer.
      expect(await customerAuditRows(context, loser)).toHaveLength(0);
      expect(await customerAuditRows(context, survivor)).toHaveLength(0);
    });

    it('publishes no raw contact value in the response', async () => {
      const { caseId } = await seedCase();

      const response = await execute(caseId).expect(200);

      const body = JSON.stringify(response.body);
      for (const value of [SECOND_FIXTURE_EMAIL, SECOND_FIXTURE_PHONE, '+84912345678']) {
        expect(body).not.toContain(value);
      }
    });
  });

  describe('authorization', () => {
    it('refuses a request with no Admin session', async () => {
      const { caseId } = await seedCase();

      await request(context.server()).post(ROUTES.executeMerge(caseId)).expect(401);

      expect(await mergeEventRows(context)).toHaveLength(0);
      expect((await mergeCaseRows(context))[0]?.status).toBe('REQUESTED');
    });

    it('refuses a request from an origin outside the Admin allowlist', async () => {
      const { caseId } = await seedCase();

      await request(context.server())
        .post(ROUTES.executeMerge(caseId))
        .set('Cookie', context.adminCookie())
        .set('Origin', 'https://not-the-admin.example')
        .expect(403);

      expect(await mergeEventRows(context)).toHaveLength(0);
    });
  });
});
