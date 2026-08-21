/**
 * `APP6-B08` — formal Design Version authoring and history, end to end.
 *
 * Every assertion below is against a real HTTP application, real guards and a
 * real database. The claims worth reading twice are the two the roadmap names as
 * this checkpoint's acceptance criteria: a customer-owned version carries no
 * Catalog row, and a Catalog version fails **loudly** rather than substituting a
 * missing variant.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  codeOf,
  createDesignVersionContext,
  customerOwnedDocument,
  dataOf,
  ROUTE,
  shapeAt,
  SIDE_GEOMETRY,
  type DesignVersionTestContext,
  type SeededPlacement,
} from './design-version-context';

interface VersionResponse {
  readonly versionId: string;
  readonly version: number;
  readonly status: string;
  readonly parentVersionId: string | null;
  readonly documentSchemaVersion: number;
  readonly branch: string;
  readonly productId: string | null;
  readonly productVariantId: string | null;
  readonly productSideId: string | null;
  readonly embroideryAreaId: string | null;
  readonly placementSideLabel: string | null;
  readonly placementAreaLabel: string | null;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly current: boolean;
  readonly reviews: readonly { readonly outcome: string; readonly decidedAt: string }[];
}

interface VersionRow {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly parent_version_id: string | null;
  readonly document_schema_version: number;
  readonly product_id: string | null;
  readonly product_variant_id: string | null;
  readonly product_side_id: string | null;
  readonly embroidery_area_id: string | null;
  readonly customer_owned_product_id: string | null;
  readonly placement_side_label: string | null;
  readonly placement_area_label: string | null;
  readonly physical_width_mm: string;
  readonly physical_height_mm: string;
  readonly document_hash: string | null;
  readonly sent_at: Date | null;
}

/** An element comfortably inside the seeded Embroidery Area rectangle. */
const INSIDE_AREA = shapeAt(
  'shape-1',
  SIDE_GEOMETRY.areaXPx + 10,
  SIDE_GEOMETRY.areaYPx + 10,
  50,
  40,
);

describe('APP6-B08 design version authoring', () => {
  let context: DesignVersionTestContext;
  let placement: SeededPlacement;
  let customerId: string;

  beforeAll(async () => {
    context = await createDesignVersionContext('app6-b08-design-versions');
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
    customerId = await context.seedCustomer();
    placement = await context.seedPlacement();
  });

  /** A DIGITIZING catalog request with a submitted session pointing back at it. */
  async function seedCatalogRequest(status = 'DIGITIZING'): Promise<{
    requestId: string;
    designCaseId: string;
  }> {
    const seeded = await context.seedRequest({ customerId, status, placement });
    const sessionId = await context.seedSession({
      placement,
      submittedRequestId: seeded.requestId,
    });
    await context.rows(
      sql`update custom_requests set submitted_session_id = ${sessionId} where id = ${seeded.requestId}`,
    );
    return { requestId: seeded.requestId, designCaseId: seeded.designCaseId as string };
  }

  const post = (requestId: string, body: unknown) =>
    request(context.server())
      .post(ROUTE.designVersions(requestId))
      .set('Cookie', context.adminCookie())
      .send(body as object);

  const get = (requestId: string) =>
    request(context.server())
      .get(ROUTE.designVersions(requestId))
      .set('Cookie', context.adminCookie());

  const versionRows = (caseId: string): Promise<VersionRow[]> =>
    context.rows<VersionRow>(
      sql`select * from design_versions where design_case_id = ${caseId} order by version asc`,
    );

  describe('authorization', () => {
    it('refuses an unauthenticated caller on both operations', async () => {
      const { requestId } = await seedCatalogRequest();

      await request(context.server())
        .post(ROUTE.designVersions(requestId))
        .send({ document: catalogDocument(placement) })
        .expect(401);
      await request(context.server()).get(ROUTE.designVersions(requestId)).expect(401);
    });

    it('answers 404 for a request that does not exist', async () => {
      const absent = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099';
      await post(absent, { document: catalogDocument(placement) }).expect(404);
      await get(absent).expect(404);
    });
  });

  describe('TR-LC08-01 eligibility', () => {
    it('creates a draft while the request is DIGITIZING', async () => {
      const { requestId } = await seedCatalogRequest('DIGITIZING');
      const response = await post(requestId, { document: catalogDocument(placement) }).expect(201);

      expect(dataOf<{ version: VersionResponse }>(response).version.status).toBe('DRAFT');
    });

    it('creates a revision while the request is DESIGN_REVIEW', async () => {
      const { requestId } = await seedCatalogRequest('DESIGN_REVIEW');
      await post(requestId, { document: catalogDocument(placement) }).expect(201);
    });

    it('refuses every other request state, with no override', async () => {
      for (const status of [
        'NEW',
        'UNDER_REVIEW',
        'NEEDS_CLARIFICATION',
        'QUOTED',
        'QUOTE_ACCEPTED',
        'APPROVED',
        'REJECTED',
        'CANCELLED',
      ]) {
        const { requestId, designCaseId } = await seedCatalogRequest(status);
        const response = await post(requestId, { document: catalogDocument(placement) });

        expect([status, response.status]).toEqual([status, 409]);
        expect(codeOf(response)).toBe('REQUEST_NOT_DIGITIZING');
        // The refusal wrote nothing: no partial version survives a failed guard.
        await expect(versionRows(designCaseId)).resolves.toEqual([]);
      }
    });

    it('does not move the request it authors against', async () => {
      const { requestId } = await seedCatalogRequest('DIGITIZING');
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const [row] = await context.rows<{ status: string }>(
        sql`select status from custom_requests where id = ${requestId}`,
      );
      // TR-LC11-08 belongs to APP6-B09. Nothing in this module can project it —
      // the injector holds no write contract for a request at all.
      expect(row?.status).toBe('DIGITIZING');
    });
  });

  describe('catalog branch', () => {
    it('freezes the complete catalog quartet and no customer-owned row', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement, [INSIDE_AREA]) }).expect(201);

      const [row] = await versionRows(designCaseId);
      expect(row).toMatchObject({
        version: 1,
        status: 'DRAFT',
        document_schema_version: 1,
        product_id: placement.productId,
        product_variant_id: placement.productVariantId,
        product_side_id: placement.productSideId,
        embroidery_area_id: placement.embroideryAreaId,
        customer_owned_product_id: null,
        placement_side_label: null,
        placement_area_label: null,
      });
      // The dimensions are the Product Side's, not anything the caller sent.
      expect(Number(row?.physical_width_mm)).toBe(SIDE_GEOMETRY.physicalWidthMm);
      expect(Number(row?.physical_height_mm)).toBe(SIDE_GEOMETRY.physicalHeightMm);
      // A DRAFT is not a review artifact: no hash, not sent. CST-074 requires
      // one only once the row leaves DRAFT, which is B09's transition.
      expect(row?.document_hash).toBeNull();
      expect(row?.sent_at).toBeNull();
    });

    it('fails loudly when the request has no variant, substituting nothing', async () => {
      const seeded = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        placement,
        omitVariant: true,
      });
      const sessionId = await context.seedSession({
        placement,
        submittedRequestId: seeded.requestId,
      });
      await context.rows(
        sql`update custom_requests set submitted_session_id = ${sessionId} where id = ${seeded.requestId}`,
      );

      const response = await post(seeded.requestId, { document: catalogDocument(placement) });

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('CATALOG_PLACEMENT_UNRESOLVED');
      // The acceptance criterion: nothing was written, and in particular no
      // other active variant of the same product was borrowed to make it write.
      await expect(versionRows(seeded.designCaseId as string)).resolves.toEqual([]);
      await expect(
        context.count(sql`select count(*)::text as count from design_versions`),
      ).resolves.toBe(0);
    });

    it('fails loudly when the submitted session is gone', async () => {
      const seeded = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
      // A request with a catalog subject but no submitted session: the side and
      // area have no authoritative source, so there is nothing to freeze.
      const response = await post(seeded.requestId, { document: catalogDocument(placement) });

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('CATALOG_PLACEMENT_UNRESOLVED');
    });

    it('fails loudly when the pointed session belongs to another request', async () => {
      const seeded = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
      const other = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
      // The session points back at `other`, so the correlated lookup finds
      // nothing for `seeded` — a foreign session is unreachable, not merely
      // refused.
      const foreign = await context.seedSession({
        placement,
        submittedRequestId: other.requestId,
      });
      await context.rows(
        sql`update custom_requests set submitted_session_id = ${foreign} where id = ${seeded.requestId}`,
      );

      const response = await post(seeded.requestId, { document: catalogDocument(placement) });
      expect(codeOf(response)).toBe('CATALOG_PLACEMENT_UNRESOLVED');
    });

    it('rejects a document whose placement disagrees with catalog authority', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const wrong = catalogDocument(placement) as { placement: Record<string, unknown> };
      wrong.placement['physicalWidthMm'] = SIDE_GEOMETRY.physicalWidthMm + 5;

      const response = await post(requestId, { document: wrong });

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('DOCUMENT_REJECTED');
      await expect(versionRows(designCaseId)).resolves.toEqual([]);
    });

    it('rejects an element outside the embroidery area', async () => {
      const { requestId } = await seedCatalogRequest();
      const outside = shapeAt('shape-out', 0, 0, 50, 40);

      const response = await post(requestId, {
        document: catalogDocument(placement, [outside]),
      });
      expect(response.status).toBe(422);
    });

    it('rejects a v2 branch-capable document on the catalog branch', async () => {
      const { requestId } = await seedCatalogRequest();
      // A catalog version whose document declares null placement ids would be
      // the row CST-129 exists to reject, arriving from the other direction.
      const response = await post(requestId, { document: customerOwnedDocument(100, 80) });

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('DOCUMENT_REJECTED');
    });

    it('refuses customer-owned placement fields on a catalog request', async () => {
      const { requestId } = await seedCatalogRequest();
      const response = await post(requestId, {
        document: catalogDocument(placement),
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu',
        physicalWidthMm: 100,
        physicalHeightMm: 80,
      });

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('PLACEMENT_INPUT_INVALID');
    });
  });

  describe('customer-owned branch', () => {
    async function seedCopRequest(): Promise<{
      requestId: string;
      designCaseId: string;
      customerOwnedProductId: string;
    }> {
      const seeded = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        customerOwnedProductName: 'Áo khoác của khách',
        // The item's own dimensions: deliberately different from the envelope a
        // version will freeze, so a test can prove they were not adopted.
        customerOwnedItemWidthMm: '600.00',
        customerOwnedItemHeightMm: '900.00',
      });
      return {
        requestId: seeded.requestId,
        designCaseId: seeded.designCaseId as string,
        customerOwnedProductId: seeded.customerOwnedProductId as string,
      };
    }

    it('persists the customer-owned id, a null catalog quartet and both labels', async () => {
      const seeded = await seedCopRequest();

      const response = await post(seeded.requestId, {
        document: customerOwnedDocument(120, 90, [shapeAt('shape-1', 10, 10, 50, 40)]),
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu ngực',
        physicalWidthMm: 120,
        physicalHeightMm: 90,
      }).expect(201);

      const [row] = await versionRows(seeded.designCaseId);
      expect(row).toMatchObject({
        customer_owned_product_id: seeded.customerOwnedProductId,
        product_id: null,
        product_variant_id: null,
        product_side_id: null,
        embroidery_area_id: null,
        placement_side_label: 'Ngực trái',
        placement_area_label: 'Vùng thêu ngực',
        document_schema_version: 2,
      });

      // ADR-APP6-001 §3.3: the envelope is this version's own, never the
      // customer item's 600×900. Adopting those would claim the whole jacket.
      expect(Number(row?.physical_width_mm)).toBe(120);
      expect(Number(row?.physical_height_mm)).toBe(90);

      const view = dataOf<{ version: VersionResponse }>(response).version;
      expect(view.branch).toBe('CUSTOMER_OWNED');
      expect(view.productId).toBeNull();
      expect(view.productVariantId).toBeNull();
      expect(view.productSideId).toBeNull();
      expect(view.embroideryAreaId).toBeNull();
    });

    it('requires both labels and a positive envelope', async () => {
      const seeded = await seedCopRequest();

      for (const body of [
        { placementAreaLabel: 'Vùng thêu', physicalWidthMm: 120, physicalHeightMm: 90 },
        { placementSideLabel: 'Ngực trái', physicalWidthMm: 120, physicalHeightMm: 90 },
        { placementSideLabel: 'Ngực trái', placementAreaLabel: 'Vùng thêu', physicalHeightMm: 90 },
      ]) {
        const response = await post(seeded.requestId, {
          document: customerOwnedDocument(120, 90),
          ...body,
        });
        expect(codeOf(response)).toBe('PLACEMENT_INPUT_INVALID');
      }
    });

    it('rejects a blank label rather than letting the database refuse it', async () => {
      const seeded = await seedCopRequest();
      const response = await post(seeded.requestId, {
        document: customerOwnedDocument(120, 90),
        // Whitespace only. CST-130's `btrim` would reject this as an opaque 500;
        // the schema trims first so the operator gets a 400 that says which field.
        placementSideLabel: '   ',
        placementAreaLabel: 'Vùng thêu',
        physicalWidthMm: 120,
        physicalHeightMm: 90,
      });
      expect(response.status).toBe(400);
    });

    it('rejects a document whose dimensions disagree with the frozen envelope', async () => {
      const seeded = await seedCopRequest();
      const response = await post(seeded.requestId, {
        document: customerOwnedDocument(200, 90),
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu',
        physicalWidthMm: 120,
        physicalHeightMm: 90,
      });

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('DOCUMENT_REJECTED');
    });

    it('rejects an element outside the envelope', async () => {
      const seeded = await seedCopRequest();
      const response = await post(seeded.requestId, {
        document: customerOwnedDocument(120, 90, [shapeAt('shape-1', 100, 80, 50, 40)]),
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu',
        physicalWidthMm: 120,
        physicalHeightMm: 90,
      });
      expect(response.status).toBe(422);
    });

    it('rejects a v1 document, which cannot express placement absence', async () => {
      const seeded = await seedCopRequest();
      const response = await post(seeded.requestId, {
        document: catalogDocument(placement),
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu',
        physicalWidthMm: 120,
        physicalHeightMm: 90,
      });
      expect(codeOf(response)).toBe('DOCUMENT_REJECTED');
    });
  });

  describe('design case containment', () => {
    it('refuses a request whose design case pointer is absent', async () => {
      const seeded = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        placement,
        withDesignCase: false,
      });
      const response = await post(seeded.requestId, { document: catalogDocument(placement) });

      expect(response.status).toBe(409);
      expect(codeOf(response)).toBe('DESIGN_CASE_UNRESOLVED');
      // Reported, never repaired: no second case is created to make it work.
      await expect(
        context.count(sql`select count(*)::text as count from design_cases`),
      ).resolves.toBe(0);
    });

    it('refuses a pointer naming another request’s case, and rebinds nothing', async () => {
      const mine = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
      const theirs = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
      await context.rows(
        sql`update custom_requests set current_design_case_id = ${theirs.designCaseId as string}
            where id = ${mine.requestId}`,
      );

      const response = await post(mine.requestId, { document: catalogDocument(placement) });

      expect(codeOf(response)).toBe('DESIGN_CASE_UNRESOLVED');
      const [row] = await context.rows<{ custom_request_id: string }>(
        sql`select custom_request_id from design_cases where id = ${theirs.designCaseId as string}`,
      );
      expect(row?.custom_request_id).toBe(theirs.requestId);
    });
  });

  describe('append-only history', () => {
    it('numbers versions monotonically and never mutates an earlier one', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();

      const first = dataOf<{ version: VersionResponse }>(
        await post(requestId, { document: catalogDocument(placement) }).expect(201),
      ).version;
      const before = await versionRows(designCaseId);

      const second = dataOf<{ version: VersionResponse }>(
        await post(requestId, { document: catalogDocument(placement, [INSIDE_AREA]) }).expect(201),
      ).version;

      expect([first.version, second.version]).toEqual([1, 2]);
      expect(second.parentVersionId).toBe(first.versionId);

      const after = await versionRows(designCaseId);
      expect(after).toHaveLength(2);
      // v1's row is byte-for-byte what it was: creating v2 edited nothing.
      expect(after[0]).toEqual(before[0]);
    });

    it('advances the design case’s current-version pointer to the new draft', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);
      const second = dataOf<{ version: VersionResponse }>(
        await post(requestId, { document: catalogDocument(placement) }).expect(201),
      ).version;

      const [row] = await context.rows<{ current_version_id: string }>(
        sql`select current_version_id from design_cases where id = ${designCaseId}`,
      );
      // G-DB7-02 names the version-create transaction as a site for this write,
      // and REL-044 is TX-consistent.
      expect(row?.current_version_id).toBe(second.versionId);
    });

    it('records an audit row per version and emits no outbox event', async () => {
      const { requestId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const audits = await context.rows<{ action: string; target_kind: string }>(
        sql`select action, target_kind from audit_events`,
      );
      expect(audits).toEqual([{ action: 'design_version.created', target_kind: 'DESIGN_VERSION' }]);
      // `design.review-ready` is APP6-B09's event, and `notification_intents` is
      // this repository's outbox. Authoring a draft notifies nobody, and this
      // module holds no intake port to change that.
      await expect(
        context.count(sql`select count(*)::text as count from notification_intents`),
      ).resolves.toBe(0);
    });

    it('never writes a document hash, a preview or an approval snapshot', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const [row] = await versionRows(designCaseId);
      expect(row?.document_hash).toBeNull();
      await expect(
        context.count(
          sql`select count(*)::text as count from design_versions where preview_derivative_id is not null`,
        ),
      ).resolves.toBe(0);
      await expect(
        context.count(sql`select count(*)::text as count from approval_snapshots`),
      ).resolves.toBe(0);
    });
  });

  describe('version list', () => {
    it('returns every version oldest first, with a truthful current marker', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const body = dataOf<{ designCaseId: string; versions: VersionResponse[] }>(
        await get(requestId).expect(200),
      );

      expect(body.designCaseId).toBe(designCaseId);
      expect(body.versions.map((entry) => entry.version)).toEqual([1, 2]);
      expect(body.versions.map((entry) => entry.current)).toEqual([false, true]);
      expect(body.versions[0]?.branch).toBe('CATALOG');
    });

    it('reports no review outcome for a draft, and never infers one', async () => {
      const { requestId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const body = dataOf<{ versions: VersionResponse[] }>(await get(requestId).expect(200));
      expect(body.versions[0]?.reviews).toEqual([]);
    });

    it('returns recorded review outcomes in chronological order', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);
      const [version] = await versionRows(designCaseId);

      // Seeded directly: recording a decision is APP6-B11's transition, and this
      // suite must not depend on a checkpoint that does not exist yet. What B08
      // owns is reading these rows truthfully.
      const grantId = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
      await context.rows(sql`
        insert into secure_access_grants (id, customer_id, custom_request_id, scope_kind,
                                          token_hash, status, expires_at)
        values (${grantId}, ${customerId}, ${requestId}, 'REQUEST_ACCESS',
                ${'hash-b08-grant'}, 'ACTIVE', now() + interval '7 days')
      `);
      for (const [outcome, at] of [
        ['REQUEST_REVISION', '2026-08-15T10:00:00.000Z'],
        ['APPROVE', '2026-08-16T10:00:00.000Z'],
      ] as const) {
        // `id` is omitted: `design_reviews.id` is GENERATED ALWAYS, so supplying
        // one is an error rather than an override. That identity is also the
        // repository's tie-breaker, and it increments in insertion order — which
        // is what makes the expected order below deterministic even if the two
        // rows had shared an instant.
        await context.rows(sql`
          insert into design_reviews (design_version_id, outcome, customer_id, grant_id, decided_at)
          values (${version?.id as string}, ${outcome}, ${customerId}, ${grantId}, ${at})
        `);
      }

      const body = dataOf<{ versions: VersionResponse[] }>(await get(requestId).expect(200));
      expect(body.versions[0]?.reviews.map((entry) => entry.outcome)).toEqual([
        'REQUEST_REVISION',
        'APPROVE',
      ]);
    });

    it('lists a settled request’s history without re-applying the authoring guard', async () => {
      const { requestId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);
      await context.rows(
        sql`update custom_requests set status = 'APPROVED' where id = ${requestId}`,
      );

      // Reading history is not authoring it. A guard here would blank the
      // history of every settled request.
      const body = dataOf<{ versions: VersionResponse[] }>(await get(requestId).expect(200));
      expect(body.versions).toHaveLength(1);
    });

    it('does not return the design document', async () => {
      const { requestId } = await seedCatalogRequest();
      await post(requestId, { document: catalogDocument(placement) }).expect(201);

      const response = await get(requestId).expect(200);
      expect(JSON.stringify(response.body)).not.toContain('schemaVersion');
    });
  });
});
