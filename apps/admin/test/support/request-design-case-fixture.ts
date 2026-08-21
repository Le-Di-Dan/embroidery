/**
 * Design-case fixtures shaped exactly like the accepted `APP6-B04`/`B07`/`B08`/
 * `B09` contracts and `APP6-A02`'s exact-version detail.
 *
 * ### The documents are real P01 documents
 *
 * `APP3-P01`'s validator is the acceptance authority the screen composes over,
 * so a fixture carrying an approximate document would render as "unreadable" and
 * prove nothing about the branch under test. These are the shapes the package
 * actually accepts, with a v1 Catalog placement and a v2 customer-owned one that
 * expresses placement absence.
 *
 * ### The two version pointers are deliberately allowed to disagree
 *
 * {@link makeVersionList} lets `current` name one row while another sits in
 * `SENT_FOR_REVIEW`. That is the state `APP6-A02` §14 is most concerned about —
 * a workshop that has started the next draft while the customer's review is
 * still open — and a fixture where the two always agreed would let the
 * conflation ship untested.
 *
 * ### The approval snapshot deliberately disagrees with the live subject
 *
 * `makeApproval` names a product that is *not* the fixture request's product, so
 * a screen re-resolving evidence from current rows fails visibly instead of
 * happening to look right.
 */
import type {
  AdminCustomRequestDetailResponse,
  AdminSubmittedDesignResponse,
  ApprovalEvidenceResponse,
  DesignVersionCreatedResponse,
  DesignVersionDetailResponse,
  DesignVersionListResponse,
  DesignVersionResponse,
  DesignVersionSentResponse,
} from '@embroidery/api-client';

export const DESIGN_REQUEST_ID = '01950000-0000-7000-8000-00000000d001';
export const DESIGN_CASE_ID = '01950000-0000-7000-8000-00000000dc01';
export const VERSION_1_ID = '01950000-0000-7000-8000-00000000dv01';
export const VERSION_2_ID = '01950000-0000-7000-8000-00000000dv02';
export const SESSION_ID = '01950000-0000-7000-8000-00000000ds01';
export const ASSET_ID = '01950000-0000-7000-8000-00000000da01';

export const SENT_HASH = `sha256:${'b'.repeat(64)}`;
export const APPROVED_HASH = `sha256:${'c'.repeat(64)}`;

export function envelope<T>(data: T): { readonly data: T } {
  return { data };
}

/** A v1 Catalog document P01 accepts, with one shape element. */
export function catalogDocument(elementId = 'element-1'): Record<string, unknown> {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: '01950000-0000-7000-8000-00000000ps01',
      embroideryAreaId: '01950000-0000-7000-8000-00000000ea01',
      canvasWidthPx: 1000,
      canvasHeightPx: 1200,
      physicalWidthMm: 400,
      physicalHeightMm: 480,
      pxPerMm: 2.5,
    },
    elements: [
      {
        id: elementId,
        type: 'shape',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 120, y: 170, width: 100, height: 60, rotationDeg: 0, scaleX: 1, scaleY: 1 },
        shape: 'rectangle',
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidthPx: 2,
      },
    ],
  };
}

/** A v2 customer-owned document: both placement ids explicitly null. */
export function customerOwnedDocument(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    placement: {
      productSideId: null,
      embroideryAreaId: null,
      canvasWidthPx: 120,
      canvasHeightPx: 80,
      physicalWidthMm: 120,
      physicalHeightMm: 80,
      pxPerMm: 1,
    },
    elements: [],
  };
}

export function makeCatalogRequest(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return {
    requestId: DESIGN_REQUEST_ID,
    code: 'REQ-2026-000901',
    status: 'DIGITIZING',
    submittedAt: '2026-08-18T02:30:00.000Z',
    updatedAt: '2026-08-19T02:30:00.000Z',
    customerNote: 'Thêu logo ngực trái.',
    customer: { customerId: '01950000-0000-7000-8000-00000000cu01', displayName: 'Trần Bảo' },
    subject: {
      kind: 'CATALOG',
      productId: '01950000-0000-7000-8000-00000000pr01',
      productVariantId: '01950000-0000-7000-8000-00000000pv01',
      productName: 'Áo thun cotton',
      productSlug: 'ao-thun-cotton',
      variantColorName: 'Trắng',
      variantSizeLabel: 'L',
    },
    quantities: [{ sizeLabel: 'L', quantity: 12 }],
    totalQuantity: 12,
    assets: [],
    transitions: [],
    moderationNotes: [],
    quotationId: null,
    ...overrides,
  } as unknown as AdminCustomRequestDetailResponse;
}

export function makeCopRequest(
  overrides: Record<string, unknown> = {},
): AdminCustomRequestDetailResponse {
  return makeCatalogRequest({
    subject: { kind: 'CUSTOMER_OWNED', name: 'Áo khoác jean cá nhân' },
    assets: [
      {
        assetId: ASSET_ID,
        role: 'COP_IMAGE',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        uploadedAt: '2026-08-18T02:31:00.000Z',
      },
    ],
    ...overrides,
  });
}

/** `APP6-B07`: a Catalog source, or the honest absence. */
export function makeSubmittedSource(
  document: Record<string, unknown> = catalogDocument(),
): AdminSubmittedDesignResponse {
  return {
    submittedDesign: {
      sessionId: SESSION_ID,
      document,
      documentSchemaVersion: 1,
      revision: 4,
    },
  } as unknown as AdminSubmittedDesignResponse;
}

export function makeAbsentSource(): AdminSubmittedDesignResponse {
  return { submittedDesign: null };
}

/**
 * One history row.
 *
 * Overrides are typed `Record<string, unknown>`, as `makeCatalogRequest` is and
 * for the same reason: a test must be able to seed a status the contract does
 * **not** publish, so the neutral-fallback path is reachable. A
 * `Partial<DesignVersionResponse>` would make that unrepresentable and leave the
 * degradation untested.
 */
export function makeVersion(overrides: Record<string, unknown> = {}): DesignVersionResponse {
  return {
    versionId: VERSION_1_ID,
    version: 1,
    status: 'DRAFT',
    parentVersionId: null,
    documentSchemaVersion: 1,
    branch: 'CATALOG',
    productId: '01950000-0000-7000-8000-00000000pr01',
    productVariantId: '01950000-0000-7000-8000-00000000pv01',
    productSideId: '01950000-0000-7000-8000-00000000ps01',
    embroideryAreaId: '01950000-0000-7000-8000-00000000ea01',
    placementSideLabel: null,
    placementAreaLabel: null,
    physicalWidthMm: '400.00',
    physicalHeightMm: '480.00',
    current: true,
    sentAt: null,
    approvedAt: null,
    reviews: [],
    ...overrides,
  } as unknown as DesignVersionResponse;
}

export function makeVersionList(
  versions: readonly DesignVersionResponse[] = [makeVersion()],
): DesignVersionListResponse {
  return { designCaseId: DESIGN_CASE_ID, versions } as unknown as DesignVersionListResponse;
}

export function makeVersionDetail(
  overrides: Record<string, unknown> = {},
): DesignVersionDetailResponse {
  return {
    versionId: VERSION_1_ID,
    designCaseId: DESIGN_CASE_ID,
    version: 1,
    status: 'DRAFT',
    parentVersionId: null,
    documentSchemaVersion: 1,
    branch: 'CATALOG',
    productId: '01950000-0000-7000-8000-00000000pr01',
    productVariantId: '01950000-0000-7000-8000-00000000pv01',
    productSideId: '01950000-0000-7000-8000-00000000ps01',
    embroideryAreaId: '01950000-0000-7000-8000-00000000ea01',
    placementSideLabel: null,
    placementAreaLabel: null,
    physicalWidthMm: '400.00',
    physicalHeightMm: '480.00',
    current: true,
    sentAt: null,
    approvedAt: null,
    documentHash: null,
    document: catalogDocument(),
    reviews: [],
    approval: null,
    ...overrides,
  } as unknown as DesignVersionDetailResponse;
}

/**
 * A frozen approval whose product name deliberately differs from the live
 * subject, so re-resolution from current rows would be visible.
 */
export function makeApproval(overrides: Record<string, unknown> = {}): ApprovalEvidenceResponse {
  return {
    documentHash: APPROVED_HASH,
    approvedAt: '2026-08-19T08:00:00.000Z',
    customerDisplayName: 'Nguyễn Thị Mai',
    maskedEmail: 'm***@vidu.com',
    maskedPhone: '+84 ***** 5678',
    reverified: true,
    productName: 'Áo thun cotton (tên lúc duyệt)',
    variantLabel: 'Trắng / L',
    sideName: 'Ngực trái',
    areaName: 'Vùng thêu ngực',
    physicalWidthMm: '120.00',
    physicalHeightMm: '80.00',
    quantityTotal: 50,
    branch: 'CATALOG',
    agreements: [
      {
        agreementType: 'PAYMENT_POLICY',
        contentHash: `sha256:${'1'.repeat(64)}`,
        acceptedAt: '2026-08-19T08:00:00.000Z',
      },
    ],
    ...overrides,
  } as unknown as ApprovalEvidenceResponse;
}

export function makeCreated(versionId = VERSION_2_ID): DesignVersionCreatedResponse {
  return { version: makeVersion({ versionId, version: 2, current: true }) };
}

export function makeSent(overrides: Record<string, unknown> = {}): DesignVersionSentResponse {
  return {
    versionId: VERSION_1_ID,
    version: 1,
    versionStatus: 'SENT_FOR_REVIEW',
    designCaseId: DESIGN_CASE_ID,
    requestId: DESIGN_REQUEST_ID,
    requestStatus: 'DESIGN_REVIEW',
    requestTransitioned: true,
    documentHash: SENT_HASH,
    documentSchemaVersion: 1,
    branch: 'CATALOG',
    sentAt: '2026-08-19T09:00:00.000Z',
    supersededVersionIds: [],
    replayed: false,
    ...overrides,
  } as unknown as DesignVersionSentResponse;
}
