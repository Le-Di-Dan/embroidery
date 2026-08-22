/**
 * Fixtures for the `/truy-cap/duyet-thiet-ke` suites (`APP6-S02`).
 *
 * Every value is synthetic. The token comes from the APP4 secure-link fixture
 * rather than being redeclared, so the one test credential in this app has one
 * definition and the secrecy sweeps of all three landings assert the absence of
 * the same string. No real token and no real verification code appears here or
 * in the completion report.
 *
 * The documents are built from the `@embroidery/design-document` types rather
 * than hand-typed literals, so a schema change breaks these at compile time
 * instead of letting a preview test keep passing against a shape that no longer
 * exists. `inter` is the only id in the controlled font registry, so it is the
 * only one a valid text fixture may name — the same constraint the running
 * screen is under.
 *
 * The two branches are both here and they are genuinely different documents:
 * the Catalog one declares `schemaVersion: 1` with the catalog placement pair
 * set, and the customer-owned-product one declares `schemaVersion: 2` with both
 * of those `null`. A renderer that quietly converted one to the other, or that
 * read `productSideId` at all, would fail against the second.
 */
import type {
  CustomerDesignReviewResponse,
  DesignApprovedResponse,
  DesignReviewAgreementResponse,
  DesignRevisionRequestedResponse,
} from '@embroidery/api-client';
import type {
  DesignDocument,
  DesignElement,
  DesignElementTransform,
  FreehandElement,
  ImageElement,
  ShapeElement,
  TextElement,
} from '@embroidery/design-document';

export const VERSION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';
export const NEWER_VERSION_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3402';

export const DOCUMENT_HASH =
  'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
export const NEWER_DOCUMENT_HASH =
  'sha256:1b4f0e9851971998e732078544c96b36c3d01cedf7caa332359d6f1d83567014';

export const PAYMENT_AGREEMENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3411';
export const RETURN_AGREEMENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3412';

export const PAYMENT_CONTENT_HASH =
  'sha256:2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef06fdefb64a3';
export const RETURN_CONTENT_HASH =
  'sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a';
export const REPUBLISHED_CONTENT_HASH =
  'sha256:ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d';

export const CONTROLLED_FONT_ID = 'inter';
export const CANVAS_WIDTH_PX = 1000;
export const CANVAS_HEIGHT_PX = 800;

const BASE_TRANSFORM = {
  x: 40,
  y: 30,
  width: 200,
  height: 120,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
} as const;

function base(id: string, transform: Partial<DesignElementTransform> = {}) {
  return {
    id,
    visible: true,
    locked: false,
    opacity: 1,
    transform: { ...BASE_TRANSFORM, ...transform },
  };
}

export function textElement(id: string, overrides: Partial<TextElement> = {}): TextElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, transform ?? {}),
    type: 'text',
    text: 'Nét Thêu',
    fontId: CONTROLLED_FONT_ID,
    fontSizePx: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    fill: '#171717',
    ...rest,
  };
}

export function shapeElement(id: string, overrides: Partial<ShapeElement> = {}): ShapeElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, transform ?? {}),
    type: 'shape',
    shape: 'rectangle',
    fill: '#e8475f',
    stroke: '#171717',
    strokeWidthPx: 2,
    ...rest,
  };
}

export function imageElement(id: string, overrides: Partial<ImageElement> = {}): ImageElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, transform ?? {}),
    type: 'image',
    assetId: '3f2504e0-4f89-41d3-9a0c-0305e82c3421',
    derivativeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3422',
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
    ...rest,
  };
}

export function freehandElement(
  id: string,
  overrides: Partial<FreehandElement> = {},
): FreehandElement {
  const { transform, ...rest } = overrides;
  return {
    ...base(id, transform ?? {}),
    type: 'freehand',
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 25 },
      { x: 90, y: 10 },
    ],
    stroke: '#171717',
    strokeWidthPx: 3,
    ...rest,
  };
}

/** The Catalog branch: schema version 1, catalog placement pair set. */
export function catalogDocument(elements?: readonly DesignElement[]): DesignDocument {
  return {
    schemaVersion: 1,
    placement: {
      productSideId: '3f2504e0-4f89-41d3-9a0c-0305e82c3431',
      embroideryAreaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3432',
      canvasWidthPx: CANVAS_WIDTH_PX,
      canvasHeightPx: CANVAS_HEIGHT_PX,
      physicalWidthMm: 250,
      physicalHeightMm: 200,
      pxPerMm: 4,
    },
    elements: elements ?? [textElement('el-text'), shapeElement('el-shape')],
  };
}

/**
 * The customer-owned-product branch: schema version 2, catalog pair `null`.
 *
 * Null together, never half — a half-null pair is invalid in every version, so
 * a fixture that set only one would be testing the validator rather than the
 * renderer.
 */
export function copDocument(elements?: readonly DesignElement[]): DesignDocument {
  return {
    schemaVersion: 2,
    placement: {
      productSideId: null,
      embroideryAreaId: null,
      canvasWidthPx: CANVAS_WIDTH_PX,
      canvasHeightPx: CANVAS_HEIGHT_PX,
      physicalWidthMm: 250,
      physicalHeightMm: 200,
      pxPerMm: 4,
    },
    elements: elements ?? [textElement('el-cop-text'), imageElement('el-cop-image')],
  };
}

export function paymentAgreement(
  overrides: Partial<DesignReviewAgreementResponse> = {},
): DesignReviewAgreementResponse {
  return {
    agreementVersionId: PAYMENT_AGREEMENT_ID,
    agreementType: 'PAYMENT_POLICY',
    version: 3,
    contentHash: PAYMENT_CONTENT_HASH,
    language: 'vi',
    content:
      'Khách hàng đặt cọc theo tỉ lệ ghi trên báo giá.\n\nPhần còn lại thanh toán trước khi giao hàng.',
    ...overrides,
  };
}

export function returnAgreement(
  overrides: Partial<DesignReviewAgreementResponse> = {},
): DesignReviewAgreementResponse {
  return {
    agreementVersionId: RETURN_AGREEMENT_ID,
    agreementType: 'RETURN_POLICY',
    version: 2,
    contentHash: RETURN_CONTENT_HASH,
    language: 'vi',
    content: 'Sản phẩm thêu theo yêu cầu riêng không đổi trả, trừ khi lỗi do cửa hàng.',
    ...overrides,
  };
}

/**
 * Widens a package `DesignDocument` to the generated transport shape.
 *
 * The two are structurally the same document and deliberately so — the API
 * publishes the single `APP3-P01` component — but `@embroidery/design-document`
 * declares its arrays `readonly` and a generated interface cannot. The screen
 * receives the transport shape off the wire and hands it straight to the
 * validator, which is where `readonly` is re-established; a fixture is the one
 * place that crossing has to be written down.
 */
export function asTransport(document: DesignDocument): CustomerDesignReviewResponse['document'] {
  return document as CustomerDesignReviewResponse['document'];
}

export function makeReview(
  overrides: Partial<CustomerDesignReviewResponse> = {},
): CustomerDesignReviewResponse {
  return {
    accessExpiresAt: '2026-09-01T09:00:00.000Z',
    agreements: [paymentAgreement(), returnAgreement()],
    designVersionId: VERSION_ID,
    document: asTransport(catalogDocument()),
    documentHash: DOCUMENT_HASH,
    documentSchemaVersion: 1,
    sentAt: '2026-08-19T09:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

export function makeApproved(
  overrides: Partial<DesignApprovedResponse> = {},
): DesignApprovedResponse {
  return {
    approvalSnapshotId: '3f2504e0-4f89-41d3-9a0c-0305e82c3441',
    approvedAt: '2026-08-20T08:31:00.000Z',
    documentHash: DOCUMENT_HASH,
    replayed: false,
    requestStatus: 'APPROVED',
    version: 2,
    versionId: VERSION_ID,
    versionStatus: 'APPROVED',
    ...overrides,
  };
}

export function makeRevisionRequested(
  overrides: Partial<DesignRevisionRequestedResponse> = {},
): DesignRevisionRequestedResponse {
  return {
    decidedAt: '2026-08-20T09:05:00.000Z',
    requestStatus: 'DESIGN_REVIEW',
    version: 2,
    versionId: VERSION_ID,
    versionStatus: 'REVISION_REQUESTED',
    ...overrides,
  };
}

/**
 * Points the jsdom window at `/truy-cap/duyet-thiet-ke` with the given
 * fragment.
 *
 * A separate helper from the APP4 landing's and the quotation's rather than a
 * parameter on either: the route is the thing under test here, and a test that
 * could be pointed at the wrong path by a default argument would prove nothing
 * about this one.
 */
export function navigateToDesignReview(fragment: string): void {
  window.history.replaceState(null, '', `/truy-cap/duyet-thiet-ke${fragment}`);
}
