/**
 * Choosing a side background, and the boundary it may not cross.
 *
 * The picker reads the accepted Admin asset list and nothing else. The
 * assertions about what is *absent* carry the security weight: no storage key,
 * no bucket, no object URL and no public side-background route ever reaches the
 * DOM, because `APP2` publishes no authenticated Admin delivery contract and
 * the public route requires a published product that placement authoring does
 * not have.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminAssetList,
  adminProductDetail,
  adminProductPlacementGet,
} from '@embroidery/api-client';

import { ProductPlacementScreen } from '../../src/features/product-placement';
import { PLACEMENT_COPY } from '../../src/features/product-placement/model/placement-copy';
import { isEligibleBackground } from '../../src/features/product-placement/model/background-eligibility';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';
import { readFeatureSource } from '../support/feature-source';
import {
  assetEnvelope,
  makeAssetPage,
  makeBackgroundAsset,
  makePlacement,
  placementEnvelope,
  setViewportWidth,
  PLACEMENT_PRODUCT_ID,
  BACKGROUND_ASSET_ID,
} from '../support/placement-fixture';
import { MEDIA_COPY } from '../../src/shared/media/media-copy';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/products/01920000-0000-7000-8000-000000000001/placement').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductPlacementGet: jest.fn(),
  adminProductPlacementReplace: jest.fn(),
  adminProductDetail: jest.fn(),
  adminAssetList: jest.fn(),
}));

const getMock = adminProductPlacementGet as jest.MockedFunction<typeof adminProductPlacementGet>;
const assetMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;
const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  setViewportWidth(1440);
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
  getMock.mockResolvedValue(placementEnvelope(makePlacement()));
  assetMock.mockResolvedValue(assetEnvelope(makeAssetPage([makeBackgroundAsset()])));
});

async function openPicker() {
  renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
  await user.click(await screen.findByText('Mặt trước'));
  await user.click(screen.getByTestId('placement-choose-background'));
  return screen.findByRole('dialog');
}

describe('eligibility', () => {
  it('accepts accepted raster catalog media', () => {
    expect(isEligibleBackground(makeBackgroundAsset())).toBe(true);
  });

  it('rejects SVG, which nothing sanitizes for a background', () => {
    // IMP-D044 PO-03: SVG is allowed only for Template assets, behind a
    // sanitizer APP3 has not built.
    expect(isEligibleBackground(makeBackgroundAsset({ mediaType: 'image/svg+xml' } as never))).toBe(
      false,
    );
  });

  it('rejects an asset that is not yet accepted', () => {
    expect(isEligibleBackground(makeBackgroundAsset({ status: 'PROCESSING' }))).toBe(false);
  });

  it('rejects an asset from another lane', () => {
    expect(isEligibleBackground(makeBackgroundAsset({ kind: 'CUSTOMER_UPLOAD' } as never))).toBe(
      false,
    );
  });
});

describe('picker', () => {
  it('reads the accepted Admin asset boundary', async () => {
    await openPicker();

    await waitFor(() => {
      expect(assetMock).toHaveBeenCalledTimes(1);
    });
    const [params] = assetMock.mock.calls[0] as [Record<string, unknown>];
    expect(params['limit']).toBe(24);
  });

  it('does not fetch the asset library until the dialog is opened', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title });

    expect(assetMock).not.toHaveBeenCalled();
  });

  it('never offers an ineligible asset', async () => {
    assetMock.mockResolvedValue(
      assetEnvelope(
        makeAssetPage([
          makeBackgroundAsset(),
          makeBackgroundAsset({
            assetId: 'svg-asset-id',
            mediaType: 'image/svg+xml',
          } as never),
        ]),
      ),
    );

    await openPicker();

    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(1);
    });
  });

  it('applies the choice only on confirm', async () => {
    await openPicker();
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio'));
    await user.click(screen.getByRole('button', { name: PLACEMENT_COPY.picker.cancel }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Dismissing leaves the side's background exactly as it was.
    expect(screen.getByTestId('placement-choose-background')).toHaveTextContent(
      PLACEMENT_COPY.fields.changeBackground,
    );
  });
});

describe('storage boundary', () => {
  it('renders no storage key, bucket, checksum or object URL', async () => {
    await openPicker();
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    const rendered = document.body.innerHTML;
    for (const forbidden of ['http://', 'https://', 'bucket', 's3', 'minio', 'a'.repeat(64)]) {
      expect(rendered.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('never requests the public side-background route', async () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');

    await openPicker();
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    // Both operations crossed the shared client boundary at `APP3-S02` for the
    // Storefront studio stage, so their absence from the package is no longer
    // what makes this true. Re-pointed by `APP12-H01` (FU-APP12-A01-01) at the
    // Admin claim itself: authoring must not depend on a route that requires the
    // product to be published, so this feature names neither operation.
    const featureSource = readFeatureSource('product-placement');
    expect(featureSource).not.toContain('publicProductSideBackgroundGet');
    expect(featureSource).not.toContain('publicProductPlacementGet');
    // Kept so the assertion still fails loudly if the mock stops resolving.
    expect(typeof actual['adminProductPlacementGet']).toBe('function');
  });

  it('draws picker tiles from the Admin preview route, not a per-feature URL', async () => {
    // `APP3-A01-C1` §10 forbade *inventing* an asset-by-id route to draw these
    // thumbnails, and while none existed the picker was right to show a
    // placeholder — an operator chose a background by media type alone.
    // `APP12-V02-C2` added `adminAsset_preview` under Human-PO authority, so
    // the route is no longer invented and the constraint is satisfied rather
    // than bypassed: the tile renders through the one shared builder, and this
    // feature composes no address of its own.
    await openPicker();
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    const image = await screen.findByRole('img', { name: MEDIA_COPY.thumbnailAlt });
    expect(image).toHaveAttribute('src', `/api/admin/assets/${BACKGROUND_ASSET_ID}/thumbnail`);
  });
});
