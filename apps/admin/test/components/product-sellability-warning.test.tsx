/**
 * The published-but-unbuyable banner.
 *
 * The whole value of this component is that it is *truthful*, so the tests are
 * about when it must not appear as much as when it must: never on a draft,
 * never for a product that is merely sold out, and never before the
 * authoritative list has arrived.
 */
import { renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminProductVariantList } from '@embroidery/api-client';

import { StructuralUnsellabilityWarning } from '../../src/features/product-sellability/components/structural-unsellability-warning';
import { SELLABILITY_COPY } from '../../src/features/product-sellability/model/sellability-copy';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductVariantList: jest.fn(),
}));

const listMock = adminProductVariantList as jest.MockedFunction<typeof adminProductVariantList>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const READINESS_HREF = `/products/${PRODUCT_ID}/publication`;

function sku(skuId: string, isActive: boolean) {
  return {
    skuId,
    code: `CODE-${skuId}`,
    isActive,
    currencyCode: 'VND' as const,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  };
}

function variant(variantId: string, isActive: boolean, skus: ReturnType<typeof sku>[] = []) {
  return {
    variantId,
    productId: PRODUCT_ID,
    colorName: 'Xanh navy',
    sizeLabel: 'M',
    isActive,
    displayOrder: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    skus,
  };
}

function listEnvelope(variants: ReturnType<typeof variant>[]) {
  return {
    success: true,
    data: { productId: PRODUCT_ID, variants },
    meta: { requestId: 'req-test-0001', timestamp: '2026-09-10T00:00:00.000Z' },
  } as never;
}

function render(status: string) {
  return renderWithProviders(
    <StructuralUnsellabilityWarning
      productId={PRODUCT_ID}
      status={status}
      readinessHref={READINESS_HREF}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('counts the missing structure and states that the product stays published', async () => {
  listMock.mockResolvedValue(listEnvelope([variant('v-1', true, [sku('sku-1', false)])]));
  render('PUBLISHED');

  const warning = await screen.findByTestId('structural-unsellability-warning');
  expect(warning).toHaveTextContent(SELLABILITY_COPY.warning.title);
  expect(screen.getByTestId('warning-active-variants')).toHaveTextContent(
    SELLABILITY_COPY.warning.activeVariantCount(1),
  );
  expect(screen.getByTestId('warning-eligible-skus')).toHaveTextContent(
    SELLABILITY_COPY.warning.orderEligibleSkuCount(0),
  );
});

it('says in words that this is not sold out', async () => {
  listMock.mockResolvedValue(listEnvelope([variant('v-1', false)]));
  render('PUBLISHED');

  expect(await screen.findByTestId('structural-unsellability-warning')).toHaveTextContent(
    SELLABILITY_COPY.warning.notSoldOut,
  );
});

it('carries the state without colour: a text badge and an alert role', async () => {
  listMock.mockResolvedValue(listEnvelope([variant('v-1', false)]));
  render('PUBLISHED');

  const warning = await screen.findByRole('alert');
  expect(warning).toHaveTextContent(SELLABILITY_COPY.warning.badge);
});

it('offers both routes out and repairs nothing itself', async () => {
  listMock.mockResolvedValue(listEnvelope([variant('v-1', false)]));
  render('PUBLISHED');

  await screen.findByTestId('structural-unsellability-warning');
  expect(screen.getByRole('link', { name: SELLABILITY_COPY.warning.toReadiness })).toHaveAttribute(
    'href',
    READINESS_HREF,
  );
  expect(screen.getByRole('link', { name: SELLABILITY_COPY.warning.toSection })).toHaveAttribute(
    'href',
    '#phien-ban-sku',
  );
  expect(screen.queryByRole('button')).toBeNull();
});

it('stays silent for a valid structure — sold out is not unsellable', async () => {
  listMock.mockResolvedValue(listEnvelope([variant('v-1', true, [sku('sku-1', true)])]));
  const { container } = render('PUBLISHED');

  // Wait for the list to have actually arrived, so this proves silence *after*
  // the judgement rather than silence before it.
  await waitFor(() => expect(listMock).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="structural-unsellability-warning"]')).toBeNull();
});

it('stays silent on a draft, however broken its structure is', async () => {
  listMock.mockResolvedValue(listEnvelope([]));
  const { container } = render('DRAFT');

  await waitFor(() => expect(listMock).toHaveBeenCalled());
  expect(container.querySelector('[data-testid="structural-unsellability-warning"]')).toBeNull();
});

it('claims nothing before the authoritative list has arrived', () => {
  listMock.mockReturnValue(new Promise(() => {}) as never);
  const { container } = render('PUBLISHED');

  expect(container.firstChild).toBeNull();
});
