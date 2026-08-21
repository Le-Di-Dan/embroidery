/**
 * `APP6-A02` §5–§8 — the exact-version Admin design detail read, end to end.
 *
 * Real HTTP, real guards, real `DesignVersionDetailReadModule`, one disposable
 * PostgreSQL. Nothing is stubbed and no guard is overridden: A02's claims are
 * about what the composed injector can and cannot do, and that is only
 * observable through the code path production uses.
 *
 * Only that one module is booted, which is what lets this suite say the read
 * cannot author, send, decide, transition or announce anything: no route exists
 * in this injector that could, so a test asserting nothing moved is testing the
 * boundary rather than its own restraint.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  codeOf,
  createDesignVersionContext,
  customerOwnedDocument,
  dataOf,
  shapeAt,
  SIDE_GEOMETRY,
  type DesignVersionTestContext,
  type SeededPlacement,
} from './design-version-context';
import {
  detailRoute,
  seedApproval,
  seedCustomerEvidence,
  seedReview,
  type SeededCustomerEvidence,
} from './design-version-detail-context';
import { DesignVersionDetailReadModule } from '../../design-version-detail-read.module';

const SENT_HASH = `sha256:${'b'.repeat(64)}`;

interface DetailPayload {
  readonly versionId: string;
  readonly designCaseId: string;
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
  readonly sentAt: string | null;
  readonly approvedAt: string | null;
  readonly documentHash: string | null;
  readonly document: Record<string, unknown>;
  readonly reviews: readonly {
    readonly outcome: string;
    readonly decidedAt: string;
    readonly feedback: string | null;
  }[];
  readonly approval: Record<string, unknown> | null;
}

describe('APP6-A02 — exact-version Admin design detail', () => {
  let context: DesignVersionTestContext;

  beforeAll(async () => {
    context = await createDesignVersionContext(
      'app6-a02-design-version-detail',
      DesignVersionDetailReadModule,
    );
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
  });

  /** A Catalog request with a design case, one DRAFT version, and an operator. */
  async function seedCatalogWorld(options: { readonly status?: string } = {}): Promise<{
    readonly requestId: string;
    readonly designCaseId: string;
    readonly versionId: string;
    readonly placement: SeededPlacement;
    readonly customerId: string;
    readonly document: unknown;
  }> {
    await context.seedAdminSession();
    const customerId = await context.seedCustomer();
    const placement = await context.seedPlacement();
    const sessionId = await context.seedSession({ placement });
    const seeded = await context.seedRequest({
      customerId,
      placement,
      submittedSessionId: sessionId,
      status: options.status ?? 'DIGITIZING',
    });
    const document = catalogDocument(placement, [shapeAt('element-1', 120, 170, 100, 60)]);
    const versionId = await context.seedVersion({
      designCaseId: seeded.designCaseId as string,
      version: 1,
      document,
      documentSchemaVersion: 1,
      placement,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
    });
    return {
      requestId: seeded.requestId,
      designCaseId: seeded.designCaseId as string,
      versionId,
      placement,
      customerId,
      document,
    };
  }

  function get(requestId: string, versionId: string) {
    return request(context.server())
      .get(detailRoute(requestId, versionId))
      .set('Cookie', context.adminCookie());
  }

  describe('authorization and addressing', () => {
    it('refuses an unauthenticated caller', async () => {
      const world = await seedCatalogWorld();
      const response = await request(context.server()).get(
        detailRoute(world.requestId, world.versionId),
      );
      expect(response.status).toBe(401);
    });

    it('returns the version to an authenticated Admin, uncacheable', async () => {
      const world = await seedCatalogWorld();
      const response = await get(world.requestId, world.versionId).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(dataOf<DetailPayload>(response).versionId).toBe(world.versionId);
    });

    it('puts the version’s fields directly on `data`, exactly as the contract publishes them', async () => {
      // The regression this pins. The controller first returned
      // `data: { version: { … } }` while `envelopeSchemaOf` published `data` as
      // the version itself — a divergence every green suite missed, because the
      // integration assertions read `.version.*` and the contract spec only
      // inspects the document. It surfaced in the browser as a detail panel that
      // rendered nothing: the generated client read `data.documentHash` and
      // found `undefined`.
      //
      // Asserting the key set is what makes it catchable: a wrapper reintroduced
      // later fails here rather than at the next browser pass.
      const world = await seedCatalogWorld();
      const payload = dataOf<Record<string, unknown>>(
        await get(world.requestId, world.versionId).expect(200),
      );

      expect(payload['version']).toBe(1);
      expect(payload['versionId']).toBe(world.versionId);
      expect(Object.keys(payload).sort()).toEqual([
        'approval',
        'approvedAt',
        'branch',
        'current',
        'designCaseId',
        'document',
        'documentHash',
        'documentSchemaVersion',
        'embroideryAreaId',
        'parentVersionId',
        'physicalHeightMm',
        'physicalWidthMm',
        'placementAreaLabel',
        'placementSideLabel',
        'productId',
        'productSideId',
        'productVariantId',
        'reviews',
        'sentAt',
        'status',
        'version',
        'versionId',
      ]);
    });

    it('rejects a malformed version id before any repository call', async () => {
      const world = await seedCatalogWorld();
      const response = await get(world.requestId, 'not-a-uuid');
      expect(response.status).toBe(400);
    });

    it('answers an unknown version and a foreign version identically', async () => {
      const world = await seedCatalogWorld();

      // A second request, with its own customer, its own design case and its own
      // version. It reuses the same catalog placement deliberately: what makes
      // the version foreign is the design case it hangs off, not the product it
      // points at, and `seedPlacement` derives a category slug from a UUIDv7 —
      // two calls in the same millisecond collide on `uq_categories__slug`.
      const otherCustomer = await context.seedCustomer();
      const other = await context.seedRequest({
        customerId: otherCustomer,
        placement: world.placement,
        status: 'DIGITIZING',
      });
      const foreignVersionId = await context.seedVersion({
        designCaseId: other.designCaseId as string,
        version: 1,
        document: catalogDocument(world.placement),
        documentSchemaVersion: 1,
        placement: world.placement,
        physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
        physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
      });

      const unknown = await get(world.requestId, '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099');
      const foreign = await get(world.requestId, foreignVersionId);

      expect(unknown.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(codeOf(foreign)).toBe(codeOf(unknown));
      expect(codeOf(foreign)).toBe('DESIGN_VERSION_NOT_FOUND');
      // Nothing in the refusal names the other request, its case or its owner.
      const body = JSON.stringify(foreign.body);
      expect(body).not.toContain(other.requestId);
      expect(body).not.toContain(other.designCaseId as string);
      expect(body).not.toContain(foreignVersionId);
    });

    it('answers 404 for an unknown request, and 409 when the case pointer is unset', async () => {
      const world = await seedCatalogWorld();
      const unknownRequest = await get('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6098', world.versionId);
      expect(unknownRequest.status).toBe(404);

      await context.rows(sql`
        update custom_requests set current_design_case_id = null where id = ${world.requestId}
      `);
      const unresolved = await get(world.requestId, world.versionId);
      expect(unresolved.status).toBe(409);
      expect(codeOf(unresolved)).toBe('DESIGN_CASE_UNRESOLVED');
    });
  });

  describe('the document is returned exactly as persisted', () => {
    it('returns a Catalog v1 document byte-for-byte', async () => {
      const world = await seedCatalogWorld();
      const response = await get(world.requestId, world.versionId).expect(200);
      const payload = dataOf<DetailPayload>(response);

      expect(payload.document).toEqual(world.document);
      expect(payload.documentSchemaVersion).toBe(1);
      expect(payload.branch).toBe('CATALOG');
      expect(payload.productId).toBe(world.placement.productId);
      expect(payload.embroideryAreaId).toBe(world.placement.embroideryAreaId);
      // The other branch's fields are null, never a fabricated label.
      expect(payload.placementSideLabel).toBeNull();
      expect(payload.placementAreaLabel).toBeNull();
    });

    it('returns a customer-owned v2 document with labels and no fabricated Catalog ids', async () => {
      await context.seedAdminSession();
      const customerId = await context.seedCustomer();
      const seeded = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        customerOwnedProductName: 'Áo khoác của khách',
        // The item's own dimensions, which must never become the envelope.
        customerOwnedItemWidthMm: '900.00',
        customerOwnedItemHeightMm: '1200.00',
      });
      const document = customerOwnedDocument(120, 80, [shapeAt('element-1', 0, 0, 40, 30)]);
      const versionId = await context.seedVersion({
        designCaseId: seeded.designCaseId as string,
        version: 1,
        document,
        documentSchemaVersion: 2,
        customerOwnedProductId: seeded.customerOwnedProductId as string,
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu ngực',
        physicalWidthMm: 120,
        physicalHeightMm: 80,
      });

      const payload = dataOf<DetailPayload>(await get(seeded.requestId, versionId).expect(200));

      expect(payload.document).toEqual(document);
      expect(payload.documentSchemaVersion).toBe(2);
      expect(payload.branch).toBe('CUSTOMER_OWNED');
      expect(payload.placementSideLabel).toBe('Ngực trái');
      expect(payload.placementAreaLabel).toBe('Vùng thêu ngực');
      expect(payload.productId).toBeNull();
      expect(payload.productVariantId).toBeNull();
      expect(payload.productSideId).toBeNull();
      expect(payload.embroideryAreaId).toBeNull();
      // The version's own envelope, not the garment's 900 × 1200 — and returned
      // as the exact `numeric` text that was stored, never re-scaled or parsed
      // through a float on the way out.
      expect(payload.physicalWidthMm).toBe('120');
      expect(payload.physicalHeightMm).toBe('80');
      expect(JSON.stringify(payload.version)).not.toContain('900');
      expect(JSON.stringify(payload.version)).not.toContain('1200');
    });

    it('returns the stored hash when sent, and null on an unsent draft', async () => {
      const world = await seedCatalogWorld();
      const draft = dataOf<DetailPayload>(await get(world.requestId, world.versionId).expect(200));
      expect(draft.status).toBe('DRAFT');
      expect(draft.documentHash).toBeNull();
      expect(draft.sentAt).toBeNull();

      const sentId = await context.seedVersion({
        designCaseId: world.designCaseId,
        version: 2,
        document: catalogDocument(world.placement),
        documentSchemaVersion: 1,
        placement: world.placement,
        physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
        physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
        status: 'SENT_FOR_REVIEW',
        documentHash: SENT_HASH,
      });

      const sent = dataOf<DetailPayload>(await get(world.requestId, sentId).expect(200));
      // The stored value, verbatim. Nothing recomputes a digest for a response.
      expect(sent.documentHash).toBe(SENT_HASH);
      expect(sent.sentAt).not.toBeNull();
    });

    it('reports `current` from the case pointer, not from the highest version number', async () => {
      const world = await seedCatalogWorld();
      // A newer version that is deliberately NOT made current.
      const newer = await context.seedVersion({
        designCaseId: world.designCaseId,
        version: 2,
        document: catalogDocument(world.placement),
        documentSchemaVersion: 1,
        placement: world.placement,
        physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
        physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
        makeCurrent: false,
      });

      const first = dataOf<DetailPayload>(await get(world.requestId, world.versionId).expect(200));
      const second = dataOf<DetailPayload>(await get(world.requestId, newer).expect(200));
      expect(first.current).toBe(true);
      expect(second.current).toBe(false);
    });
  });

  describe('review feedback comes from the decision record', () => {
    async function seedEvidence(
      customerId: string,
      requestId: string,
    ): Promise<SeededCustomerEvidence> {
      return seedCustomerEvidence(context, customerId, requestId);
    }

    it('returns the customer’s exact persisted words for a revision request', async () => {
      const world = await seedCatalogWorld({ status: 'DESIGN_REVIEW' });
      const evidence = await seedEvidence(world.customerId, world.requestId);
      const feedback = 'Chữ hơi nhỏ, nhờ anh chị phóng to giúp em. <b>Cảm ơn</b>';

      await context.rows(sql`
        update design_versions set status = 'REVISION_REQUESTED', document_hash = ${SENT_HASH},
               sent_at = now() where id = ${world.versionId}
      `);
      await seedReview(context, {
        versionId: world.versionId,
        outcome: 'REQUEST_REVISION',
        feedback,
        decidedAt: new Date('2026-08-19T04:00:00.000Z'),
        evidence,
      });

      const payload = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      );
      expect(payload.reviews).toHaveLength(1);
      // Verbatim, including the markup-looking characters: the transport does
      // not sanitise a customer's words into something that means less.
      expect(payload.reviews[0]?.feedback).toBe(feedback);
      expect(payload.reviews[0]?.outcome).toBe('REQUEST_REVISION');
    });

    it('returns null feedback for an approval, and never infers a decision from status', async () => {
      const world = await seedCatalogWorld({ status: 'DESIGN_REVIEW' });
      const evidence = await seedEvidence(world.customerId, world.requestId);

      // An APPROVED version with **no** review row. The status says approved;
      // the decision record says nobody decided. The response must report the
      // record, because manufacturing a decision from a status would put an
      // approval in the history that no customer made.
      const orphan = await context.seedVersion({
        designCaseId: world.designCaseId,
        version: 2,
        document: catalogDocument(world.placement),
        documentSchemaVersion: 1,
        placement: world.placement,
        physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
        physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
        status: 'APPROVED',
        documentHash: SENT_HASH,
      });
      const orphanPayload = dataOf<DetailPayload>(await get(world.requestId, orphan).expect(200));
      expect(orphanPayload.status).toBe('APPROVED');
      expect(orphanPayload.reviews).toEqual([]);
      expect(orphanPayload.approval).toBeNull();

      await seedReview(context, {
        versionId: orphan,
        outcome: 'APPROVE',
        decidedAt: new Date('2026-08-19T05:00:00.000Z'),
        evidence,
      });
      const decided = dataOf<DetailPayload>(await get(world.requestId, orphan).expect(200));
      expect(decided.reviews[0]?.outcome).toBe('APPROVE');
      expect(decided.reviews[0]?.feedback).toBeNull();
    });

    it('returns an empty history before any decision, and never another version’s', async () => {
      const world = await seedCatalogWorld({ status: 'DESIGN_REVIEW' });
      const evidence = await seedEvidence(world.customerId, world.requestId);
      const other = await context.seedVersion({
        designCaseId: world.designCaseId,
        version: 2,
        document: catalogDocument(world.placement),
        documentSchemaVersion: 1,
        placement: world.placement,
        physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
        physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
        status: 'REVISION_REQUESTED',
        documentHash: SENT_HASH,
      });
      await seedReview(context, {
        versionId: other,
        outcome: 'REQUEST_REVISION',
        feedback: 'Đổi màu chỉ giúp em.',
        decidedAt: new Date('2026-08-19T06:00:00.000Z'),
        evidence,
      });

      const untouched = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      );
      expect(untouched.reviews).toEqual([]);
    });

    it('publishes no credential reference on a decision entry', async () => {
      const world = await seedCatalogWorld({ status: 'DESIGN_REVIEW' });
      const evidence = await seedEvidence(world.customerId, world.requestId);
      await seedReview(context, {
        versionId: world.versionId,
        outcome: 'REQUEST_REVISION',
        feedback: 'Nhờ chỉnh lại.',
        decidedAt: new Date('2026-08-19T07:00:00.000Z'),
        evidence,
      });

      const body = JSON.stringify((await get(world.requestId, world.versionId).expect(200)).body);
      expect(body).not.toContain(evidence.grantId);
      expect(body).not.toContain(evidence.stepUpChallengeId);
      expect(body).not.toContain(evidence.contactPointId);
      expect(body).not.toContain(world.customerId);
      expect(
        Object.keys(
          dataOf<DetailPayload>(await get(world.requestId, world.versionId).expect(200))
            .reviews[0] as object,
        ).sort(),
      ).toEqual(['decidedAt', 'feedback', 'outcome']);
    });
  });

  describe('the approval projection reads frozen snapshot truth', () => {
    it('returns the snapshot’s own labels even after the live product is renamed', async () => {
      const world = await seedCatalogWorld({ status: 'APPROVED' });
      const evidence = await seedCustomerEvidence(context, world.customerId, world.requestId);
      await context.rows(sql`
        update design_versions set status = 'APPROVED', document_hash = ${SENT_HASH},
               sent_at = now(), approved_at = now() where id = ${world.versionId}
      `);
      await seedApproval(context, {
        versionId: world.versionId,
        designCaseId: world.designCaseId,
        requestId: world.requestId,
        documentHash: SENT_HASH,
        evidence,
        placement: world.placement,
        productName: 'Áo thun cotton (tên lúc duyệt)',
        variantLabel: 'Trắng / L',
        sideName: 'Ngực trái',
        areaName: 'Vùng thêu ngực',
        physicalWidthMm: '120.00',
        physicalHeightMm: '80.00',
        quantityTotal: 50,
        approvedAt: new Date('2026-08-19T08:00:00.000Z'),
        agreements: [
          { agreementType: 'PAYMENT_POLICY', contentHash: `sha256:${'c'.repeat(64)}` },
          { agreementType: 'RETURN_POLICY', contentHash: `sha256:${'d'.repeat(64)}` },
        ],
      });

      // The live catalog row is renamed *after* the approval. Evidence must not
      // follow it.
      await context.rows(sql`
        update products set name = 'Tên mới sau khi duyệt' where id = ${world.placement.productId}
      `);

      const payload = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      );
      const approval = payload.approval as Record<string, unknown>;
      expect(approval).not.toBeNull();
      expect(approval['productName']).toBe('Áo thun cotton (tên lúc duyệt)');
      expect(approval['sideName']).toBe('Ngực trái');
      expect(approval['areaName']).toBe('Vùng thêu ngực');
      expect(approval['documentHash']).toBe(SENT_HASH);
      expect(approval['quantityTotal']).toBe(50);
      expect(approval['branch']).toBe('CATALOG');
      expect(approval['reverified']).toBe(true);
      expect(approval['physicalWidthMm']).toBe('120.00');
    });

    it('masks the frozen contacts and publishes neither in full', async () => {
      const world = await seedCatalogWorld({ status: 'APPROVED' });
      const evidence = await seedCustomerEvidence(context, world.customerId, world.requestId);
      await context.rows(sql`
        update design_versions set status = 'APPROVED', document_hash = ${SENT_HASH},
               sent_at = now(), approved_at = now() where id = ${world.versionId}
      `);
      await seedApproval(context, {
        versionId: world.versionId,
        designCaseId: world.designCaseId,
        requestId: world.requestId,
        documentHash: SENT_HASH,
        evidence,
        placement: world.placement,
        productName: 'Áo thun cotton',
        sideName: 'Ngực trái',
        areaName: 'Vùng thêu ngực',
        physicalWidthMm: '120.00',
        physicalHeightMm: '80.00',
        quantityTotal: 12,
        approvedAt: new Date('2026-08-19T09:00:00.000Z'),
        agreements: [{ agreementType: 'PAYMENT_POLICY', contentHash: `sha256:${'e'.repeat(64)}` }],
      });

      const response = await get(world.requestId, world.versionId).expect(200);
      const approval = dataOf<DetailPayload>(response).approval as Record<string, unknown>;
      const body = JSON.stringify(response.body);

      expect(approval['customerDisplayName']).toBe('Nguyễn Thị Mai');
      expect(approval['maskedEmail']).not.toBe(evidence.contactEmail);
      expect(String(approval['maskedEmail'])).toContain('***');
      expect(approval['maskedPhone']).not.toBe(evidence.contactPhone);
      expect(String(approval['maskedPhone'])).toContain('5678');
      // The unmasked values appear nowhere in the response.
      expect(body).not.toContain(evidence.contactEmail);
      expect(body).not.toContain(evidence.contactPhone);
    });

    it('returns a customer-owned approval with no fabricated Catalog identity', async () => {
      await context.seedAdminSession();
      const customerId = await context.seedCustomer();
      const seeded = await context.seedRequest({
        customerId,
        status: 'APPROVED',
        customerOwnedProductName: 'Áo khoác của khách',
      });
      const versionId = await context.seedVersion({
        designCaseId: seeded.designCaseId as string,
        version: 1,
        document: customerOwnedDocument(120, 80),
        documentSchemaVersion: 2,
        customerOwnedProductId: seeded.customerOwnedProductId as string,
        placementSideLabel: 'Lưng áo',
        placementAreaLabel: 'Vùng thêu lưng',
        physicalWidthMm: 120,
        physicalHeightMm: 80,
        status: 'APPROVED',
        documentHash: SENT_HASH,
      });
      const evidence = await seedCustomerEvidence(context, customerId, seeded.requestId);
      await seedApproval(context, {
        versionId,
        designCaseId: seeded.designCaseId as string,
        requestId: seeded.requestId,
        documentHash: SENT_HASH,
        evidence,
        customerOwnedProductId: seeded.customerOwnedProductId,
        productName: 'Áo khoác của khách',
        sideName: 'Lưng áo',
        areaName: 'Vùng thêu lưng',
        physicalWidthMm: '120.00',
        physicalHeightMm: '80.00',
        quantityTotal: 3,
        approvedAt: new Date('2026-08-19T10:00:00.000Z'),
        agreements: [{ agreementType: 'RETURN_POLICY', contentHash: `sha256:${'f'.repeat(64)}` }],
      });

      const approval = dataOf<DetailPayload>(await get(seeded.requestId, versionId).expect(200))
        .approval as Record<string, unknown>;

      expect(approval['branch']).toBe('CUSTOMER_OWNED');
      // A COP has no variant: absent because there is none, not because one was
      // not found.
      expect(approval['variantLabel']).toBeNull();
      expect(approval['productName']).toBe('Áo khoác của khách');
      expect(approval['sideName']).toBe('Lưng áo');
      expect(JSON.stringify(approval)).not.toContain('productId');
    });

    it('publishes the accepted agreements as type and content hash only', async () => {
      const world = await seedCatalogWorld({ status: 'APPROVED' });
      const evidence = await seedCustomerEvidence(context, world.customerId, world.requestId);
      await seedApproval(context, {
        versionId: world.versionId,
        designCaseId: world.designCaseId,
        requestId: world.requestId,
        documentHash: SENT_HASH,
        evidence,
        placement: world.placement,
        productName: 'Áo thun cotton',
        sideName: 'Ngực trái',
        areaName: 'Vùng thêu ngực',
        physicalWidthMm: '120.00',
        physicalHeightMm: '80.00',
        quantityTotal: 4,
        approvedAt: new Date('2026-08-19T11:00:00.000Z'),
        agreements: [
          { agreementType: 'PAYMENT_POLICY', contentHash: `sha256:${'1'.repeat(64)}` },
          { agreementType: 'RETURN_POLICY', contentHash: `sha256:${'2'.repeat(64)}` },
        ],
      });

      const approval = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      ).approval as { readonly agreements: readonly Record<string, unknown>[] };

      expect(approval.agreements).toHaveLength(2);
      expect(Object.keys(approval.agreements[0] as object).sort()).toEqual([
        'acceptedAt',
        'agreementType',
        'contentHash',
      ]);
      expect(approval.agreements.map((entry) => entry['agreementType'])).toEqual([
        'PAYMENT_POLICY',
        'RETURN_POLICY',
      ]);
    });

    it('returns a null approval for a version nobody approved', async () => {
      const world = await seedCatalogWorld();
      const payload = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      );
      expect(payload.approval).toBeNull();
    });
  });

  describe('it is a read', () => {
    it('writes nothing: no version, review, snapshot, audit or outbox row moves', async () => {
      const world = await seedCatalogWorld({ status: 'DESIGN_REVIEW' });
      const evidence = await seedCustomerEvidence(context, world.customerId, world.requestId);
      await seedReview(context, {
        versionId: world.versionId,
        outcome: 'REQUEST_REVISION',
        feedback: 'Nhờ chỉnh lại.',
        decidedAt: new Date('2026-08-19T12:00:00.000Z'),
        evidence,
      });

      const before = {
        versions: await context.count(sql`select count(*) from design_versions`),
        reviews: await context.count(sql`select count(*) from design_reviews`),
        snapshots: await context.count(sql`select count(*) from approval_snapshots`),
        audit: await context.count(sql`select count(*) from audit_events`),
        outbox: await context.count(sql`select count(*) from outbox_events`),
      };
      const [requestBefore] = await context.rows<{ status: string }>(
        sql`select status from custom_requests where id = ${world.requestId}`,
      );

      await get(world.requestId, world.versionId).expect(200);
      await get(world.requestId, world.versionId).expect(200);

      expect({
        versions: await context.count(sql`select count(*) from design_versions`),
        reviews: await context.count(sql`select count(*) from design_reviews`),
        snapshots: await context.count(sql`select count(*) from approval_snapshots`),
        audit: await context.count(sql`select count(*) from audit_events`),
        outbox: await context.count(sql`select count(*) from outbox_events`),
      }).toEqual(before);

      const [requestAfter] = await context.rows<{ status: string }>(
        sql`select status from custom_requests where id = ${world.requestId}`,
      );
      // The request stays where it was: this injector holds no order write
      // repository, so no route here could have moved it.
      expect(requestAfter?.status).toBe(requestBefore?.status);
    });

    it('reads a settled request’s version without re-checking authoring eligibility', async () => {
      // `QUOTED` is not an authoring-eligible state. Reading history in it is
      // legitimate, and refusing here would blank the evidence of every settled
      // request.
      const world = await seedCatalogWorld({ status: 'QUOTED' });
      const payload = dataOf<DetailPayload>(
        await get(world.requestId, world.versionId).expect(200),
      );
      expect(payload.versionId).toBe(world.versionId);
    });

    it('publishes no route on this module other than the one read', async () => {
      const world = await seedCatalogWorld();
      // The authoring, send and submitted-source routes are not in this
      // injector, so each is a 404 from the router rather than a refusal.
      await request(context.server())
        .post(`${detailRoute(world.requestId, world.versionId)}/send`)
        .set('Cookie', context.adminCookie())
        .expect(404);
      await request(context.server())
        .post(detailRoute(world.requestId, world.versionId))
        .set('Cookie', context.adminCookie())
        .send({ document: {} })
        .expect(404);
    });
  });
});
