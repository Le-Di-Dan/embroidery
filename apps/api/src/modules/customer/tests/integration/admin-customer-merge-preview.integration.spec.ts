/**
 * `GET /api/admin/customer-merges/{caseId}` — `adminCustomerMerge_detail`
 * (`APP10-B02` §7, §8).
 *
 * The half of B02 that is hardest to get right, and the one an operator acts
 * on: the consequence preview has to be *honest* — every live category counted,
 * every frozen one excluded — and it has to be *inert*.
 *
 * The suite therefore proves three separate things, and they are different
 * claims:
 *
 * 1. the counts match rows that were actually seeded, category by category;
 * 2. `approval_snapshots` and `quotation_acceptances` carry the same
 *    `customer_id` and appear in no count, so "has a customer reference" is
 *    demonstrably not the test the preview applies;
 * 3. reading the case twice writes nothing — not a row, not an audit event, not
 *    a merge event, and no instant on either customer.
 */
import request from 'supertest';

import {
  FIXTURE_EMAIL_MASK,
  FIXTURE_PHONE_MASK,
  ROUTES,
  SECOND_FIXTURE_EMAIL,
  SECOND_FIXTURE_PHONE,
  createAdminSupportContext,
  dataOf,
  type AdminSupportTestContext,
} from './admin-support-context';
import { seedContact } from './customer-maintenance-queries';
import {
  auditEventCount,
  mergeEventCount,
  ownershipSnapshot,
  seedMergeCase,
  seedOwnedCommerce,
  seedUploadedAssets,
} from './customer-merge-queries';

interface ParticipantPayload {
  readonly customerId: string;
  readonly displayName?: string;
  readonly verifiedAt: string;
  readonly contacts: readonly {
    readonly kind: string;
    readonly maskedValue: string;
    readonly verified: boolean;
    readonly primary: boolean;
  }[];
}

interface CasePayload {
  readonly mergeCaseId: string;
  readonly status: string;
  readonly reason: string;
  readonly requestedByAdminId: string;
  readonly requestedAt: string;
  readonly decidedAt?: string;
  readonly survivor?: ParticipantPayload;
  readonly loser?: ParticipantPayload;
  readonly consequencePreview: {
    readonly contactPoints: number;
    readonly activeSecureAccessGrants: number;
    readonly customRequests: number;
    readonly orders: number;
    readonly uploadedAssets: number;
    readonly businessProfile: {
      readonly loserHasProfile: boolean;
      readonly survivorHasProfile: boolean;
      readonly conflict: boolean;
    };
  };
}

describe('APP10-B02 · merge case detail and consequence preview', () => {
  let context: AdminSupportTestContext;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-b02-merge-preview');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
  });

  const read = (caseId: string) =>
    request(context.server()).get(ROUTES.mergeCase(caseId)).set('Cookie', context.adminCookie());

  const seedCase = async (): Promise<{
    caseId: string;
    survivor: string;
    loser: string;
  }> => {
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
      reason: 'Same person, two records.',
    });
    return { caseId, survivor: survivor.customerId, loser: loser.customerId };
  };

  describe('the case and its participants', () => {
    it('publishes the case, both masked cards and nothing raw', async () => {
      const { caseId, survivor, loser } = await seedCase();

      const response = await read(caseId).expect(200);
      const payload = dataOf<CasePayload>(response);

      expect(payload.mergeCaseId).toBe(caseId);
      expect(payload.status).toBe('REQUESTED');
      expect(payload.reason).toBe('Same person, two records.');
      expect(payload.requestedByAdminId).toBe(context.adminId());
      expect(payload.decidedAt).toBeUndefined();
      expect(payload.survivor?.customerId).toBe(survivor);
      expect(payload.loser?.customerId).toBe(loser);

      // Primary first, then by kind — the delivered projection's order.
      expect(payload.survivor?.contacts.map((contact) => contact.maskedValue)).toEqual([
        FIXTURE_EMAIL_MASK,
        FIXTURE_PHONE_MASK,
      ]);

      // Not one contact value in any form, on either side of the comparison.
      const body = JSON.stringify(response.body);
      for (const value of [
        SECOND_FIXTURE_EMAIL,
        SECOND_FIXTURE_PHONE,
        'bay.nguyen@vidu-b07.test',
        '+84912345678',
      ]) {
        expect(body).not.toContain(value);
      }
      // And no field that would let a client walk a merge chain or read a note.
      expect(body).not.toContain('mergedIntoCustomerId');
      expect(body).not.toContain('anonymizedAt');
      expect(body).not.toContain('notes');
      expect(body).not.toContain('contactId');
    });

    it('publishes the decision instant once a case is decided', async () => {
      const survivor = await context.seedCustomer();
      const loser = await context.seedCustomer({
        email: SECOND_FIXTURE_EMAIL,
        phone: SECOND_FIXTURE_PHONE,
      });
      const caseId = await seedMergeCase(context, {
        survivorCustomerId: survivor.customerId,
        loserCustomerId: loser.customerId,
        status: 'REJECTED',
        adminId: context.adminId(),
      });

      const payload = dataOf<CasePayload>(await read(caseId).expect(200));
      expect(payload.status).toBe('REJECTED');
      expect(payload.decidedAt).toBeDefined();
    });

    it('answers 404 for an unknown case and 400 for a malformed id', async () => {
      await read('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff').expect(404);
      await read('not-a-uuid').expect(400);
    });
  });

  describe('the consequence preview', () => {
    it('counts every live category against the seeded rows', async () => {
      const { caseId, loser } = await seedCase();
      await seedOwnedCommerce(context, loser);

      const payload = dataOf<CasePayload>(await read(caseId).expect(200));

      // The shared fixture gives the loser two contacts; the commerce fixture
      // adds two requests, one order, one ACTIVE grant, two customer uploads
      // and one business profile.
      expect(payload.consequencePreview).toEqual({
        contactPoints: 2,
        activeSecureAccessGrants: 1,
        customRequests: 2,
        orders: 1,
        uploadedAssets: 2,
        businessProfile: { loserHasProfile: true, survivorHasProfile: false, conflict: false },
      });

      // Independently true of the rows themselves, so the preview is being
      // compared with the database rather than with itself.
      const rows = await ownershipSnapshot(context, loser);
      expect(rows.customRequests).toBe(2);
      expect(rows.orders).toBe(1);
      expect(rows.uploadedAssets).toBe(2);
    });

    it('is the loser’s, not the survivor’s', async () => {
      const { caseId, survivor } = await seedCase();
      await seedOwnedCommerce(context, survivor);

      const payload = dataOf<CasePayload>(await read(caseId).expect(200));

      // Everything belongs to the surviving side, so nothing moves.
      expect(payload.consequencePreview.orders).toBe(0);
      expect(payload.consequencePreview.customRequests).toBe(0);
      expect(payload.consequencePreview.uploadedAssets).toBe(0);
      // `APP10-B03` §10.2: the survivor’s profile is reported, because a merge
      // onto a survivor that already has one is refused — but nothing of the
      // survivor’s *moves*, so every count stays 0 and there is no conflict.
      expect(payload.consequencePreview.businessProfile).toEqual({
        loserHasProfile: false,
        survivorHasProfile: true,
        conflict: false,
      });
    });

    it('counts a deactivated contact and skips a non-ACTIVE grant', async () => {
      const { caseId, loser } = await seedCase();
      await seedContact(context, {
        customerId: loser,
        kind: 'EMAIL',
        value: 'cu.email@vidu-b02.test',
        deactivated: true,
      });
      const requestId = await context.seedRequest(loser);
      await context.seedGrant({
        customerId: loser,
        customRequestId: requestId,
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 60_000),
        marker: 'expired',
      });
      await context.seedGrant({
        customerId: loser,
        customRequestId: requestId,
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 60_000),
        marker: 'revoked',
        revokeReason: 'fixture',
      });

      const payload = dataOf<CasePayload>(await read(caseId).expect(200));

      // The retired contact still carries the customer reference, so it moves.
      expect(payload.consequencePreview.contactPoints).toBe(3);
      // Neither of these opens anything, so execution revokes neither.
      expect(payload.consequencePreview.activeSecureAccessGrants).toBe(0);
    });

    it('excludes frozen commercial evidence that carries the same customer id', async () => {
      const { caseId, loser } = await seedCase();
      await seedOwnedCommerce(context, loser);

      const rows = await ownershipSnapshot(context, loser);
      // The premise: this evidence really does name the merged-away customer.
      expect(rows.approvalSnapshots).toBe(1);
      expect(rows.quotationAcceptances).toBe(1);

      const payload = dataOf<CasePayload>(await read(caseId).expect(200));
      const preview = payload.consequencePreview;

      // And it appears in no count. `orders` is 1 rather than 2, `customRequests`
      // 2 rather than 3: the frozen rows were never added to anything.
      expect(preview.orders).toBe(1);
      expect(preview.customRequests).toBe(2);
      expect(Object.keys(preview).sort()).toEqual([
        'activeSecureAccessGrants',
        'businessProfile',
        'contactPoints',
        'customRequests',
        'orders',
        'uploadedAssets',
      ]);
      // No category is named after a frozen table, so no client can start
      // rendering one as something a merge would move.
      const body = JSON.stringify(payload.consequencePreview);
      for (const frozen of ['approval', 'acceptance', 'review', 'audit', 'transition']) {
        expect(body.toLowerCase()).not.toContain(frozen);
      }
    });

    it('reflects rows that arrive after the case was opened', async () => {
      const { caseId, loser } = await seedCase();
      const first = dataOf<CasePayload>(await read(caseId).expect(200));
      expect(first.consequencePreview.uploadedAssets).toBe(0);

      await seedUploadedAssets(context, loser, 3);

      // Computed from current rows every time, and stored nowhere: an advisory
      // number, not a reservation taken when the case was opened.
      const second = dataOf<CasePayload>(await read(caseId).expect(200));
      expect(second.consequencePreview.uploadedAssets).toBe(3);
    });
  });

  describe('the read writes nothing', () => {
    it('leaves both customers, the case and every table untouched across two reads', async () => {
      const { caseId, survivor, loser } = await seedCase();
      await seedOwnedCommerce(context, loser);

      const loserBefore = await ownershipSnapshot(context, loser);
      const survivorBefore = await ownershipSnapshot(context, survivor);
      const auditBefore = await auditEventCount(context);

      await read(caseId).expect(200);
      await read(caseId).expect(200);

      expect(await ownershipSnapshot(context, loser)).toEqual(loserBefore);
      expect(await ownershipSnapshot(context, survivor)).toEqual(survivorBefore);
      expect(loserBefore.mergedIntoCustomerId).toBeNull();
      // A support read is not a business action: no audit row for a page view.
      expect(await auditEventCount(context)).toBe(auditBefore);
      // And no execution step kind, which is the row a preview must never write.
      expect(await mergeEventCount(context)).toBe(0);
    });
  });
});
