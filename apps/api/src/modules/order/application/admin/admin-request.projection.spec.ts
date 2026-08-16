/**
 * Unit proof for the three Admin read rules that are decidable without a
 * database (`APP5-B04` §15.1): subject discrimination, the triage default, and
 * the internal / customer-visible reason split.
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  AdminRequestDetailRow,
  AdminRequestQueueRow,
} from '../../domain/repositories/custom-request-admin.repository';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import {
  DEFAULT_TRIAGE_STATUSES,
  findCurrentStatusTransition,
  projectDetailSubject,
  projectQueueSubject,
  resolveStatusFilter,
  selectCurrentReasons,
} from './admin-request.projection';

const REQUEST_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071' as CustomRequestId;
const PRODUCT_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e07' as ProductId;
const VARIANT_ID = '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e08' as ProductVariantId;

function queueRow(overrides: Partial<AdminRequestQueueRow> = {}): AdminRequestQueueRow {
  return {
    id: REQUEST_ID,
    code: 'REQ-7K3MPQ2XVD',
    status: 'NEW',
    customerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
    createdAt: new Date('2026-08-16T09:00:00.000Z'),
    productId: undefined,
    ...overrides,
  };
}

function detailRow(overrides: Partial<AdminRequestDetailRow> = {}): AdminRequestDetailRow {
  return {
    id: REQUEST_ID,
    code: 'REQ-7K3MPQ2XVD',
    status: 'NEW',
    customerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
    createdAt: new Date('2026-08-16T09:00:00.000Z'),
    updatedAt: new Date('2026-08-16T09:00:00.000Z'),
    productId: undefined,
    productVariantId: undefined,
    customerNote: undefined,
    cancelledReason: undefined,
    cancelledCustomerReason: undefined,
    submittedSessionId: undefined,
    ...overrides,
  };
}

describe('resolveStatusFilter', () => {
  it('falls back to the pre-quotation triage set when nothing is requested', () => {
    expect(resolveStatusFilter(undefined)).toEqual(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION']);
    expect(resolveStatusFilter([])).toEqual(DEFAULT_TRIAGE_STATUSES);
  });

  it('honours a specifically requested canonical status, including APP6 states', () => {
    // The queue offers no action in QUOTED, but it must still report the row
    // truthfully rather than pretend the database cannot hold that value.
    expect(resolveStatusFilter(['QUOTED'])).toEqual(['QUOTED']);
  });

  it('de-duplicates a repeated status', () => {
    expect(resolveStatusFilter(['NEW', 'NEW', 'REJECTED'])).toEqual(['NEW', 'REJECTED']);
  });
});

describe('projectQueueSubject', () => {
  it('names a catalog row by its product', () => {
    const subject = projectQueueSubject(
      queueRow({ productId: PRODUCT_ID }),
      { productName: 'Áo thun cotton', productSlug: 'ao-thun-cotton' },
      undefined,
    );
    expect(subject).toEqual({ kind: 'CATALOG', summary: 'Áo thun cotton' });
  });

  it('reports a catalog subject as unnamed rather than inventing a placeholder', () => {
    const subject = projectQueueSubject(queueRow({ productId: PRODUCT_ID }), undefined, 'ignored');
    expect(subject).toEqual({ kind: 'CATALOG', summary: undefined });
  });

  it('treats the absence of a product id as the customer-owned branch', () => {
    const subject = projectQueueSubject(queueRow(), undefined, 'Áo khoác jean cá nhân');
    expect(subject).toEqual({ kind: 'CUSTOMER_OWNED', summary: 'Áo khoác jean cá nhân' });
  });
});

describe('projectDetailSubject', () => {
  it('carries the design-session provenance on the catalog branch', () => {
    const subject = projectDetailSubject(
      detailRow({
        productId: PRODUCT_ID,
        productVariantId: VARIANT_ID,
        submittedSessionId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a',
      }),
      {
        productName: 'Áo thun cotton',
        productSlug: 'ao-thun-cotton',
        variantColorName: 'Trắng',
        variantSizeLabel: 'L',
      },
      undefined,
    );

    expect(subject).toEqual({
      kind: 'CATALOG',
      productId: PRODUCT_ID,
      productVariantId: VARIANT_ID,
      productName: 'Áo thun cotton',
      productSlug: 'ao-thun-cotton',
      variantColorName: 'Trắng',
      variantSizeLabel: 'L',
      designSessionId: '019826f0-1c3d-7a41-9b6e-2f5a8c4d1e0a',
    });
  });

  it('describes the customer-owned branch without any catalog field', () => {
    const subject = projectDetailSubject(detailRow(), undefined, {
      name: 'Áo khoác jean cá nhân',
      description: 'Áo khoác cũ.',
      physicalWidthMm: '250.00',
      physicalHeightMm: '300.00',
    });

    expect(subject?.kind).toBe('CUSTOMER_OWNED');
    // The union member has no product id, session id or slug to read at all —
    // the narrowing below would not compile if it did.
    expect(Object.keys(subject ?? {})).toEqual([
      'kind',
      'name',
      'description',
      'physicalWidthMm',
      'physicalHeightMm',
    ]);
  });

  it('reports no subject when neither branch is present', () => {
    expect(projectDetailSubject(detailRow(), undefined, undefined)).toBeUndefined();
  });
});

describe('selectCurrentReasons', () => {
  const clarification = {
    status: 'NEEDS_CLARIFICATION' as CustomRequestState,
    cancelledReason: undefined,
    cancelledCustomerReason: undefined,
    transitionReason: 'Ảnh mờ, không đủ chi tiết.',
    transitionCustomerVisibleReason: 'Xưởng cần thêm ảnh rõ hơn.',
  };

  it('keeps the internal and customer-visible halves in separate fields', () => {
    const reasons = selectCurrentReasons(clarification);
    expect(reasons.internalReason).toBe('Ảnh mờ, không đủ chi tiết.');
    expect(reasons.customerVisibleReason).toBe('Xưởng cần thêm ảnh rõ hơn.');
    expect(reasons.internalReason).not.toBe(reasons.customerVisibleReason);
  });

  it('reports an internal reason recorded without a customer-facing one', () => {
    const reasons = selectCurrentReasons({
      ...clarification,
      transitionCustomerVisibleReason: undefined,
    });
    expect(reasons.internalReason).toBe('Ảnh mờ, không đủ chi tiết.');
    // The absence must not be filled from the internal text: that is exactly the
    // collapse §10 forbids, and it would publish staff wording to a customer.
    expect(reasons.customerVisibleReason).toBeUndefined();
  });

  it('prefers the request row’s own columns on CANCELLED', () => {
    const reasons = selectCurrentReasons({
      status: 'CANCELLED',
      cancelledReason: 'Khách yêu cầu huỷ qua điện thoại.',
      cancelledCustomerReason: 'Yêu cầu đã được huỷ theo đề nghị của bạn.',
      transitionReason: 'stale internal',
      transitionCustomerVisibleReason: 'stale customer text',
    });
    expect(reasons.internalReason).toBe('Khách yêu cầu huỷ qua điện thoại.');
    expect(reasons.customerVisibleReason).toBe('Yêu cầu đã được huỷ theo đề nghị của bạn.');
  });

  it('falls back to the transition when a cancellation kept no column', () => {
    const reasons = selectCurrentReasons({
      status: 'CANCELLED',
      cancelledReason: undefined,
      cancelledCustomerReason: undefined,
      transitionReason: 'Huỷ trong giai đoạn S1.',
      transitionCustomerVisibleReason: 'Yêu cầu đã được huỷ.',
    });
    expect(reasons.internalReason).toBe('Huỷ trong giai đoạn S1.');
    expect(reasons.customerVisibleReason).toBe('Yêu cầu đã được huỷ.');
  });
});

describe('findCurrentStatusTransition', () => {
  const history = [
    { toStatus: 'UNDER_REVIEW' as CustomRequestState, reason: 'first' },
    { toStatus: 'NEEDS_CLARIFICATION' as CustomRequestState, reason: 'asked once' },
    { toStatus: 'UNDER_REVIEW' as CustomRequestState, reason: 'reopened' },
    { toStatus: 'NEEDS_CLARIFICATION' as CustomRequestState, reason: 'asked again' },
  ];

  it('takes the latest move into the current status, not the latest move', () => {
    expect(findCurrentStatusTransition(history, 'UNDER_REVIEW')?.reason).toBe('reopened');
    expect(findCurrentStatusTransition(history, 'NEEDS_CLARIFICATION')?.reason).toBe('asked again');
  });

  it('reports nothing when no recorded move produced the current status', () => {
    // The submission itself writes no transition row (`G01-D05`), so a NEW
    // request has no entry to find — and none is synthesised.
    expect(findCurrentStatusTransition(history, 'NEW')).toBeUndefined();
    expect(findCurrentStatusTransition([], 'NEW')).toBeUndefined();
  });
});
