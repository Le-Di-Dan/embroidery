/**
 * `APP10-E01` journey **J2** — the guarded merge, from resolving two Customers
 * to an executed, replay-safe merge.
 *
 * ### One pair, four ordered cases
 *
 * The four cases run **in order against one surviving pair**, and that is the
 * point: each `B0n` suite seeds the exact state it needs and asserts one
 * operation on it, which cannot show that the preview an operator read is the
 * preview the execution then acted on. Here the case is opened by the real
 * `adminCustomerMerge_open` from ids the real resolver returned, previewed by
 * the real detail read, refused or executed by the real execute operation, and
 * every assertion is about rows the previous case left behind.
 *
 * `maxWorkers: 1` in `jest.app10-e01.config.mjs` is what makes that legal.
 *
 * ### The conflict case uses a second pair, deliberately
 *
 * `J2-C2` needs both participants to hold a business profile. Seeding one onto
 * the survivor of the main pair and deleting it again would leave the executed
 * merge asserting against a fixture this file had edited mid-journey. A separate
 * pair costs two customers and keeps `E01-05`'s "nothing was destroyed" claim
 * about rows nothing in this file ever touched.
 *
 * ### Reused, deliberately not rerun
 *
 * `APP10-B03`'s controlled-rollback proof and its concurrent-execute race stay
 * in `admin-customer-merge-execution-guards.integration.spec.ts`. Neither is a
 * cross-boundary claim, both need fault injection, and E01 reruns neither.
 */
import request from 'supertest';

import {
  FIXTURE_EMAIL,
  FIXTURE_PHONE,
  ROUTES,
  SECOND_FIXTURE_EMAIL,
  SECOND_FIXTURE_PHONE,
  createAdminSupportContext,
  dataOf,
  type AdminSupportTestContext,
} from '../../../src/modules/customer/tests/integration/admin-support-context';
import {
  CUSTOMER_MERGE_CASE_EXECUTED_ACTION,
  CUSTOMER_MERGE_CASE_OPENED_ACTION,
} from '../../../src/modules/customer/application/customer-merge-audit.recorder';
import {
  contactRows,
  frozenEvidenceOwners,
  grantRows,
  mergeEventRows,
  mergeEventSteps,
  seedActorHistory,
  seedBusinessProfile,
} from '../../../src/modules/customer/tests/integration/customer-merge-execution-queries';
import {
  mergeAuditRows,
  mergeCaseRows,
  mergeEventCount,
  ownershipSnapshot,
  seedBareCustomer,
  seedOwnedCommerce,
  type OwnedCommerce,
  type OwnershipSnapshot,
} from '../../../src/modules/customer/tests/integration/customer-merge-queries';

interface Resolution {
  readonly customerId: string;
}

interface Opened {
  readonly mergeCaseId: string;
  readonly status: string;
}

interface Executed {
  readonly mergeCaseId: string;
  readonly status: string;
  readonly outcome: string;
}

interface Preview {
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
}

interface MergeCase {
  readonly mergeCaseId: string;
  readonly status: string;
  readonly reason: string;
  readonly requestedByAdminId: string;
  readonly decidedAt?: string;
  readonly survivor?: { readonly customerId: string; readonly contacts: readonly unknown[] };
  readonly loser?: { readonly customerId: string; readonly contacts: readonly unknown[] };
  readonly consequencePreview: Preview;
}

/** The two conflicting participants' contacts. Distinct: CST-005 is global. */
const CONFLICT_SURVIVOR_EMAIL = 'dung.le@vidu-e01-conflict.test';
const CONFLICT_LOSER_EMAIL = 'em.vo@vidu-e01-conflict.test';

const OPEN_REASON = 'Cùng một người: số điện thoại được đăng ký lại dưới email mới sau một lỗi gõ.';

describe('APP10-E01 · J2 guarded merge preview to execution', () => {
  let context: AdminSupportTestContext;
  let survivor: string;
  let loser: string;
  let commerce: OwnedCommerce;
  let caseId: string;
  /** Ownership as it stood the moment the preview was read. */
  let atPreview: { survivor: OwnershipSnapshot; loser: OwnershipSnapshot };

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-e01-j2-merge');
    await context.reset();
    await context.seedAdminSession();

    const survivorSeed = await context.seedCustomer();
    const loserSeed = await context.seedCustomer({
      email: SECOND_FIXTURE_EMAIL,
      phone: SECOND_FIXTURE_PHONE,
    });
    survivor = survivorSeed.customerId;
    loser = loserSeed.customerId;

    // The merged-away Customer owns things and has frozen evidence about them.
    commerce = await seedOwnedCommerce(context, loser);
    await seedActorHistory(context, {
      customerId: loser,
      orderId: commerce.orderId,
      requestId: commerce.customRequestId,
    });
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  const authed = () => ({ Cookie: context.adminCookie() });

  const resolve = (contactKind: 'EMAIL' | 'PHONE', contact: string) =>
    request(context.server()).post(ROUTES.resolve()).set(authed()).send({ contactKind, contact });

  const openCase = (body: Record<string, unknown>) =>
    request(context.server()).post(ROUTES.openMerge()).set(authed()).send(body);

  const readCase = (id: string) =>
    request(context.server()).get(ROUTES.mergeCase(id)).set(authed());

  const execute = (id: string) =>
    request(context.server()).post(ROUTES.executeMerge(id)).set(authed());

  /** E01-03 — J2-C1. */
  it('E01-03 · opens a case in an explicit direction and previews it without moving anything', async () => {
    // Both participants come from the one lookup this system has. The operator
    // types two contacts; the server is never asked to guess who survives.
    const survivorHit = dataOf<Resolution>(await resolve('EMAIL', FIXTURE_EMAIL).expect(200));
    const loserHit = dataOf<Resolution>(await resolve('EMAIL', SECOND_FIXTURE_EMAIL).expect(200));
    expect(survivorHit.customerId).toBe(survivor);
    expect(loserHit.customerId).toBe(loser);

    // A reason is mandatory — a merge case with no stated justification is
    // evidence that explains nothing, and only the operator can supply it.
    await openCase({ survivorCustomerId: survivor, loserCustomerId: loser }).expect(400);
    await openCase({ survivorCustomerId: survivor, loserCustomerId: loser, reason: '   ' }).expect(
      400,
    );
    // And a Customer may not absorb itself.
    await openCase({
      survivorCustomerId: survivor,
      loserCustomerId: survivor,
      reason: OPEN_REASON,
    }).expect(400);

    const before = {
      survivor: await ownershipSnapshot(context, survivor),
      loser: await ownershipSnapshot(context, loser),
    };

    const opened = dataOf<Opened>(
      await openCase({
        survivorCustomerId: survivor,
        loserCustomerId: loser,
        reason: OPEN_REASON,
      }).expect(201),
    );
    expect(opened.status).toBe('REQUESTED');
    caseId = opened.mergeCaseId;

    const detail = dataOf<MergeCase>(await readCase(caseId).expect(200));

    // The direction is the operator's and is never swapped or inferred.
    expect(detail.survivor?.customerId).toBe(survivor);
    expect(detail.loser?.customerId).toBe(loser);
    expect(detail.status).toBe('REQUESTED');
    expect(detail.reason).toBe(OPEN_REASON);
    expect(detail.requestedByAdminId).toBe(context.adminId());
    expect(detail.decidedAt).toBeUndefined();

    // The preview counts every live category the merge would move.
    expect(detail.consequencePreview).toEqual({
      contactPoints: 2,
      activeSecureAccessGrants: 1,
      customRequests: 2,
      orders: 1,
      uploadedAssets: 2,
      businessProfile: { loserHasProfile: true, survivorHasProfile: false, conflict: false },
    });

    // Both Customer cards carry masked contacts and no raw value anywhere — this
    // is the one screen an operator sees two people's contacts on at once.
    const raw = JSON.stringify((await readCase(caseId)).body);
    for (const forbidden of [
      FIXTURE_EMAIL,
      FIXTURE_PHONE,
      SECOND_FIXTURE_EMAIL,
      SECOND_FIXTURE_PHONE,
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    expect(raw.toLowerCase()).not.toContain('tokenhash');
    expect(raw.toLowerCase()).not.toContain('companyname');

    // Opening and previewing moved nothing. One comparison over all nine
    // categories, so a category added later cannot go silently unwatched.
    atPreview = {
      survivor: await ownershipSnapshot(context, survivor),
      loser: await ownershipSnapshot(context, loser),
    };
    expect(atPreview.survivor).toEqual(before.survivor);
    expect(atPreview.loser).toEqual(before.loser);
    // And the preview is derived on read: it appended no merge event.
    expect(await mergeEventCount(context)).toBe(0);
  });

  /** E01-04 — J2-C2, on its own pair. */
  it('E01-04 · refuses execution while both Customers hold a business profile, destroying nothing', async () => {
    const conflictSurvivor = await seedBareCustomer(
      context,
      CONFLICT_SURVIVOR_EMAIL,
      'E01 Survivor',
    );
    const conflictLoser = await seedBareCustomer(context, CONFLICT_LOSER_EMAIL, 'E01 Loser');
    await seedBusinessProfile(context, conflictSurvivor, 'Công ty Vi Du Survivor');
    await seedBusinessProfile(context, conflictLoser, 'Công ty Vi Du Loser');
    // A live grant, so "no grant was revoked" is a claim about a real ACTIVE row.
    const conflictRequest = await context.seedRequest(conflictLoser);
    await context.seedGrant({
      customerId: conflictLoser,
      customRequestId: conflictRequest,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 3_600_000),
      marker: 'e01-conflict',
    });

    const opened = dataOf<Opened>(
      await openCase({
        survivorCustomerId: conflictSurvivor,
        loserCustomerId: conflictLoser,
        reason: 'Hai hồ sơ doanh nghiệp — cần người quyết định.',
      }).expect(201),
    );
    const conflictCaseId = opened.mergeCaseId;

    // The operator sees the conflict *before* confirming, not as a refusal at the
    // end of the workflow: only a person can decide which profile is right.
    const detail = dataOf<MergeCase>(await readCase(conflictCaseId).expect(200));
    expect(detail.consequencePreview.businessProfile).toEqual({
      loserHasProfile: true,
      survivorHasProfile: true,
      conflict: true,
    });

    const before = {
      survivor: await ownershipSnapshot(context, conflictSurvivor),
      loser: await ownershipSnapshot(context, conflictLoser),
      events: await mergeEventCount(context),
    };

    // And the backend refuses independently of what any client rendered.
    await execute(conflictCaseId).expect(409);

    // Fail-closed: the refusal happened before anything moved, was revoked or
    // was tombstoned.
    expect(await ownershipSnapshot(context, conflictSurvivor)).toEqual(before.survivor);
    expect(await ownershipSnapshot(context, conflictLoser)).toEqual(before.loser);
    expect((await ownershipSnapshot(context, conflictLoser)).mergedIntoCustomerId).toBeNull();
    expect((await ownershipSnapshot(context, conflictLoser)).activeGrants).toBe(1);
    expect(await mergeEventCount(context)).toBe(before.events);

    // The case is still open, so an operator can resolve the profiles and retry.
    const cases = await mergeCaseRows(context);
    const conflictRow = cases.find((row) => row.id === conflictCaseId);
    expect(conflictRow?.status).toBe('REQUESTED');
    expect(conflictRow?.decided_at).toBeNull();

    // A refused execute is not an executed one: it wrote no execution audit.
    const audits = await mergeAuditRows(context, conflictCaseId);
    expect(audits.map((row) => row.action)).toEqual([CUSTOMER_MERGE_CASE_OPENED_ACTION]);
  });

  /** E01-05 — J2-C3. */
  it('E01-05 · executes the non-conflicting merge atomically and leaves immutable evidence', async () => {
    const frozenBefore = await frozenEvidenceOwners(context);
    const contactsBefore = await contactRows(context);
    const loserContactsBefore = contactsBefore.filter((row) => row.customer_id === loser);
    expect(loserContactsBefore).toHaveLength(2);

    const executed = dataOf<Executed>(await execute(caseId).expect(200));
    expect(executed).toEqual({ mergeCaseId: caseId, status: 'EXECUTED', outcome: 'EXECUTED' });

    const loserAfter = await ownershipSnapshot(context, loser);
    const survivorAfter = await ownershipSnapshot(context, survivor);

    // The merged-away Customer owns nothing live and points at the survivor.
    expect(loserAfter.mergedIntoCustomerId).toBe(survivor);
    expect(loserAfter.contactPoints).toBe(0);
    expect(loserAfter.customRequests).toBe(0);
    expect(loserAfter.orders).toBe(0);
    expect(loserAfter.uploadedAssets).toBe(0);
    expect(loserAfter.businessProfiles).toBe(0);
    expect(loserAfter.activeGrants).toBe(0);

    // The survivor owns all of it, on top of what it already had, and its own
    // identity is untouched. The counts are the preview's, which is what makes
    // the preview an honest promise rather than a coincidence.
    expect(survivorAfter.mergedIntoCustomerId).toBeNull();
    expect(survivorAfter.contactPoints).toBe(atPreview.survivor.contactPoints + 2);
    expect(survivorAfter.customRequests).toBe(atPreview.loser.customRequests);
    expect(survivorAfter.orders).toBe(atPreview.loser.orders);
    expect(survivorAfter.uploadedAssets).toBe(atPreview.loser.uploadedAssets);
    expect(survivorAfter.businessProfiles).toBe(1);

    // Verification evidence travelled with every moved contact: the move changed
    // `customer_id` and nothing else.
    const contactsAfter = await contactRows(context);
    for (const before of loserContactsBefore) {
      const after = contactsAfter.find((row) => row.id === before.id);
      expect(after?.customer_id).toBe(survivor);
      expect(after?.normalized_value).toBe(before.normalized_value);
      expect(after?.verified_at).toBe(before.verified_at);
      expect(after?.verified_source).toBe(before.verified_source);
      expect(after?.deactivated_at).toBe(before.deactivated_at);
    }
    // Exactly one primary survives per Customer (CST-006).
    const survivorPrimaries = contactsAfter.filter(
      (row) => row.customer_id === survivor && row.is_primary,
    );
    expect(survivorPrimaries).toHaveLength(1);

    // Every live link the merged-away Customer held is closed.
    const grants = await grantRows(context);
    const loserGrants = grants.filter((row) => row.id === commerce.grantId);
    expect(loserGrants[0]?.status).toBe('REVOKED');
    expect(loserGrants[0]?.revoke_reason).not.toBeNull();

    // Frozen commercial evidence still names the merged-away Customer. The
    // strongest available form: it fails both if a row were repointed and if one
    // were deleted.
    const frozenAfter = await frozenEvidenceOwners(context);
    expect(frozenAfter).toEqual(frozenBefore);
    expect(frozenAfter.approvalSnapshotOwners).toContain(loser);
    expect(frozenAfter.quotationAcceptanceOwners).toContain(loser);
    expect(frozenAfter.orderTransitionOwners).toContain(loser);
    expect(frozenAfter.requestTransitionOwners).toContain(loser);

    // One canonical step sequence, appended by the transaction that moved the
    // rows, carrying its own counts and no contact value of any kind.
    const steps = await mergeEventSteps(context);
    expect(steps.every((step) => step.affected >= 0)).toBe(true);
    expect(new Set(steps.map((step) => step.step))).toEqual(
      new Set(['OWNERSHIP_TRANSFER', 'CONTACT_MOVE', 'GRANT_REVOKE', 'TOMBSTONE']),
    );
    const eventsRaw = JSON.stringify(await mergeEventRows(context));
    for (const forbidden of [
      FIXTURE_EMAIL,
      FIXTURE_PHONE,
      SECOND_FIXTURE_EMAIL,
      SECOND_FIXTURE_PHONE,
    ]) {
      expect(eventsRaw).not.toContain(forbidden);
    }

    const cases = await mergeCaseRows(context);
    const executedRow = cases.find((row) => row.id === caseId);
    expect(executedRow?.status).toBe('EXECUTED');
    expect(executedRow?.decided_at).not.toBeNull();

    // One execute audit row beside the open one, against the real Admin.
    const audits = await mergeAuditRows(context, caseId);
    expect(audits.map((row) => row.action)).toEqual([
      CUSTOMER_MERGE_CASE_OPENED_ACTION,
      CUSTOMER_MERGE_CASE_EXECUTED_ACTION,
    ]);
    expect(audits[1]?.actor_kind).toBe('ADMIN');
    expect(audits[1]?.admin_id).toBe(context.adminId());
  });

  /** E01-06 — J2-C4. */
  it('E01-06 · answers a replayed execute safely and duplicates nothing', async () => {
    const before = {
      survivor: await ownershipSnapshot(context, survivor),
      loser: await ownershipSnapshot(context, loser),
      events: await mergeEventRows(context),
      grants: await grantRows(context),
      contacts: await contactRows(context),
      audits: await mergeAuditRows(context, caseId),
      frozen: await frozenEvidenceOwners(context),
    };
    expect(before.audits).toHaveLength(2);

    const replayed = dataOf<Executed>(await execute(caseId).expect(200));
    // A success the client can tell apart: this request performed nothing, and an
    // operator is never shown a confirmation for work it did not do.
    expect(replayed).toEqual({
      mergeCaseId: caseId,
      status: 'EXECUTED',
      outcome: 'ALREADY_EXECUTED',
    });

    // Nothing moved a second time, nothing was revoked again, nothing was
    // tombstoned again, and neither a merge event nor an audit row was appended.
    expect(await ownershipSnapshot(context, survivor)).toEqual(before.survivor);
    expect(await ownershipSnapshot(context, loser)).toEqual(before.loser);
    expect(await mergeEventRows(context)).toEqual(before.events);
    expect(await grantRows(context)).toEqual(before.grants);
    expect(await contactRows(context)).toEqual(before.contacts);
    expect(await mergeAuditRows(context, caseId)).toEqual(before.audits);
    expect(await frozenEvidenceOwners(context)).toEqual(before.frozen);
  });
});
