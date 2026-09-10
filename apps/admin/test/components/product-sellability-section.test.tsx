/**
 * `Phiên bản & SKU` — the section's states and its guarded writes.
 *
 * Asserted at the generated-client boundary, so what the section renders and
 * sends is driven by exactly what `adminProductVariant_list`,
 * `adminProductVariant_create/update` and `adminSku_create/update` would return.
 *
 * The assertions that matter most are the ones about what is *absent*: no
 * delete affordance at any state, no automatic deactivation behind an ambiguity
 * refusal, no `isActive` on a definition edit, and no stock operation reached
 * from this screen.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import {
  adminProductVariantCreate,
  adminProductVariantList,
  adminProductVariantUpdate,
  adminSkuCreate,
  adminSkuUpdate,
} from '@embroidery/api-client';

import { ProductSellabilitySection } from '../../src/features/product-sellability/components/product-sellability-section';
import {
  SELLABILITY_COPY,
  SELLABILITY_FAILURE_COPY,
} from '../../src/features/product-sellability/model/sellability-copy';
import { makeApiClientError } from '../support/api-error';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductVariantList: jest.fn(),
  adminProductVariantCreate: jest.fn(),
  adminProductVariantUpdate: jest.fn(),
  adminSkuCreate: jest.fn(),
  adminSkuUpdate: jest.fn(),
}));

const listMock = adminProductVariantList as jest.MockedFunction<typeof adminProductVariantList>;
const createVariantMock = adminProductVariantCreate as jest.MockedFunction<
  typeof adminProductVariantCreate
>;
const updateVariantMock = adminProductVariantUpdate as jest.MockedFunction<
  typeof adminProductVariantUpdate
>;
const createSkuMock = adminSkuCreate as jest.MockedFunction<typeof adminSkuCreate>;
const updateSkuMock = adminSkuUpdate as jest.MockedFunction<typeof adminSkuUpdate>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const BASE_PRICE = '250000';

interface SkuSeed {
  readonly skuId: string;
  readonly code: string;
  readonly isActive: boolean;
  readonly priceOverrideAmount?: string;
}

function sku(seed: SkuSeed) {
  return {
    skuId: seed.skuId,
    code: seed.code,
    isActive: seed.isActive,
    currencyCode: 'VND' as const,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    ...(seed.priceOverrideAmount === undefined
      ? {}
      : { priceOverrideAmount: seed.priceOverrideAmount }),
  };
}

function variant(options: {
  variantId: string;
  colorName?: string | null;
  sizeLabel?: string | null;
  isActive: boolean;
  skus?: readonly SkuSeed[];
}) {
  return {
    variantId: options.variantId,
    productId: PRODUCT_ID,
    colorName: options.colorName ?? null,
    sizeLabel: options.sizeLabel ?? null,
    isActive: options.isActive,
    displayOrder: 1,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    skus: (options.skus ?? []).map(sku),
  };
}

function listEnvelope(variants: ReturnType<typeof variant>[]) {
  return {
    success: true,
    data: { productId: PRODUCT_ID, variants },
    meta: { requestId: 'req-test-0001', timestamp: '2026-09-10T00:00:00.000Z' },
  } as never;
}

function writeEnvelope(data: unknown) {
  return {
    success: true,
    data,
    meta: { requestId: 'req-test-0002', timestamp: '2026-09-10T00:00:00.000Z' },
  } as never;
}

const NAVY_M = variant({
  variantId: 'v-1',
  colorName: 'Xanh navy',
  sizeLabel: 'M',
  isActive: true,
  skus: [
    { skuId: 'sku-0', code: 'AT-OLD', isActive: false },
    { skuId: 'sku-1', code: 'AT-NAVY-M', isActive: true },
  ],
});

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

function render(status = 'DRAFT') {
  return renderWithProviders(
    <ProductSellabilitySection
      productId={PRODUCT_ID}
      status={status}
      basePriceAmount={BASE_PRICE}
      onStructureChanged={jest.fn()}
    />,
  );
}

describe('load states', () => {
  it('uses the Admin authoring read, addressed by product id', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render();

    await screen.findByTestId('variant-v-1');
    expect(listMock).toHaveBeenCalledWith(PRODUCT_ID, expect.anything());
  });

  it('shows the empty state for a product with no variants', async () => {
    listMock.mockResolvedValue(listEnvelope([]));
    render();

    expect(await screen.findByTestId('sellability-empty')).toHaveTextContent(
      SELLABILITY_COPY.section.emptyTitle,
    );
  });

  it('offers a retry when the list fails, and never a raw code', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SELLABILITY_COPY.section.failureTitle);
    expect(alert.textContent).not.toContain('INTERNAL_ERROR');
  });
});

describe('history and progressive disclosure', () => {
  it('keeps inactive variants and inactive SKUs visible', async () => {
    const inactive = variant({ variantId: 'v-2', colorName: 'Đỏ', isActive: false });
    listMock.mockResolvedValue(listEnvelope([NAVY_M, inactive]));
    render();

    expect(await screen.findByTestId('variant-v-2')).toHaveAttribute('data-active', 'false');
    await user.click(screen.getByTestId('variant-disclosure-v-1'));
    expect(screen.getByTestId('sku-sku-0')).toHaveAttribute('data-active', 'false');
  });

  it('states the collapsed variant sellability truth without opening it', async () => {
    const noSku = variant({ variantId: 'v-3', colorName: 'Trắng', isActive: true });
    listMock.mockResolvedValue(listEnvelope([NAVY_M, noSku]));
    render();

    expect(await screen.findByTestId('variant-summary-v-1')).toHaveTextContent('AT-NAVY-M');
    expect(screen.getByTestId('variant-summary-v-3')).toHaveTextContent(
      SELLABILITY_COPY.variant.noOrderEligibleSku,
    );
  });

  it('carries the disclosure state programmatically', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render();

    const toggle = await screen.findByTestId('variant-disclosure-v-1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers no delete affordance anywhere in the section', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    const { container } = render();

    await screen.findByTestId('variant-v-1');
    await user.click(screen.getByTestId('variant-disclosure-v-1'));
    expect(container.querySelector('[data-testid*="delete"]')).toBeNull();
    expect(container.textContent).not.toMatch(/xoá|xóa/i);
  });
});

describe('effective price on the row', () => {
  it('names the source, and marks an override of "0" unusable', async () => {
    const zeroOverride = variant({
      variantId: 'v-4',
      sizeLabel: 'L',
      isActive: true,
      skus: [{ skuId: 'sku-9', code: 'AT-L', isActive: true, priceOverrideAmount: '0' }],
    });
    listMock.mockResolvedValue(listEnvelope([zeroOverride]));
    render();

    await user.click(await screen.findByTestId('variant-disclosure-v-4'));
    const row = screen.getByTestId('sku-sku-9');
    expect(row).toHaveTextContent(SELLABILITY_COPY.sku.overridePrice('0 ₫'));
    expect(row).toHaveTextContent(SELLABILITY_COPY.sku.unresolvablePrice);
  });

  it('shows the inherited product price when there is no override', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render();

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    expect(screen.getByTestId('sku-sku-1')).toHaveTextContent(
      SELLABILITY_COPY.sku.inheritedPrice('250.000 ₫'),
    );
  });
});

describe('stock handoff', () => {
  it('links every SKU to the one canonical stock route, by SKU id', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render();

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    const link = screen.getByTestId('sku-stock-sku-1');
    expect(link).toHaveAttribute('href', '/kho/skus/sku-1');
    // The accessible name names the SKU, so the link is not one of several
    // identical "Quản lý tồn kho" targets in the accessibility tree.
    expect(link).toHaveAccessibleName(SELLABILITY_COPY.sku.manageStockLabel('AT-NAVY-M'));
    // Even an inactive SKU keeps its handoff: stock exists independently of
    // whether the SKU is currently selling.
    expect(screen.getByTestId('sku-stock-sku-0')).toHaveAttribute('href', '/kho/skus/sku-0');
  });
});

describe('variant authoring', () => {
  it('refuses a blank-label variant locally, sending nothing', async () => {
    listMock.mockResolvedValue(listEnvelope([]));
    render();

    await user.click(await screen.findByTestId('sellability-add-variant'));
    await user.click(screen.getByTestId('variant-dialog-submit'));

    expect(createVariantMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(SELLABILITY_COPY.validation.labelRequired).length).toBeGreaterThan(
      0,
    );
  });

  it('maps the duplicate refusal safely and keeps the staged labels', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    createVariantMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_VARIANT_DUPLICATE' }),
    );
    render();

    await user.click(await screen.findByTestId('sellability-add-variant'));
    await user.type(screen.getByTestId('variant-color'), 'Xanh navy');
    await user.click(screen.getByTestId('variant-dialog-submit'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SELLABILITY_FAILURE_COPY.duplicate.title);
    expect(alert.textContent).not.toContain('PRODUCT_VARIANT_DUPLICATE');
    expect(screen.getByTestId('variant-color')).toHaveValue('Xanh navy');
  });

  it('sends labels only on an edit, never resurrecting the offered flag', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    updateVariantMock.mockResolvedValue(writeEnvelope({ ...NAVY_M, skus: [] }));
    render();

    await user.click(await screen.findByTestId('variant-edit-v-1'));
    await user.clear(screen.getByTestId('variant-color'));
    await user.type(screen.getByTestId('variant-color'), 'Xanh than');
    await user.click(screen.getByTestId('variant-dialog-submit'));

    await waitFor(() => expect(updateVariantMock).toHaveBeenCalled());
    const body = updateVariantMock.mock.calls[0]?.[2];
    expect(body).toEqual({ colorName: 'Xanh than', sizeLabel: 'M' });
  });
});

describe('SKU ambiguity', () => {
  it('shows the refusal, names the selling SKU, and deactivates nothing', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    createSkuMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'SKU_ORDER_ELIGIBLE_AMBIGUOUS' }),
    );
    render();

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    await user.click(screen.getByTestId('variant-add-sku-v-1'));
    await user.type(screen.getByTestId('sku-code'), 'AT-NAVY-M-2');
    await user.click(screen.getByTestId('sku-dialog-submit'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AT-NAVY-M');
    expect(alert.textContent).not.toContain('SKU_ORDER_ELIGIBLE_AMBIGUOUS');
    // The existing SKU is untouched and the staged one is not silently committed.
    expect(updateSkuMock).not.toHaveBeenCalled();
    expect(createSkuMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('sku-code')).toHaveValue('AT-NAVY-M-2');
  });

  it('lets the operator take the second path by creating the SKU inactive', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    createSkuMock.mockResolvedValue(writeEnvelope({ skuId: 'sku-2' }));
    render();

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    await user.click(screen.getByTestId('variant-add-sku-v-1'));
    await user.type(screen.getByTestId('sku-code'), 'AT-NAVY-M-2');
    await user.click(screen.getByTestId('sku-active'));
    await user.click(screen.getByTestId('sku-dialog-submit'));

    await waitFor(() => expect(createSkuMock).toHaveBeenCalled());
    expect(createSkuMock.mock.calls[0]?.[2]).toEqual({ code: 'AT-NAVY-M-2', isActive: false });
  });
});

describe('published structural break', () => {
  it('confirms before the last selling SKU stops, and says the product stays published', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render('PUBLISHED');

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    await user.click(screen.getByTestId('sku-toggle-sku-1'));

    const dialog = await screen.findByTestId('structure-break-lastSku');
    expect(dialog).toHaveTextContent(SELLABILITY_COPY.skuDeactivate.remainsPublished);
    expect(dialog).toHaveTextContent(SELLABILITY_COPY.skuDeactivate.notSoldOut);
    expect(screen.getByTestId('structure-arithmetic')).toHaveTextContent(
      SELLABILITY_COPY.skuDeactivate.arithmetic,
    );
    // Nothing is sent until the operator confirms, and the safe answer is there.
    expect(updateSkuMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('structure-break-keep')).toBeInTheDocument();
  });

  it('sends only the sellable flag once confirmed', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    updateSkuMock.mockResolvedValue(writeEnvelope({ skuId: 'sku-1' }));
    render('PUBLISHED');

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    await user.click(screen.getByTestId('sku-toggle-sku-1'));
    await user.click(await screen.findByTestId('structure-break-confirm'));

    await waitFor(() => expect(updateSkuMock).toHaveBeenCalled());
    expect(updateSkuMock.mock.calls[0]?.[1]).toEqual({ isActive: false });
  });

  it('confirms before the last active variant is deactivated', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    render('PUBLISHED');

    await user.click(await screen.findByTestId('variant-toggle-v-1'));

    expect(await screen.findByTestId('structure-break-lastVariant')).toHaveTextContent(
      SELLABILITY_COPY.variantDeactivate.remainsPublished,
    );
    expect(updateVariantMock).not.toHaveBeenCalled();
  });

  it('treats the same change on a draft as an ordinary edit', async () => {
    listMock.mockResolvedValue(listEnvelope([NAVY_M]));
    updateVariantMock.mockResolvedValue(writeEnvelope({ ...NAVY_M, skus: [] }));
    render('DRAFT');

    await user.click(await screen.findByTestId('variant-toggle-v-1'));

    await waitFor(() => expect(updateVariantMock).toHaveBeenCalled());
    expect(screen.queryByTestId('structure-break-lastVariant')).toBeNull();
  });

  it('reactivates without a confirmation — recovery is never gated', async () => {
    const broken = variant({
      variantId: 'v-1',
      colorName: 'Xanh navy',
      isActive: true,
      skus: [{ skuId: 'sku-1', code: 'AT-NAVY-M', isActive: false }],
    });
    listMock.mockResolvedValue(listEnvelope([broken]));
    updateSkuMock.mockResolvedValue(writeEnvelope({ skuId: 'sku-1' }));
    render('PUBLISHED');

    await user.click(await screen.findByTestId('variant-disclosure-v-1'));
    await user.click(screen.getByTestId('sku-toggle-sku-1'));

    await waitFor(() => expect(updateSkuMock).toHaveBeenCalled());
    expect(updateSkuMock.mock.calls[0]?.[1]).toEqual({ isActive: true });
  });
});
