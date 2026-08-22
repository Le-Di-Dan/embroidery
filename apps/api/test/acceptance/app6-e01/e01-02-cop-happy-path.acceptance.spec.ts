/**
 * `APP6-E01-02` — the customer-owned-product happy path.
 *
 * The same commercial sequence as `E01-01`, on a request whose subject is the
 * customer's own garment. It exists to prove one thing the Catalog run cannot:
 * that reaching `APPROVED` on the COP branch invents **no Catalog identity**.
 *
 * ```text
 * UNDER_REVIEW → QUOTED → QUOTE_ACCEPTED → DIGITIZING → DESIGN_REVIEW → APPROVED
 * ```
 *
 * The negative space is the assertion here. No product, variant, side or area
 * row is created for this request; no Design Session is fabricated to give the
 * digitizing read something to return; and the frozen placement is the operator's
 * own agreed labels and a positive millimetre envelope, which `ADR-APP6-001`
 * makes the COP branch's only placement authority.
 */
import { sql } from 'drizzle-orm';

import {
  COP_AREA_LABEL,
  COP_SIDE_LABEL,
  createApp6AcceptanceContext,
  customerOwnedDocument,
  shapeAt,
  type App6AcceptanceContext,
  type SeededCommission,
} from './app6-e01-context';
import {
  createJourneyDriver,
  dataOf,
  pricingAt,
  type AcceptedAgreement,
  type JourneyDriver,
} from './app6-e01-journey';

/** This case's own public source, so its calls share no limiter bucket. */
const SOURCE = '203.0.113.22';

/** The agreed embroidery envelope on the customer's own jacket, in millimetres. */
const ENVELOPE_WIDTH_MM = 120;
const ENVELOPE_HEIGHT_MM = 80;

interface RunState {
  commission?: SeededCommission;
  quotationId?: string;
  quotationVersionId?: string;
  designVersionId?: string;
  documentHash?: string;
  agreements?: AcceptedAgreement[];
  approvalSnapshotId?: string;
}

describe('APP6-E01-02 — customer-owned-product happy path', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  const run: RunState = {};

  beforeAll(async () => {
    context = await createApp6AcceptanceContext('app6-e01-02-cop');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      SOURCE,
    );
    await context.reset();
    await context.publishDeliveredPolicies();
    run.commission = await context.seedCommission({ customerOwned: true });
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

  it('starts from a COP request with no Catalog subject at all', async () => {
    expect(await requestStatus()).toBe('UNDER_REVIEW');
    const [request] = await context.rows<{
      readonly product_id: string | null;
      readonly product_variant_id: string | null;
      readonly submitted_session_id: string | null;
    }>(sql`
      select product_id, product_variant_id, submitted_session_id
        from custom_requests where id = ${commission().requestId}
    `);
    expect(request?.product_id).toBeNull();
    expect(request?.product_variant_id).toBeNull();
    expect(request?.submitted_session_id).toBeNull();

    // Nothing Catalog-shaped exists in this database to be substituted in.
    expect(await context.count(sql`select count(*)::text as count from products`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from product_variants`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from product_sides`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from embroidery_areas`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from design_sessions`)).toBe(0);
  });

  it('B01/B03 — the same commercial slice quotes a COP request and projects QUOTED', async () => {
    const drafted = await journey
      .createQuotation(commission().requestId, pricingAt(210_000))
      .expect(201);
    const draft = dataOf<{
      readonly quotationId: string;
      readonly versionId: string;
      readonly totalAmount: string;
      readonly depositAmount: string;
      readonly remainingAmount: string;
    }>(drafted);
    run.quotationId = draft.quotationId;
    run.quotationVersionId = draft.versionId;

    // 24 × 210 000 = 5 040 000, + 50 000 = 5 090 000; 40 % = 2 036 000.
    expect(draft.totalAmount).toBe('5090000.00');
    expect(draft.depositAmount).toBe('2036000.00');
    expect(draft.remainingAmount).toBe('3054000.00');

    const sent = await journey.sendQuotation(run.quotationId, run.quotationVersionId).expect(200);
    expect(dataOf<{ readonly requestStatus: string }>(sent).requestStatus).toBe('QUOTED');
    expect(await requestStatus()).toBe('QUOTED');
  });

  it('B04/B05 — the customer reads and accepts the exact version under STEP_UP', async () => {
    const read = await journey.readQuotation(commission().token, SOURCE).expect(200);
    expect(dataOf<{ readonly versionId: string }>(read).versionId).toBe(run.quotationVersionId);

    await context.addStepUp(commission());
    const accepted = await journey
      .acceptQuotation(commission().token, run.quotationVersionId!, SOURCE)
      .expect(200);
    expect(dataOf<{ readonly requestStatus: string }>(accepted).requestStatus).toBe(
      'QUOTE_ACCEPTED',
    );
    expect(await requestStatus()).toBe('QUOTE_ACCEPTED');
  });

  it('B06/B07 — digitizing starts, and the absent session renders as empty, not as an error', async () => {
    await journey.startDigitizing(commission().requestId).expect(200);
    expect(await requestStatus()).toBe('DIGITIZING');

    const response = await journey.submittedDesign(commission().requestId).expect(200);
    // A COP request has no Design Session. The read says so rather than failing,
    // and nothing invents one to fill the gap.
    expect(dataOf<{ readonly submittedDesign: unknown }>(response).submittedDesign).toBeNull();
    expect(await context.count(sql`select count(*)::text as count from design_sessions`)).toBe(0);
  });

  it('B08 — the formal version is honest schema-v2 with frozen labels and a positive envelope', async () => {
    const response = await journey
      .authorDesignVersion(commission().requestId, {
        document: customerOwnedDocument(ENVELOPE_WIDTH_MM, ENVELOPE_HEIGHT_MM, [
          shapeAt('cop-elm-1', 10, 10, 60, 40),
        ]),
        placementSideLabel: COP_SIDE_LABEL,
        placementAreaLabel: COP_AREA_LABEL,
        physicalWidthMm: ENVELOPE_WIDTH_MM,
        physicalHeightMm: ENVELOPE_HEIGHT_MM,
      })
      .expect(201);
    const version = dataOf<{
      readonly version: {
        readonly versionId: string;
        readonly version: number;
        readonly branch: string;
        readonly documentSchemaVersion: number;
        readonly productId: string | null;
        readonly productVariantId: string | null;
        readonly productSideId: string | null;
        readonly embroideryAreaId: string | null;
        readonly placementSideLabel: string | null;
        readonly placementAreaLabel: string | null;
        readonly physicalWidthMm: string;
        readonly physicalHeightMm: string;
      };
    }>(response).version;
    run.designVersionId = version.versionId;

    expect(version.branch).toBe('CUSTOMER_OWNED');
    expect(version.documentSchemaVersion).toBe(2);
    // The Catalog quartet is NULL — all four of it, with nothing standing in.
    expect(version.productId).toBeNull();
    expect(version.productVariantId).toBeNull();
    expect(version.productSideId).toBeNull();
    expect(version.embroideryAreaId).toBeNull();
    // What replaces it is the agreed text and a positive envelope.
    expect(version.placementSideLabel).toBe(COP_SIDE_LABEL);
    expect(version.placementAreaLabel).toBe(COP_AREA_LABEL);
    expect(Number(version.physicalWidthMm)).toBe(ENVELOPE_WIDTH_MM);
    expect(Number(version.physicalHeightMm)).toBe(ENVELOPE_HEIGHT_MM);

    const [row] = await context.rows<{ readonly customer_owned_product_id: string | null }>(
      sql`select customer_owned_product_id from design_versions where id = ${version.versionId}`,
    );
    expect(row?.customer_owned_product_id).toBe(commission().customerOwnedProductId);
  });

  it('B09/B10 — send and secure review work with no Catalog identity present', async () => {
    const sent = await journey
      .sendDesignVersion(commission().requestId, run.designVersionId!)
      .expect(200);
    const sentView = dataOf<{
      readonly sent: {
        readonly branch: string;
        readonly requestStatus: string;
        readonly documentHash: string;
      };
    }>(sent).sent;
    expect(sentView.branch).toBe('CUSTOMER_OWNED');
    expect(sentView.requestStatus).toBe('DESIGN_REVIEW');
    expect(await requestStatus()).toBe('DESIGN_REVIEW');

    const review = await journey.readReview(commission().token, SOURCE).expect(200);
    const view = dataOf<{
      readonly designVersionId: string;
      readonly documentSchemaVersion: number;
      readonly documentHash: string;
      readonly agreements: readonly {
        readonly agreementVersionId: string;
        readonly agreementType: string;
        readonly contentHash: string;
      }[];
    }>(review);

    run.documentHash = view.documentHash;
    run.agreements = view.agreements.map((agreement) => ({
      agreementVersionId: agreement.agreementVersionId,
      contentHash: agreement.contentHash,
    }));

    expect(view.designVersionId).toBe(run.designVersionId);
    expect(view.documentSchemaVersion).toBe(2);
    expect(view.documentHash).toBe(sentView.documentHash);
    expect([...view.agreements].map((entry) => entry.agreementType).sort()).toEqual([
      'PAYMENT_POLICY',
      'RETURN_POLICY',
    ]);
  });

  it('B11 — approval projects APPROVED and freezes truthful COP identity', async () => {
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
      readonly approvalSnapshotId: string;
      readonly requestStatus: string;
      readonly documentHash: string;
    }>(response);
    run.approvalSnapshotId = approved.approvalSnapshotId;

    expect(approved.requestStatus).toBe('APPROVED');
    expect(approved.documentHash).toBe(run.documentHash);
    expect(await requestStatus()).toBe('APPROVED');

    const [snapshot] = await context.rows<{
      readonly product_id: string | null;
      readonly product_variant_id: string | null;
      readonly product_side_id: string | null;
      readonly embroidery_area_id: string | null;
      readonly customer_owned_product_id: string | null;
      readonly product_name: string;
      readonly variant_label: string | null;
      readonly side_name: string;
      readonly area_name: string;
      readonly physical_width_mm: string;
      readonly physical_height_mm: string;
      readonly quantity_total: number;
    }>(sql`
      select product_id, product_variant_id, product_side_id, embroidery_area_id,
             customer_owned_product_id, product_name, variant_label, side_name, area_name,
             physical_width_mm, physical_height_mm, quantity_total
        from approval_snapshots where id = ${approved.approvalSnapshotId}
    `);

    // The branch column APP7 will read to tell the two apart, without inventing.
    expect(snapshot?.customer_owned_product_id).toBe(commission().customerOwnedProductId);
    expect(snapshot?.product_id).toBeNull();
    expect(snapshot?.product_variant_id).toBeNull();
    expect(snapshot?.product_side_id).toBeNull();
    expect(snapshot?.embroidery_area_id).toBeNull();
    // The human-readable evidence is truthful: the customer's own item, the
    // agreed labels, and no invented variant.
    expect(snapshot?.product_name).toBe(commission().customerOwnedProductName);
    expect(snapshot?.variant_label).toBeNull();
    expect(snapshot?.side_name).toBe(COP_SIDE_LABEL);
    expect(snapshot?.area_name).toBe(COP_AREA_LABEL);
    expect(Number(snapshot?.physical_width_mm)).toBe(ENVELOPE_WIDTH_MM);
    expect(Number(snapshot?.physical_height_mm)).toBe(ENVELOPE_HEIGHT_MM);
    expect(Number(snapshot?.quantity_total)).toBe(commission().quantityTotal);

    const acceptances = await context.rows<{ readonly agreement_version_id: string }>(sql`
      select agreement_version_id from approval_snapshot_agreement_acceptances
       where approval_snapshot_id = ${approved.approvalSnapshotId}
    `);
    expect(acceptances.map((row) => row.agreement_version_id).sort()).toEqual(
      run.agreements!.map((entry) => entry.agreementVersionId).sort(),
    );
  });

  it('creates no Catalog row, and no order, payment, reservation or production work', async () => {
    // Still nothing Catalog-shaped anywhere, after a complete journey.
    expect(await context.count(sql`select count(*)::text as count from products`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from product_variants`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from product_sides`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from embroidery_areas`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from design_sessions`)).toBe(0);

    expect(await context.count(sql`select count(*)::text as count from orders`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from payment_attempts`)).toBe(0);
    expect(await context.count(sql`select count(*)::text as count from payment_obligations`)).toBe(
      0,
    );
    expect(await context.count(sql`select count(*)::text as count from production_jobs`)).toBe(0);
    expect(
      await context.count(sql`select count(*)::text as count from production_specifications`),
    ).toBe(0);
    expect(
      await context.count(sql`select count(*)::text as count from inventory_reservations`),
    ).toBe(0);
  });

  it('records the same lifecycle ledger, with DIGITIZING the only commanded move', async () => {
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
    expect(transitions.filter((row) => row.actor_kind === 'ADMIN')).toHaveLength(1);
    expect(transitions.filter((row) => row.actor_kind === 'SYSTEM')).toHaveLength(4);
  });
});
