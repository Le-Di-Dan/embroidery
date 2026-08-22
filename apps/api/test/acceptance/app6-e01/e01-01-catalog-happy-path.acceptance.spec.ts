/**
 * `APP6-E01-01` — the Catalog happy path.
 *
 * One commission, seeded at `UNDER_REVIEW` and nowhere further, driven from
 * `APP6-B01` to `APP6-B11` entirely through owning HTTP operations:
 *
 * ```text
 * UNDER_REVIEW → QUOTED → QUOTE_ACCEPTED → DIGITIZING → DESIGN_REVIEW → APPROVED
 * ```
 *
 * Every one of those six states except `DIGITIZING` is a **system projection**.
 * The harness has no route, repository or statement that can set one, so a
 * status the ledger below records is a status the application produced.
 *
 * The case is written as one ordered sequence of `it` blocks sharing a run
 * state, rather than one enormous assertion, so a failure names the step that
 * broke rather than "the journey".
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

/** This case's own public source, so its calls share no limiter bucket. */
const SOURCE = '203.0.113.11';

interface RunState {
  commission?: SeededCommission;
  quotationId?: string;
  draftVersionId?: string;
  secondVersionId?: string;
  designVersionId?: string;
  documentHash?: string;
  agreements?: AcceptedAgreement[];
  approvalSnapshotId?: string;
}

describe('APP6-E01-01 — Catalog happy path', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  const run: RunState = {};

  beforeAll(async () => {
    context = await createApp6AcceptanceContext('app6-e01-01-catalog');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      SOURCE,
    );
    await context.reset();
    await context.publishDeliveredPolicies();
    run.commission = await context.seedCommission();
  }, 180_000);

  afterAll(async () => {
    await context.close();
  });

  const commission = (): SeededCommission => {
    const value = run.commission;
    if (value === undefined) throw new Error('The commission was not seeded.');
    return value;
  };

  const requestStatus = async (): Promise<string> => {
    const [row] = await context.rows<{ readonly status: string }>(
      sql`select status from custom_requests where id = ${commission().requestId}`,
    );
    return row?.status ?? 'MISSING';
  };

  it('starts from a prerequisite request at UNDER_REVIEW and nothing further', async () => {
    expect(await requestStatus()).toBe('UNDER_REVIEW');
    // Nothing APP6 owns exists yet: the journey has to build all of it.
    expect(await context.count(sql`select count(*)::text as count from quotations`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from design_versions`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from approval_snapshots`)).toBe(
      0,
    );
  });

  it('B01 — an eligible request can be quoted, and exact money survives the wire', async () => {
    const response = await journey
      .createQuotation(commission().requestId, pricingAt(150_000))
      .expect(201);
    const drafted = dataOf<{
      readonly quotationId: string;
      readonly versionId: string;
      readonly version: number;
      readonly versionStatus: string;
      readonly subtotalAmount: string;
      readonly shippingFeeAmount: string;
      readonly totalAmount: string;
      readonly depositPercent: string;
      readonly depositAmount: string;
      readonly remainingAmount: string;
    }>(response);

    run.quotationId = drafted.quotationId;
    run.draftVersionId = drafted.versionId;

    expect(drafted.version).toBe(1);
    expect(drafted.versionStatus).toBe('DRAFT');
    // 24 × 150 000 = 3 600 000, + 50 000 shipping = 3 650 000, 40 % deposit.
    expect(drafted.subtotalAmount).toBe('3600000.00');
    expect(drafted.shippingFeeAmount).toBe('50000.00');
    expect(drafted.totalAmount).toBe('3650000.00');
    expect(drafted.depositPercent).toBe('40.00');
    expect(drafted.depositAmount).toBe('1460000.00');
    // Remainder by subtraction, never by a second rounding (DB4).
    expect(drafted.remainingAmount).toBe('2190000.00');
    // Drafting moves nothing.
    expect(await requestStatus()).toBe('UNDER_REVIEW');
  });

  it('B01/B02 — a second draft version appends, and history explains both', async () => {
    const response = await journey
      .addQuotationVersion(run.quotationId!, pricingAt(140_000))
      .expect(201);
    run.secondVersionId = dataOf<{ readonly versionId: string }>(response).versionId;

    const history = await journey.quotationHistory(run.quotationId!).expect(200);
    const versions = dataOf<{
      readonly versions: readonly { readonly versionId: string; readonly version: number }[];
    }>(history).versions;

    expect(versions.map((entry) => entry.version)).toEqual([1, 2]);
    // The first version is still readable and still says what it always said.
    const first = await journey.quotationVersion(run.quotationId!, run.draftVersionId!).expect(200);
    expect(
      dataOf<{ readonly version: { readonly totalAmount: string } }>(first).version.totalAmount,
    ).toBe('3650000.00');
    expect(await requestStatus()).toBe('UNDER_REVIEW');
  });

  it('B03 — sending the exact second version projects QUOTED', async () => {
    const response = await journey
      .sendQuotation(run.quotationId!, run.secondVersionId!)
      .expect(200);
    const sent = dataOf<{
      readonly version: {
        readonly versionId: string;
        readonly status: string;
        readonly validUntil: string | null;
        readonly totalAmount: string;
      };
      readonly requestStatus: string;
      readonly requestTransitioned: boolean;
    }>(response);

    expect(sent.version.versionId).toBe(run.secondVersionId);
    expect(sent.version.status).toBe('SENT');
    expect(sent.version.validUntil).not.toBeNull();
    // The send freezes; it does not re-price.
    expect(sent.version.totalAmount).toBe('3410000.00');
    expect(sent.requestTransitioned).toBe(true);
    expect(sent.requestStatus).toBe('QUOTED');
    expect(await requestStatus()).toBe('QUOTED');
  });

  it('B04 — the customer reads that exact version through REQUEST_ACCESS alone', async () => {
    const response = await journey.readQuotation(commission().token, SOURCE).expect(200);
    const view = dataOf<{
      readonly versionId: string;
      readonly version: number;
      readonly status: string;
      readonly totalAmount: string;
      readonly expired: boolean;
    }>(response);

    expect(view.versionId).toBe(run.secondVersionId);
    expect(view.version).toBe(2);
    expect(view.status).toBe('SENT');
    expect(view.totalAmount).toBe('3410000.00');
    expect(view.expired).toBe(false);
  });

  it('B05 — acceptance requires STEP_UP, binds the exact version and projects QUOTE_ACCEPTED', async () => {
    // GRD-003 runs first, on a customer with no standing re-verification.
    const refused = await journey
      .acceptQuotation(commission().token, run.secondVersionId!, SOURCE)
      .expect(403);
    expect(codeOf(refused)).toBe('REVERIFICATION_REQUIRED');
    expect(await requestStatus()).toBe('QUOTED');

    await context.addStepUp(commission());

    const response = await journey
      .acceptQuotation(commission().token, run.secondVersionId!, SOURCE)
      .expect(200);
    const accepted = dataOf<{
      readonly versionId: string;
      readonly versionStatus: string;
      readonly quotationStatus: string;
      readonly requestStatus: string;
      readonly acceptedTotalAmount: string;
      readonly replayed: boolean;
    }>(response);

    expect(accepted.versionId).toBe(run.secondVersionId);
    expect(accepted.versionStatus).toBe('ACCEPTED');
    expect(accepted.quotationStatus).toBe('ACCEPTED');
    expect(accepted.acceptedTotalAmount).toBe('3410000.00');
    expect(accepted.replayed).toBe(false);
    expect(accepted.requestStatus).toBe('QUOTE_ACCEPTED');
    expect(await requestStatus()).toBe('QUOTE_ACCEPTED');

    // The evidence names the grant and the challenge the server derived; the
    // caller supplied neither.
    const [evidence] = await context.rows<{
      readonly grant_id: string;
      readonly step_up_challenge_id: string;
      readonly accepted_total_amount: string;
    }>(sql`
      select grant_id, step_up_challenge_id, accepted_total_amount
        from quotation_acceptances where quotation_version_id = ${run.secondVersionId!}
    `);
    expect(evidence?.grant_id).toBe(commission().grantId);
    expect(evidence?.step_up_challenge_id).not.toBeUndefined();
    expect(evidence?.accepted_total_amount).toBe('3410000.00');
  });

  it('B06 — DIGITIZING is commanded, and it is the only APP6 state that is', async () => {
    const response = await journey.startDigitizing(commission().requestId).expect(200);
    const moved = dataOf<{ readonly fromStatus: string; readonly toStatus: string }>(response);

    expect(moved.fromStatus).toBe('QUOTE_ACCEPTED');
    expect(moved.toStatus).toBe('DIGITIZING');
    expect(await requestStatus()).toBe('DIGITIZING');
  });

  it('B07 — the submitted Catalog design source is readable as the digitizing input', async () => {
    const response = await journey.submittedDesign(commission().requestId).expect(200);
    const source = dataOf<{
      readonly submittedDesign: {
        readonly sessionId: string;
        readonly documentSchemaVersion: number;
        readonly document: unknown;
      } | null;
    }>(response).submittedDesign;

    expect(source).not.toBeNull();
    expect(source?.sessionId).toBe(commission().submittedSessionId);
    expect(source?.documentSchemaVersion).toBe(1);
    // No session secret, storage key or bucket reaches an Admin read.
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('session_secret');
    expect(body).not.toContain('sessionSecret');
  });

  it('B08 — a formal v1 Catalog version is authored with the complete frozen quartet', async () => {
    const placement = commission().placement!;
    const response = await journey
      .authorDesignVersion(commission().requestId, {
        document: catalogDocument(placement, [shapeAt('elm-1', 120, 170, 200, 120)]),
      })
      .expect(201);
    const version = dataOf<{
      readonly version: {
        readonly versionId: string;
        readonly version: number;
        readonly status: string;
        readonly branch: string;
        readonly productId: string | null;
        readonly productVariantId: string | null;
        readonly productSideId: string | null;
        readonly embroideryAreaId: string | null;
        readonly placementSideLabel: string | null;
        readonly placementAreaLabel: string | null;
        readonly parentVersionId: string | null;
      };
    }>(response).version;

    run.designVersionId = version.versionId;

    expect(version.version).toBe(1);
    expect(version.status).toBe('DRAFT');
    expect(version.branch).toBe('CATALOG');
    // The quartet is complete, and every part is the seeded one — nothing was
    // substituted for a missing row.
    expect(version.productId).toBe(placement.productId);
    expect(version.productVariantId).toBe(placement.productVariantId);
    expect(version.productSideId).toBe(placement.productSideId);
    expect(version.embroideryAreaId).toBe(placement.embroideryAreaId);
    // The COP columns stay null on this branch; CST-129 admits one or the other.
    expect(version.placementSideLabel).toBeNull();
    expect(version.placementAreaLabel).toBeNull();
    expect(version.parentVersionId).toBeNull();
    // Authoring moves nothing.
    expect(await requestStatus()).toBe('DIGITIZING');
  });

  it('B09 — sending that version stores the canonical hash and projects DESIGN_REVIEW', async () => {
    const response = await journey
      .sendDesignVersion(commission().requestId, run.designVersionId!)
      .expect(200);
    const sent = dataOf<{
      readonly sent: {
        readonly versionId: string;
        readonly versionStatus: string;
        readonly requestStatus: string;
        readonly requestTransitioned: boolean;
        readonly documentHash: string;
        readonly branch: string;
      };
    }>(response).sent;

    expect(sent.versionId).toBe(run.designVersionId);
    expect(sent.versionStatus).toBe('SENT_FOR_REVIEW');
    expect(sent.branch).toBe('CATALOG');
    expect(sent.documentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sent.requestTransitioned).toBe(true);
    expect(sent.requestStatus).toBe('DESIGN_REVIEW');
    expect(await requestStatus()).toBe('DESIGN_REVIEW');

    const [stored] = await context.rows<{ readonly document_hash: string }>(
      sql`select document_hash from design_versions where id = ${run.designVersionId!}`,
    );
    expect(stored?.document_hash).toBe(sent.documentHash);
  });

  it('B10 — the customer reads the exact active version and its effective agreements', async () => {
    const response = await journey.readReview(commission().token, SOURCE).expect(200);
    const view = dataOf<{
      readonly designVersionId: string;
      readonly version: number;
      readonly documentSchemaVersion: number;
      readonly documentHash: string;
      readonly document: unknown;
      readonly agreements: readonly {
        readonly agreementVersionId: string;
        readonly agreementType: string;
        readonly contentHash: string;
        readonly content: string;
      }[];
    }>(response);

    run.documentHash = view.documentHash;
    run.agreements = view.agreements.map((agreement) => ({
      agreementVersionId: agreement.agreementVersionId,
      contentHash: agreement.contentHash,
    }));

    expect(view.designVersionId).toBe(run.designVersionId);
    expect(view.version).toBe(1);
    expect(view.documentSchemaVersion).toBe(1);
    expect(view.documentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(view.document).not.toBeNull();

    // The effective set is exactly the two types the delivered policy requires.
    expect([...view.agreements].map((entry) => entry.agreementType).sort()).toEqual([
      'PAYMENT_POLICY',
      'RETURN_POLICY',
    ]);
    for (const agreement of view.agreements) {
      expect(agreement.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(agreement.content.length).toBeGreaterThan(0);
    }
  });

  it('B11 — approval binds the exact version, hash and agreement set, and projects APPROVED', async () => {
    const response = await journey
      .approveDesign(
        commission().token,
        run.designVersionId!,
        run.documentHash!,
        run.agreements!,
        SOURCE,
      )
      .expect(200);
    const approved = dataOf<{
      readonly versionId: string;
      readonly versionStatus: string;
      readonly approvalSnapshotId: string;
      readonly documentHash: string;
      readonly requestStatus: string;
      readonly replayed: boolean;
    }>(response);

    run.approvalSnapshotId = approved.approvalSnapshotId;

    expect(approved.versionId).toBe(run.designVersionId);
    expect(approved.versionStatus).toBe('APPROVED');
    // The stored hash is what is frozen — never a hash the caller chose.
    expect(approved.documentHash).toBe(run.documentHash);
    expect(approved.replayed).toBe(false);
    expect(approved.requestStatus).toBe('APPROVED');
    expect(await requestStatus()).toBe('APPROVED');

    const [snapshot] = await context.rows<{
      readonly document_hash: string;
      readonly product_id: string | null;
      readonly product_variant_id: string | null;
      readonly customer_owned_product_id: string | null;
      readonly quantity_total: number;
      readonly grant_id: string;
      readonly step_up_challenge_id: string;
    }>(sql`
      select document_hash, product_id, product_variant_id, customer_owned_product_id,
             quantity_total, grant_id, step_up_challenge_id
        from approval_snapshots where id = ${approved.approvalSnapshotId}
    `);
    expect(snapshot?.document_hash).toBe(run.documentHash);
    expect(snapshot?.product_id).toBe(commission().placement!.productId);
    expect(snapshot?.product_variant_id).toBe(commission().placement!.productVariantId);
    expect(snapshot?.customer_owned_product_id).toBeNull();
    expect(Number(snapshot?.quantity_total)).toBe(commission().quantityTotal);
    expect(snapshot?.grant_id).toBe(commission().grantId);
    expect(snapshot?.step_up_challenge_id).not.toBeUndefined();

    // Exactly the agreement versions B10 supplied, no more and no fewer.
    const acceptances = await context.rows<{
      readonly agreement_version_id: string;
      readonly content_hash: string;
    }>(sql`
      select agreement_version_id, content_hash
        from approval_snapshot_agreement_acceptances
       where approval_snapshot_id = ${approved.approvalSnapshotId}
       order by agreement_type
    `);
    expect(acceptances).toHaveLength(run.agreements!.length);
    expect(acceptances.map((row) => row.agreement_version_id).sort()).toEqual(
      run.agreements!.map((entry) => entry.agreementVersionId).sort(),
    );
    for (const acceptance of acceptances) {
      const submitted = run.agreements!.find(
        (entry) => entry.agreementVersionId === acceptance.agreement_version_id,
      );
      expect(acceptance.content_hash).toBe(submitted?.contentHash);
    }
  });

  it('the Approval Snapshot is immutable, and APP6 created no APP7 artifact', async () => {
    // CST/S-trigger: a protected column on a committed snapshot cannot be rewritten.
    await expect(
      context.rows(sql`
        update approval_snapshots set document_hash = ${'sha256:' + 'b'.repeat(64)}
         where id = ${run.approvalSnapshotId!}
      `),
    ).rejects.toThrow();
    const [unchanged] = await context.rows<{ readonly document_hash: string }>(
      sql`select document_hash from approval_snapshots where id = ${run.approvalSnapshotId!}`,
    );
    expect(unchanged?.document_hash).toBe(run.documentHash);

    // The APP7 boundary: nothing downstream of approval was created here.
    expect(await context.count(sql`select count(*)::text as count from orders`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from payment_attempts`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from payment_obligations`)).toBe(
      0,
    );
    expect(await context.count(sql`select count(*)::text as count from production_jobs`)).toBe(0);
    expect(
      await context.count(sql`select count(*)::text as count from inventory_reservations`),
    ).toBe(0);
  });

  it('records the full lifecycle ledger, every state after entry produced by an operation', async () => {
    const transitions = await context.rows<{
      readonly from_status: string;
      readonly to_status: string;
      readonly actor_kind: string;
    }>(sql`
      select from_status, to_status, actor_kind
        from custom_request_transitions
       where custom_request_id = ${commission().requestId}
       order by id
    `);

    expect(transitions.map((row) => `${row.from_status}→${row.to_status}`)).toEqual([
      'UNDER_REVIEW→QUOTED',
      'QUOTED→QUOTE_ACCEPTED',
      'QUOTE_ACCEPTED→DIGITIZING',
      'DIGITIZING→DESIGN_REVIEW',
      'DESIGN_REVIEW→APPROVED',
    ]);
    // The four system projections are recorded as `system`; only DIGITIZING was
    // commanded, and it alone carries an ADMIN actor.
    const commanded = transitions.filter((row) => row.to_status === 'DIGITIZING');
    expect(commanded).toHaveLength(1);
    expect(commanded[0]?.actor_kind).toBe('ADMIN');
    for (const row of transitions.filter((entry) => entry.to_status !== 'DIGITIZING')) {
      expect(row.actor_kind).toBe('SYSTEM');
    }
  });
});
