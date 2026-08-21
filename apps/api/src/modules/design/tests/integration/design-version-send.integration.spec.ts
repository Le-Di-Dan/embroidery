/**
 * `APP6-B09` — sending one exact Design Version for review, end to end.
 *
 * Every assertion below is against a real HTTP application, real guards, the
 * real `DesignVersionSendModule` and a real database. Nothing is overridden and
 * no guard is stubbed.
 *
 * Only that one module is booted, which is what lets this suite make negative
 * claims honestly: there is no create route here, so "the send wrote no second
 * version" is a fact about the injector rather than about this file's restraint.
 *
 * The claims worth reading twice are the ones the roadmap names: the hash is
 * taken over the **persisted** document and nothing else; `DESIGN_REVIEW` is
 * reached only as a projection; a revision send on an already-reviewing request
 * appends no self-transition; and a second version cannot join an open review.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { prepareDesignDocument } from '@embroidery/design-document';
import {
  formatDesignDocumentHash,
  hashDesignDocumentSha256,
} from '@embroidery/design-document/server';

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
import { DesignVersionSendModule } from '../../design-version-send.module';

interface SentResponse {
  readonly requestId: string;
  readonly designCaseId: string;
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly requestStatus: string;
  readonly requestTransitioned: boolean;
  readonly branch: string;
  readonly documentSchemaVersion: number;
  readonly documentHash: string;
  readonly sentAt: string;
  readonly supersededVersionIds: readonly string[];
  readonly replayed: boolean;
}

interface VersionRow {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly design_document: unknown;
  readonly document_schema_version: number;
  readonly document_hash: string | null;
  readonly sent_at: Date | null;
  readonly superseded_at: Date | null;
  readonly preview_derivative_id: string | null;
  readonly preview_hash: string | null;
  readonly product_variant_id: string | null;
  readonly placement_side_label: string | null;
  readonly physical_width_mm: string;
}

interface TransitionRow {
  readonly from_status: string;
  readonly to_status: string;
  readonly actor_kind: string;
  readonly system_job_key: string | null;
}

/** An element comfortably inside the seeded Embroidery Area rectangle. */
const INSIDE_AREA = shapeAt(
  'shape-1',
  SIDE_GEOMETRY.areaXPx + 10,
  SIDE_GEOMETRY.areaYPx + 10,
  50,
  40,
);

/** The COP envelope these tests freeze — the version's own, never the item's. */
const COP_ENVELOPE = { widthMm: 120, heightMm: 90 } as const;

/**
 * The hash the send is expected to have stored, recomputed independently.
 *
 * Deliberately re-derived from the row rather than compared to a literal: a
 * hard-coded digest would still pass if the send hashed the wrong document, and
 * this cannot — it canonicalizes exactly what is in `design_document` and asks
 * whether that is what `document_hash` says.
 */
function expectedHashOf(storedDocument: unknown): string {
  const prepared = prepareDesignDocument(storedDocument);
  if (!prepared.ok) throw new Error('The stored document did not survive preparation.');
  return formatDesignDocumentHash(hashDesignDocumentSha256(prepared.value.document));
}

describe('APP6-B09 design version send', () => {
  let context: DesignVersionTestContext;
  let placement: SeededPlacement;
  let customerId: string;

  beforeAll(async () => {
    context = await createDesignVersionContext('app6-b09-design-send', DesignVersionSendModule);
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

  const send = (requestId: string, versionId: string) =>
    request(context.server())
      .post(ROUTE.send(requestId, versionId))
      .set('Cookie', context.adminCookie());

  /** A catalog request with a submitted session pointing back at it. */
  async function seedCatalogRequest(
    status = 'DIGITIZING',
  ): Promise<{ requestId: string; designCaseId: string }> {
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

  /** A DRAFT catalog version on that request's case, and the case points at it. */
  function seedCatalogDraft(
    designCaseId: string,
    version = 1,
    overrides: { status?: string; makeCurrent?: boolean; parentVersionId?: string } = {},
  ): Promise<string> {
    return context.seedVersion({
      designCaseId,
      version,
      document: catalogDocument(placement, [INSIDE_AREA]),
      documentSchemaVersion: 1,
      placement,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
      ...overrides,
    });
  }

  const versionRow = async (id: string): Promise<VersionRow> => {
    const [row] = await context.rows<VersionRow>(
      sql`select * from design_versions where id = ${id}`,
    );
    return row as VersionRow;
  };

  const requestStatusOf = async (requestId: string): Promise<string> => {
    const [row] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${requestId}`,
    );
    return (row as { status: string }).status;
  };

  const transitionsOf = (requestId: string): Promise<TransitionRow[]> =>
    context.rows<TransitionRow>(
      sql`select from_status, to_status, actor_kind, system_job_key
            from custom_request_transitions
           where custom_request_id = ${requestId} order by id asc`,
    );

  const sentAuditCount = (versionId: string): Promise<number> =>
    context.count(
      sql`select count(*)::text as count from audit_events
           where action = 'design_version.sent' and target_id = ${versionId}`,
    );

  const reviewReadyRows = (versionId: string) =>
    context.rows<{ aggregate_kind: string; payload: Record<string, unknown> }>(
      sql`select aggregate_kind, payload from outbox_events
           where event_type = 'design.review-ready' and aggregate_id = ${versionId}`,
    );

  describe('authorization and addressing', () => {
    it('refuses an unauthenticated caller', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);

      await request(context.server()).post(ROUTE.send(requestId, versionId)).expect(401);
      expect((await versionRow(versionId)).status).toBe('DRAFT');
    });

    it('answers 404 for a request that does not exist', async () => {
      const absent = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099';
      await send(absent, absent).expect(404);
    });

    it('refuses a version belonging to another request, revealing nothing about it', async () => {
      const mine = await seedCatalogRequest();
      await seedCatalogDraft(mine.designCaseId);
      const theirs = await seedCatalogRequest();
      const foreignVersionId = await seedCatalogDraft(theirs.designCaseId);

      const response = await send(mine.requestId, foreignVersionId).expect(404);

      // The same answer a missing row gets: a foreign id must not be able to
      // confirm that a version exists on somebody else's design case.
      expect(codeOf(response)).toBe('DESIGN_VERSION_NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain(theirs.requestId);
      expect(JSON.stringify(response.body)).not.toContain(theirs.designCaseId);
      expect((await versionRow(foreignVersionId)).status).toBe('DRAFT');
      expect(await sentAuditCount(foreignVersionId)).toBe(0);
    });
  });

  describe('a first catalog send', () => {
    it('freezes the version, hashes the persisted document and projects DESIGN_REVIEW', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);
      const before = await versionRow(versionId);

      const response = await send(requestId, versionId).expect(200);
      const sent = dataOf<{ sent: SentResponse }>(response).sent;

      expect(sent.versionStatus).toBe('SENT_FOR_REVIEW');
      expect(sent.requestStatus).toBe('DESIGN_REVIEW');
      expect(sent.requestTransitioned).toBe(true);
      expect(sent.replayed).toBe(false);
      expect(sent.branch).toBe('CATALOG');
      expect(sent.supersededVersionIds).toEqual([]);

      const after = await versionRow(versionId);
      expect(after.status).toBe('SENT_FOR_REVIEW');
      expect(after.sent_at).not.toBeNull();
      expect(after.document_hash).toBe(sent.documentHash);
      // The hash is over the row's own document — recomputed here from what the
      // database actually holds, so a send that hashed anything else fails.
      expect(after.document_hash).toBe(expectedHashOf(after.design_document));
      expect(after.document_hash).toMatch(/^sha256:[0-9a-f]{64}$/);

      // The document, its schema version and the placement are untouched: the
      // send freezes a version, it does not rewrite one.
      expect(after.design_document).toEqual(before.design_document);
      expect(after.document_schema_version).toBe(1);
      expect(after.product_variant_id).toBe(placement.productVariantId);
      expect(after.physical_width_mm).toBe(before.physical_width_mm);

      // No raster, no derivative, no preview.
      expect(after.preview_derivative_id).toBeNull();
      expect(after.preview_hash).toBeNull();

      expect(await requestStatusOf(requestId)).toBe('DESIGN_REVIEW');
    });

    it('records the request move as a SYSTEM projection, never as an Admin command', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);

      await send(requestId, versionId).expect(200);

      const transitions = await transitionsOf(requestId);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]?.from_status).toBe('DIGITIZING');
      expect(transitions[0]?.to_status).toBe('DESIGN_REVIEW');
      expect(transitions[0]?.actor_kind).toBe('SYSTEM');
      expect(transitions[0]?.system_job_key).toBe('design.version.send');
    });

    it('writes exactly one audit row and one review-ready event, with no design content', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);

      const sent = dataOf<{ sent: SentResponse }>(
        await send(requestId, versionId).expect(200),
      ).sent;

      expect(await sentAuditCount(versionId)).toBe(1);
      const [audit] = await context.rows<{ actor_kind: string; summary: Record<string, unknown> }>(
        sql`select actor_kind, summary from audit_events
             where action = 'design_version.sent' and target_id = ${versionId}`,
      );
      // The operator commanded the *send*; only the request move is the system's.
      expect(audit?.actor_kind).toBe('ADMIN');
      expect(audit?.summary?.['fromStatus']).toBe('DRAFT');
      expect(audit?.summary?.['toStatus']).toBe('SENT_FOR_REVIEW');
      // DB3 permits a hash reference in the audit trail, and nothing more.
      expect(audit?.summary?.['documentHash']).toBe(sent.documentHash);
      expect(JSON.stringify(audit?.summary)).not.toContain('shape-1');

      const events = await reviewReadyRows(versionId);
      expect(events).toHaveLength(1);
      expect(events[0]?.aggregate_kind).toBe('DESIGN_VERSION');
      const payload = events[0]?.payload ?? {};
      expect(Object.keys(payload).sort()).toEqual(
        [
          'customRequestId',
          'designCaseId',
          'designVersionId',
          'schemaVersion',
          'sentAt',
          'version',
        ].sort(),
      );
      // SE-004 authorizes a hash for the audit trail, not for the event; and no
      // document, element, secret or storage reference may travel either.
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('sha256:');
      expect(serialized).not.toContain('shape-1');
      expect(serialized).not.toContain('schemaVersion":1,"placement');
      for (const forbidden of ['token', 'secret', 'storageKey', 'bucket', 'grant', 'elements']) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('a customer-owned send', () => {
    it('hashes the v2 document and freezes the labels and envelope unchanged', async () => {
      const seeded = await context.seedRequest({
        customerId,
        status: 'DIGITIZING',
        customerOwnedProductName: 'Áo khoác của khách',
        // The item's own dimensions — evidence, never the envelope.
        customerOwnedItemWidthMm: '600',
        customerOwnedItemHeightMm: '800',
      });
      const designCaseId = seeded.designCaseId as string;
      const versionId = await context.seedVersion({
        designCaseId,
        version: 1,
        document: customerOwnedDocument(COP_ENVELOPE.widthMm, COP_ENVELOPE.heightMm, [
          shapeAt('cop-1', 10, 10, 20, 20),
        ]),
        documentSchemaVersion: 2,
        customerOwnedProductId: seeded.customerOwnedProductId as string,
        placementSideLabel: 'Ngực trái',
        placementAreaLabel: 'Vùng thêu chính',
        physicalWidthMm: COP_ENVELOPE.widthMm,
        physicalHeightMm: COP_ENVELOPE.heightMm,
      });

      const sent = dataOf<{ sent: SentResponse }>(
        await send(seeded.requestId, versionId).expect(200),
      ).sent;

      expect(sent.branch).toBe('CUSTOMER_OWNED');
      expect(sent.documentSchemaVersion).toBe(2);

      const after = await versionRow(versionId);
      expect(after.status).toBe('SENT_FOR_REVIEW');
      expect(after.document_hash).toBe(expectedHashOf(after.design_document));
      // v2 stays v2: no document is migrated to make a hash computable.
      expect(after.document_schema_version).toBe(2);
      expect(after.placement_side_label).toBe('Ngực trái');
      // The version's own envelope, not the 600×800 garment.
      expect(after.physical_width_mm).toBe(String(COP_ENVELOPE.widthMm));
      expect(await requestStatusOf(seeded.requestId)).toBe('DESIGN_REVIEW');
    });
  });

  describe('a revision send while the request is already in review', () => {
    it('supersedes the revision-requested predecessor and appends no self-transition', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest('DESIGN_REVIEW');
      const predecessorId = await seedCatalogDraft(designCaseId, 1, {
        status: 'REVISION_REQUESTED',
        makeCurrent: false,
      });
      const versionId = await seedCatalogDraft(designCaseId, 2, {
        parentVersionId: predecessorId,
      });

      const sent = dataOf<{ sent: SentResponse }>(
        await send(requestId, versionId).expect(200),
      ).sent;

      expect(sent.requestTransitioned).toBe(false);
      expect(sent.requestStatus).toBe('DESIGN_REVIEW');
      expect(sent.supersededVersionIds).toEqual([predecessorId]);

      const predecessor = await versionRow(predecessorId);
      expect(predecessor.status).toBe('SUPERSEDED');
      expect(predecessor.superseded_at).not.toBeNull();
      // History is preserved: only the two lifecycle columns the CST-090 trigger
      // permits on a frozen row changed.
      expect(predecessor.design_document).not.toBeNull();
      expect(predecessor.version).toBe(1);

      // LC-11 has no self-edge, so the request gained no transition row at all.
      expect(await transitionsOf(requestId)).toEqual([]);
      expect(await requestStatusOf(requestId)).toBe('DESIGN_REVIEW');
    });
  });

  describe('replay', () => {
    it('replays the same version with zero writes', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);

      const first = dataOf<{ sent: SentResponse }>(
        await send(requestId, versionId).expect(200),
      ).sent;
      const committed = await versionRow(versionId);

      const second = dataOf<{ sent: SentResponse }>(
        await send(requestId, versionId).expect(200),
      ).sent;

      expect(second.replayed).toBe(true);
      expect(second.requestTransitioned).toBe(false);
      expect(second.documentHash).toBe(first.documentHash);
      expect(second.sentAt).toBe(first.sentAt);
      expect(second.supersededVersionIds).toEqual([]);

      const after = await versionRow(versionId);
      expect(after.document_hash).toBe(committed.document_hash);
      expect(after.sent_at).toEqual(committed.sent_at);
      expect(await sentAuditCount(versionId)).toBe(1);
      expect(await reviewReadyRows(versionId)).toHaveLength(1);
      expect(await transitionsOf(requestId)).toHaveLength(1);
    });
  });

  describe('refusals', () => {
    it('refuses a second version while a review is open (GRD-004)', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest('DESIGN_REVIEW');
      const inReviewId = await seedCatalogDraft(designCaseId, 1, {
        status: 'SENT_FOR_REVIEW',
        makeCurrent: false,
      });
      const versionId = await seedCatalogDraft(designCaseId, 2);

      const response = await send(requestId, versionId).expect(409);

      expect(codeOf(response)).toBe('REVIEW_ALREADY_ACTIVE');
      // The open review is never cleared to make room for the new send.
      expect((await versionRow(inReviewId)).status).toBe('SENT_FOR_REVIEW');
      expect((await versionRow(versionId)).status).toBe('DRAFT');
      expect((await versionRow(versionId)).document_hash).toBeNull();
      expect(await sentAuditCount(versionId)).toBe(0);
      expect(await reviewReadyRows(versionId)).toHaveLength(0);
    });

    it('refuses a version that is not a draft', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId, 1, { status: 'APPROVED' });

      const response = await send(requestId, versionId).expect(409);
      expect(codeOf(response)).toBe('DESIGN_VERSION_NOT_SENDABLE');
      expect((await versionRow(versionId)).status).toBe('APPROVED');
    });

    it('sends a draft the design case does not point at, and leaves the pointer alone', async () => {
      // LC-08 states no current-version rule for `TR-LC08-02`, and B08's pointer
      // means "the newest authored draft" rather than "the version under
      // review". So an older draft is sendable — and the send preserves the
      // pointer rather than quietly redefining what it means.
      const { requestId, designCaseId } = await seedCatalogRequest();
      const olderId = await seedCatalogDraft(designCaseId, 1, { makeCurrent: false });
      const newerId = await seedCatalogDraft(designCaseId, 2);

      await send(requestId, olderId).expect(200);

      expect((await versionRow(olderId)).status).toBe('SENT_FOR_REVIEW');
      expect((await versionRow(newerId)).status).toBe('DRAFT');
      const [designCase] = await context.rows<{ current_version_id: string }>(
        sql`select current_version_id from design_cases where id = ${designCaseId}`,
      );
      expect(designCase?.current_version_id).toBe(newerId);
    });

    it('refuses a request that is not being digitized or reviewed', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest('QUOTED');
      const versionId = await seedCatalogDraft(designCaseId);

      const response = await send(requestId, versionId).expect(409);
      expect(codeOf(response)).toBe('REQUEST_NOT_SENDABLE');
      expect((await versionRow(versionId)).status).toBe('DRAFT');
      expect(await requestStatusOf(requestId)).toBe('QUOTED');
    });

    it('refuses when the frozen placement no longer matches the request', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);
      // A second variant of the same product, and the request now names it. The
      // version's frozen quartet still names the first — nothing is substituted.
      const otherVariantId = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6088';
      await context.rows(
        sql`insert into product_variants (id, product_id, color_name, size_label, display_order, is_active)
            values (${otherVariantId}, ${placement.productId}, 'Đen', 'M', 2, true)`,
      );
      await context.rows(
        sql`update custom_requests set product_variant_id = ${otherVariantId} where id = ${requestId}`,
      );

      const response = await send(requestId, versionId).expect(409);
      expect(codeOf(response)).toBe('PLACEMENT_FROZEN_MISMATCH');
      expect((await versionRow(versionId)).status).toBe('DRAFT');
      expect((await versionRow(versionId)).product_variant_id).toBe(placement.productVariantId);
      expect(await requestStatusOf(requestId)).toBe('DIGITIZING');
    });

    it('refuses when the catalog placement can no longer be resolved at all', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);
      await context.rows(
        sql`update custom_requests set product_variant_id = null where id = ${requestId}`,
      );

      const response = await send(requestId, versionId).expect(409);
      expect(codeOf(response)).toBe('PLACEMENT_AUTHORITY_UNRESOLVED');
      expect((await versionRow(versionId)).status).toBe('DRAFT');
    });

    it('refuses when the request has no resolvable design case', async () => {
      const { requestId, designCaseId } = await seedCatalogRequest();
      const versionId = await seedCatalogDraft(designCaseId);
      await context.rows(
        sql`update custom_requests set current_design_case_id = null where id = ${requestId}`,
      );

      const response = await send(requestId, versionId).expect(409);
      expect(codeOf(response)).toBe('DESIGN_CASE_UNRESOLVED');
      expect((await versionRow(versionId)).status).toBe('DRAFT');
    });
  });
});
