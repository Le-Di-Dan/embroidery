/**
 * `APP6-E01-04` — design review race, revision and immutability.
 *
 * Two commissions, both driven to `DESIGN_REVIEW` through owning operations, and
 * then pushed at the four places the design lane must refuse:
 *
 * 1. a second send while one version is under review (`GRD-004`, `CC-03`);
 * 2. an approval aimed at a version that is not the one under review, or carrying
 *    a hash that is not the stored one (`GRD-007`, `CC-04`);
 * 3. first-decision-wins in both directions — revision then approval, and
 *    approval then revision (`CC-02`);
 * 4. an approved version and its snapshot, once committed, cannot be rewritten.
 *
 * The lower-level permutations of each — every concurrent-send interleaving,
 * every seeded terminal status — are `APP6-B09`'s and `APP6-B11`'s own suites and
 * are **not** repeated here. What this case adds is that the refusals still hold
 * when the whole phase is composed in one injector.
 */
import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  createApp6AcceptanceContext,
  shapeAt,
  type App6AcceptanceContext,
  type SeededCommission,
} from './app6-e01-context';
import {
  codeOf,
  createJourneyDriver,
  dataOf,
  pricingAt,
  type AcceptedAgreement,
  type JourneyDriver,
} from './app6-e01-journey';

const REVISION_SOURCE = '203.0.113.41';
const APPROVAL_SOURCE = '203.0.113.42';

/** A well-formed hash that is not the stored one. */
const FOREIGN_HASH = `sha256:${'c'.repeat(64)}`;

interface UnderReview {
  readonly commission: SeededCommission;
  readonly versionId: string;
  readonly documentHash: string;
  readonly agreements: readonly AcceptedAgreement[];
}

describe('APP6-E01-04 — design race, revision and immutability', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  let revising: UnderReview;
  let approving: UnderReview;
  let secondDraftId: string;

  beforeAll(async () => {
    context = await createApp6AcceptanceContext('app6-e01-04-design-negatives');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      REVISION_SOURCE,
    );
    await context.reset();
    await context.publishDeliveredPolicies();
    revising = await driveToReview(await context.seedCommission(), 150_000, REVISION_SOURCE);
    approving = await driveToReview(await context.seedCommission(), 155_000, APPROVAL_SOURCE);
  }, 240_000);

  afterAll(async () => {
    await context.close();
  });

  /**
   * The whole commercial and design sequence, through owning operations only,
   * leaving the request at `DESIGN_REVIEW` with one version awaiting a decision.
   */
  async function driveToReview(
    commission: SeededCommission,
    unitPrice: number,
    source: string,
  ): Promise<UnderReview> {
    const drafted = await journey
      .createQuotation(commission.requestId, pricingAt(unitPrice))
      .expect(201);
    const quote = dataOf<{ readonly quotationId: string; readonly versionId: string }>(drafted);
    await journey.sendQuotation(quote.quotationId, quote.versionId).expect(200);
    await context.addStepUp(commission);
    await journey.acceptQuotation(commission.token, quote.versionId, source).expect(200);
    await journey.startDigitizing(commission.requestId).expect(200);

    const authored = await journey
      .authorDesignVersion(commission.requestId, {
        document: catalogDocument(commission.placement!, [shapeAt('elm-1', 120, 170, 200, 120)]),
      })
      .expect(201);
    const versionId = dataOf<{ readonly version: { readonly versionId: string } }>(authored).version
      .versionId;
    await journey.sendDesignVersion(commission.requestId, versionId).expect(200);

    const review = await journey.readReview(commission.token, source).expect(200);
    const view = dataOf<{
      readonly documentHash: string;
      readonly agreements: readonly {
        readonly agreementVersionId: string;
        readonly contentHash: string;
      }[];
    }>(review);

    return {
      commission,
      versionId,
      documentHash: view.documentHash,
      agreements: view.agreements.map((agreement) => ({
        agreementVersionId: agreement.agreementVersionId,
        contentHash: agreement.contentHash,
      })),
    };
  }

  const versionStatus = async (versionId: string): Promise<string> => {
    const [row] = await context.rows<{ readonly status: string }>(
      sql`select status from design_versions where id = ${versionId}`,
    );
    return row?.status ?? 'MISSING';
  };

  const requestStatus = async (requestId: string): Promise<string> => {
    const [row] = await context.rows<{ readonly status: string }>(
      sql`select status from custom_requests where id = ${requestId}`,
    );
    return row?.status ?? 'MISSING';
  };

  it('exactly one version is under review after the send', async () => {
    expect(await versionStatus(revising.versionId)).toBe('SENT_FOR_REVIEW');
    expect(await requestStatus(revising.commission.requestId)).toBe('DESIGN_REVIEW');
    expect(
      await context.count(sql`
        select count(*)::text as count from design_versions
         where design_case_id = ${revising.commission.designCaseId}
           and status = 'SENT_FOR_REVIEW'
      `),
    ).toBe(1);
  });

  it('a competing send is refused while a review is active, and writes nothing', async () => {
    // Authoring a second draft is allowed at DESIGN_REVIEW — a revision is
    // another TR-LC08-01. Sending it while the first is under review is not.
    const authored = await journey
      .authorDesignVersion(revising.commission.requestId, {
        document: catalogDocument(revising.commission.placement!, [
          shapeAt('elm-2', 130, 180, 180, 100),
        ]),
      })
      .expect(201);
    secondDraftId = dataOf<{ readonly version: { readonly versionId: string } }>(authored).version
      .versionId;

    const refused = await journey
      .sendDesignVersion(revising.commission.requestId, secondDraftId)
      .expect(409);
    expect(codeOf(refused)).toBe('REVIEW_ALREADY_ACTIVE');

    expect(await versionStatus(secondDraftId)).toBe('DRAFT');
    expect(await versionStatus(revising.versionId)).toBe('SENT_FOR_REVIEW');
    expect(
      await context.count(sql`
        select count(*)::text as count from design_versions
         where design_case_id = ${revising.commission.designCaseId}
           and status = 'SENT_FOR_REVIEW'
      `),
    ).toBe(1);
  });

  it('an approval aimed at a version that is not under review is refused', async () => {
    await context.addStepUp(revising.commission);

    const refused = await journey
      .approveDesign(
        revising.commission.token,
        // The DRAFT sibling, on this customer's own design case — so the refusal
        // is about *which version is under review*, not about ownership.
        secondDraftId,
        revising.documentHash,
        revising.agreements,
        REVISION_SOURCE,
      )
      .expect(409);
    expect(codeOf(refused)).toBe('APPROVAL_VERSION_MISMATCH');

    expect(await versionStatus(secondDraftId)).toBe('DRAFT');
    expect(await versionStatus(revising.versionId)).toBe('SENT_FOR_REVIEW');
    expect(await context.count(sql`select count(*)::text as count from approval_snapshots`)).toBe(
      0,
    );
  });

  it('an approval carrying a hash that is not the stored one is refused (GRD-007)', async () => {
    const refused = await journey
      .approveDesign(
        revising.commission.token,
        revising.versionId,
        FOREIGN_HASH,
        revising.agreements,
        REVISION_SOURCE,
      )
      .expect(409);
    expect(codeOf(refused)).toBe('APPROVAL_VERSION_MISMATCH');

    expect(await versionStatus(revising.versionId)).toBe('SENT_FOR_REVIEW');
    expect(await context.count(sql`select count(*)::text as count from approval_snapshots`)).toBe(
      0,
    );
    expect(await requestStatus(revising.commission.requestId)).toBe('DESIGN_REVIEW');
  });

  it('a revision request binds the exact review version and needs no step-up', async () => {
    // A different customer, deliberately: `approving` has never had a STEP_UP
    // challenge issued, so this leg proves the revision route asks for none.
    const response = await journey
      .requestRevision(
        approving.commission.token,
        approving.versionId,
        'Vui lòng dời hoạ tiết lên cao khoảng 1 cm và làm mảnh nét chỉ viền.',
        APPROVAL_SOURCE,
      )
      .expect(200);
    const decided = dataOf<{
      readonly versionId: string;
      readonly versionStatus: string;
      readonly requestStatus: string;
    }>(response);

    expect(decided.versionId).toBe(approving.versionId);
    expect(decided.versionStatus).toBe('REVISION_REQUESTED');
    // The revision moves the design version only; the request stays put.
    expect(decided.requestStatus).toBe('DESIGN_REVIEW');
    expect(await requestStatus(approving.commission.requestId)).toBe('DESIGN_REVIEW');

    const [review] = await context.rows<{
      readonly outcome: string;
      readonly grant_id: string;
      readonly step_up_challenge_id: string | null;
      readonly feedback: string;
    }>(sql`
      select outcome, grant_id, step_up_challenge_id, feedback
        from design_reviews where design_version_id = ${approving.versionId}
    `);
    // The decision record names the *decision* (`REQUEST_REVISION`); the version
    // it moved names the resulting *state* (`REVISION_REQUESTED`). Two vocabularies
    // on purpose, and this asserts both rather than conflating them.
    expect(review?.outcome).toBe('REQUEST_REVISION');
    // Identity from the grant; no step-up, because none was required.
    expect(review?.grant_id).toBe(approving.commission.grantId);
    expect(review?.step_up_challenge_id).toBeNull();
    expect(review?.feedback).toContain('1 cm');
  });

  it('first decision wins: the revised version can no longer be approved', async () => {
    await context.addStepUp(approving.commission);

    const refused = await journey
      .approveDesign(
        approving.commission.token,
        approving.versionId,
        approving.documentHash,
        approving.agreements,
        APPROVAL_SOURCE,
      )
      .expect(409);
    // `INVALID_TRANSITION`, not `APPROVAL_VERSION_MISMATCH`: the version is the
    // right one and its hash is the stored one — what has changed is that it has
    // already been decided, which is the distinction the published contract draws.
    expect(codeOf(refused)).toBe('INVALID_TRANSITION');

    expect(await versionStatus(approving.versionId)).toBe('REVISION_REQUESTED');
    expect(await requestStatus(approving.commission.requestId)).toBe('DESIGN_REVIEW');
    expect(
      await context.count(sql`
        select count(*)::text as count from design_reviews
         where design_version_id = ${approving.versionId}
      `),
    ).toBe(1);
  });

  it('first decision wins the other way: an approved version refuses a revision request', async () => {
    // `revising` still has one version under review and a standing step-up.
    const approved = await journey
      .approveDesign(
        revising.commission.token,
        revising.versionId,
        revising.documentHash,
        revising.agreements,
        REVISION_SOURCE,
      )
      .expect(200);
    const snapshotId = dataOf<{ readonly approvalSnapshotId: string }>(approved).approvalSnapshotId;
    expect(await requestStatus(revising.commission.requestId)).toBe('APPROVED');

    const refused = await journey
      .requestRevision(
        revising.commission.token,
        revising.versionId,
        'Đổi ý, xin sửa lại hoạ tiết.',
        REVISION_SOURCE,
      )
      .expect(409);
    expect(codeOf(refused)).toBe('INVALID_TRANSITION');

    expect(await versionStatus(revising.versionId)).toBe('APPROVED');
    expect(await requestStatus(revising.commission.requestId)).toBe('APPROVED');
    // One decision, one snapshot: the refusal wrote nothing.
    expect(
      await context.count(sql`
        select count(*)::text as count from design_reviews
         where design_version_id = ${revising.versionId}
      `),
    ).toBe(1);
    expect(
      await context.count(sql`
        select count(*)::text as count from approval_snapshots where id = ${snapshotId}
      `),
    ).toBe(1);
  });

  it('the approved version and its snapshot are both immutable', async () => {
    // `trg_design_versions__reject_mutation` is `frozen_when_not DRAFT` with the
    // lifecycle-advance columns (`status` and its instants) deliberately left
    // mutable — the state machine is the application's, and the leg above already
    // proved it refuses. What the trigger freezes is the *artwork and its
    // fingerprint*, which is what an approval binds.
    await expect(
      context.rows(sql`
        update design_versions set document_hash = ${FOREIGN_HASH}
         where id = ${revising.versionId}
      `),
    ).rejects.toThrow();
    await expect(
      context.rows(sql`
        update design_versions set design_document = '{}'::jsonb
         where id = ${revising.versionId}
      `),
    ).rejects.toThrow();
    expect(await versionStatus(revising.versionId)).toBe('APPROVED');
    const [frozen] = await context.rows<{ readonly document_hash: string }>(
      sql`select document_hash from design_versions where id = ${revising.versionId}`,
    );
    expect(frozen?.document_hash).toBe(revising.documentHash);

    const [snapshot] = await context.rows<{ readonly id: string; readonly document_hash: string }>(
      sql`
        select id, document_hash from approval_snapshots
         where design_version_id = ${revising.versionId}
      `,
    );
    await expect(
      context.rows(sql`
        update approval_snapshots set quantity_total = 1 where id = ${snapshot!.id}
      `),
    ).rejects.toThrow();
    await expect(
      context.rows(sql`
        update approval_snapshot_agreement_acceptances set content_hash = ${FOREIGN_HASH}
         where approval_snapshot_id = ${snapshot!.id}
      `),
    ).rejects.toThrow();

    const [unchanged] = await context.rows<{
      readonly document_hash: string;
      readonly quantity_total: number;
    }>(
      sql`select document_hash, quantity_total from approval_snapshots where id = ${snapshot!.id}`,
    );
    expect(unchanged?.document_hash).toBe(revising.documentHash);
    expect(Number(unchanged?.quantity_total)).toBe(revising.commission.quantityTotal);
  });
});
