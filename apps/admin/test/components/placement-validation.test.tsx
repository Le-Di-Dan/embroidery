/**
 * Local geometry feedback, and the save it guards.
 *
 * The server stays the authority — these cases only assert that an obvious
 * mistake is visible *before* a round trip, and that the screen refuses to send
 * a draft it already knows is invalid. The two geometric rules mirror
 * `@embroidery/design-engine`, so the boundary cases matter: an area flush with
 * the canvas edge is legal, one pixel past it is not.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminProductDetail,
  adminProductPlacementGet,
  adminProductPlacementReplace,
} from '@embroidery/api-client';

import { ProductPlacementScreen } from '../../src/features/product-placement';
import { PLACEMENT_COPY } from '../../src/features/product-placement/model/placement-copy';
import {
  areaWithinCanvas,
  scaleAgrees,
} from '../../src/features/product-placement/model/placement-validation';
import {
  emptyAreaDraft,
  emptySideDraft,
} from '../../src/features/product-placement/model/placement-draft';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';
import {
  makePlacement,
  placementEnvelope,
  setViewportWidth,
  PLACEMENT_PRODUCT_ID,
} from '../support/placement-fixture';

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
const replaceMock = adminProductPlacementReplace as jest.MockedFunction<
  typeof adminProductPlacementReplace
>;
const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  setViewportWidth(1440);
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
  getMock.mockResolvedValue(placementEnvelope(makePlacement()));
});

describe('containment rule', () => {
  const side = (patch: Partial<ReturnType<typeof emptySideDraft>> = {}) => ({
    ...emptySideDraft(),
    imageWidthPx: '2000',
    imageHeightPx: '1500',
    ...patch,
  });
  const area = (patch: Partial<ReturnType<typeof emptyAreaDraft>>) => ({
    ...emptyAreaDraft(),
    boundXPx: '0',
    boundYPx: '0',
    boundWidthPx: '100',
    boundHeightPx: '100',
    ...patch,
  });

  it('accepts an area flush with the canvas edge', () => {
    // Boundary-inclusive: the last usable column of pixels must stay reachable.
    expect(areaWithinCanvas(side(), area({ boundXPx: '1900', boundWidthPx: '100' }))).toBe(true);
  });

  it('rejects an area one pixel past the edge', () => {
    expect(areaWithinCanvas(side(), area({ boundXPx: '1901', boundWidthPx: '100' }))).toBe(false);
  });

  it('stays silent while a value is incomplete', () => {
    // The empty field already has its own error; a containment error on top
    // would report the same mistake twice.
    expect(areaWithinCanvas(side(), area({ boundWidthPx: '' }))).toBe(true);
  });
});

describe('scale rule', () => {
  const consistent = {
    ...emptySideDraft(),
    imageWidthPx: '2000',
    imageHeightPx: '1500',
    physicalWidthMm: '200',
    physicalHeightMm: '150',
    pxPerMm: '10',
  };

  it('accepts a side whose axes both imply the recorded scale', () => {
    expect(scaleAgrees(consistent)).toBe(true);
  });

  it('rejects a side whose two axes imply different scales', () => {
    expect(scaleAgrees({ ...consistent, physicalHeightMm: '300' })).toBe(false);
  });

  it('compares on the quantization grid rather than by exact float equality', () => {
    // 1000 / 3 is 333.333… — equal on the locked 1/10 000 grid.
    expect(
      scaleAgrees({
        ...consistent,
        imageWidthPx: '1000',
        physicalWidthMm: '3',
        imageHeightPx: '1500',
        physicalHeightMm: '4.5',
        pxPerMm: '333.3333',
      }),
    ).toBe(true);
  });
});

describe('field feedback', () => {
  it('flags an out-of-bounds width at the field and on the preview', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await user.click(await screen.findByText('Ngực trái'));

    const width = screen.getByTestId('placement-bound-width');
    await user.clear(width);
    await user.type(width, '99999');

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.validation.outsideCanvas)).toBeInTheDocument();
    });
    expect(width).toHaveAttribute('aria-invalid', 'true');
    // The rectangle is still drawn and marked, not hidden.
    expect(screen.getByText(PLACEMENT_COPY.preview.outsideCanvas)).toBeInTheDocument();
  });

  it('flags a scale that does not agree with both axes', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await user.click(await screen.findByText('Mặt trước'));

    const scale = screen.getByTestId('placement-px-per-mm');
    await user.clear(scale);
    await user.type(scale, '7');

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.validation.scaleMismatch)).toBeInTheDocument();
    });
  });

  it('keeps exactly what the operator typed rather than clamping it', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await user.click(await screen.findByText('Ngực trái'));

    const width = screen.getByTestId('placement-bound-width');
    await user.clear(width);
    await user.type(width, '99999');

    // Not silently reduced to the canvas width — the value shown is the value
    // that would be sent, and it is refused instead.
    expect(width).toHaveValue('99999');
  });
});

describe('save guard', () => {
  it('blocks the save while the draft is knowingly invalid, and says why', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await user.click(await screen.findByText('Ngực trái'));

    const width = screen.getByTestId('placement-bound-width');
    await user.clear(width);
    await user.type(width, '99999');

    await waitFor(() => {
      expect(screen.getByTestId('placement-save')).toBeDisabled();
    });
    // A disabled control with no explanation is indistinguishable from a broken one.
    expect(screen.getByText(/Không thể lưu vì còn giá trị chưa hợp lệ/)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('re-enables the save once the value is corrected', async () => {
    renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
    await user.click(await screen.findByText('Ngực trái'));

    const width = screen.getByTestId('placement-bound-width');
    await user.clear(width);
    await user.type(width, '99999');
    await waitFor(() => {
      expect(screen.getByTestId('placement-save')).toBeDisabled();
    });

    await user.clear(width);
    await user.type(width, '500');

    await waitFor(() => {
      expect(screen.getByTestId('placement-save')).toBeEnabled();
    });
  });
});
