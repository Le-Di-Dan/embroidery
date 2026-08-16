/**
 * The two decisions the customer projection makes (`APP5-B03` §12).
 *
 * Both are pure, so they are proved here without a container: which subject a
 * request has, and which reason text a customer may read. The database-backed
 * facts — that the grant scopes the read, that the columns behind these inputs
 * are the customer-safe ones — are proved in `request-status.integration.spec.ts`.
 */
import type { CustomRequestState } from '@embroidery/database';

import type {
  CustomRequestStatusCustomerOwnedProduct,
  CustomRequestStatusRow,
} from '../../domain/repositories/custom-request-status.repository';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import {
  REASON_BEARING_STATUSES,
  projectSubject,
  selectCustomerVisibleReason,
} from './request-status.projection';

const ALL_STATES: readonly CustomRequestState[] = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

function row(overrides: Partial<CustomRequestStatusRow> = {}): CustomRequestStatusRow {
  return {
    id: 'request-1' as CustomRequestId,
    code: 'REQ-7K3MPQ2XVD',
    status: 'NEW',
    createdAt: new Date('2026-08-16T09:00:00.000Z'),
    productId: undefined,
    productVariantId: undefined,
    cancelledCustomerReason: undefined,
    ...overrides,
  };
}

const COP: CustomRequestStatusCustomerOwnedProduct = {
  name: 'Áo khoác jean',
  description: 'Thêu ở lưng.',
  physicalWidthMm: '250.00',
  physicalHeightMm: '300.00',
};

describe('projectSubject', () => {
  it('describes a catalog request from the request row and the catalog labels', () => {
    const subject = projectSubject(
      row({ productId: 'p-1' as ProductId, productVariantId: 'v-1' as ProductVariantId }),
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
      productId: 'p-1',
      productVariantId: 'v-1',
      productName: 'Áo thun cotton',
      productSlug: 'ao-thun-cotton',
      variantColorName: 'Trắng',
      variantSizeLabel: 'L',
    });
  });

  it('reports unresolvable catalog labels as missing rather than inventing them', () => {
    const subject = projectSubject(
      row({ productId: 'p-1' as ProductId, productVariantId: 'v-1' as ProductVariantId }),
      undefined,
      undefined,
    );

    expect(subject).toEqual({
      kind: 'CATALOG',
      productId: 'p-1',
      productVariantId: 'v-1',
      productName: undefined,
      productSlug: undefined,
      variantColorName: undefined,
      variantSizeLabel: undefined,
    });
  });

  it('describes a customer-owned request from its TBL-038 child', () => {
    expect(projectSubject(row(), undefined, COP)).toEqual({
      kind: 'CUSTOMER_OWNED',
      name: 'Áo khoác jean',
      description: 'Thêu ở lưng.',
      physicalWidthMm: '250.00',
      physicalHeightMm: '300.00',
    });
  });

  it('never carries the other branch: a catalog subject wins and drops the COP row', () => {
    // Both present is refused at submission (`APP5-G01` §3) and so cannot be
    // read back. If a row ever did carry both, the projection still emits ONE
    // subject rather than a hybrid — the union has nowhere to put the second.
    const subject = projectSubject(
      row({ productId: 'p-1' as ProductId, productVariantId: 'v-1' as ProductVariantId }),
      undefined,
      COP,
    );

    expect(subject?.kind).toBe('CATALOG');
    expect(JSON.stringify(subject)).not.toContain('Áo khoác jean');
  });

  it('reports no subject rather than throwing when the row satisfies neither branch', () => {
    expect(projectSubject(row(), undefined, undefined)).toBeUndefined();
  });
});

describe('selectCustomerVisibleReason', () => {
  it.each(REASON_BEARING_STATUSES)('exposes the transition text on %s', (status) => {
    expect(
      selectCustomerVisibleReason({
        status,
        cancelledCustomerReason: undefined,
        transitionCustomerVisibleReason: 'Xưởng sẽ liên hệ với bạn.',
      }),
    ).toBe('Xưởng sẽ liên hệ với bạn.');
  });

  it.each(ALL_STATES.filter((state) => !REASON_BEARING_STATUSES.includes(state)))(
    'exposes nothing on %s, even when a row carries text',
    (status) => {
      expect(
        selectCustomerVisibleReason({
          status,
          cancelledCustomerReason: 'internal-looking text',
          transitionCustomerVisibleReason: 'other text',
        }),
      ).toBeUndefined();
    },
  );

  it('prefers the request row COL-TBL037-09 value on CANCELLED', () => {
    expect(
      selectCustomerVisibleReason({
        status: 'CANCELLED',
        cancelledCustomerReason: 'Bạn đã yêu cầu huỷ.',
        transitionCustomerVisibleReason: 'older transition text',
      }),
    ).toBe('Bạn đã yêu cầu huỷ.');
  });

  it('falls back to the transition text on CANCELLED when the row carries none', () => {
    expect(
      selectCustomerVisibleReason({
        status: 'CANCELLED',
        cancelledCustomerReason: undefined,
        transitionCustomerVisibleReason: 'Huỷ theo đề nghị của khách.',
      }),
    ).toBe('Huỷ theo đề nghị của khách.');
  });

  it('returns nothing when a reason-bearing status has no customer-facing text', () => {
    expect(
      selectCustomerVisibleReason({
        status: 'REJECTED',
        cancelledCustomerReason: undefined,
        transitionCustomerVisibleReason: undefined,
      }),
    ).toBeUndefined();
  });
});
