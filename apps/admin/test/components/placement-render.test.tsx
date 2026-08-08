/**
 * What the placement screen shows, and for which state.
 *
 * The load states are asserted from the query alone, and the hierarchy
 * assertions are about *structure* rather than text: that an area is nested
 * under its side, and that a retired row is still on screen. Retirement
 * visibility is the one that matters most — `IMP-D041` PO-07 keeps a retired
 * row forever precisely so the operator can see why its code is unavailable,
 * and a screen that hid it would look correct while destroying that.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductPlacementGet } from '@embroidery/api-client';

import { ProductPlacementScreen } from '../../src/features/product-placement';
import { PLACEMENT_COPY } from '../../src/features/product-placement/model/placement-copy';
import { makeApiClientError } from '../support/api-error';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';
import {
  makePlacement,
  makeSide,
  makeArea,
  placementEnvelope,
  setViewportWidth,
  PLACEMENT_PRODUCT_ID,
  SIDE_BACK_ID,
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
const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  setViewportWidth(1440);
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
});

function render() {
  return renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
}

describe('load states', () => {
  it('renders the loading state while the placement read is in flight', () => {
    getMock.mockReturnValue(new Promise(() => undefined) as never);

    render();

    expect(screen.getByText(PLACEMENT_COPY.states.loading)).toBeInTheDocument();
  });

  it('renders a retryable failure when the read fails', async () => {
    getMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL' }));

    render();

    expect(await screen.findByText(PLACEMENT_COPY.states.unavailableTitle)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PLACEMENT_COPY.states.retry })).toBeInTheDocument();
  });

  it('distinguishes a missing product from a generic failure', async () => {
    getMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'PLACEMENT_PRODUCT_NOT_FOUND' }),
    );

    render();

    expect(await screen.findByText(PLACEMENT_COPY.states.notFoundTitle)).toBeInTheDocument();
    // A dead link is not worth retrying; the only offered action is to leave.
    expect(screen.queryByRole('button', { name: PLACEMENT_COPY.states.retry })).toBeNull();
    expect(
      screen.getByRole('link', { name: PLACEMENT_COPY.states.backToList }),
    ).toBeInTheDocument();
  });
});

describe('hierarchy', () => {
  it('nests each area inside its own side, in canonical backend order', async () => {
    getMock.mockResolvedValue(
      placementEnvelope(
        makePlacement({
          sides: [
            makeSide({
              id: SIDE_BACK_ID,
              code: 'back',
              name: 'Mặt sau',
              displayOrder: 1,
              areas: [makeArea({ code: 'back-centre', name: 'Giữa lưng' })],
            }),
            makeSide(),
          ],
        }),
      ),
    );

    render();

    const tree = await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title });
    const sides = within(tree).getAllByRole('button', { name: /Mặt/ });
    // displayOrder 0 before displayOrder 1, whatever order the array arrived in.
    expect(sides[0]).toHaveTextContent('Mặt trước');
    expect(sides[1]).toHaveTextContent('Mặt sau');

    // The area is inside the side's own list item, not a sibling of it.
    const frontItem = sides[0]?.closest('li');
    expect(within(frontItem as HTMLElement).getByText('Ngực trái')).toBeInTheDocument();
  });

  it('keeps a retired area visible and badged rather than hiding it', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    expect(await screen.findByText('Tay áo (cũ)')).toBeInTheDocument();
    expect(screen.getAllByText(PLACEMENT_COPY.hierarchy.retiredBadge).length).toBeGreaterThan(0);
  });

  it('does not offer a retired row for editing', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    const retired = await screen.findByText('Tay áo (cũ)');
    expect(retired.closest('button')).toBeDisabled();
  });
});

describe('selection', () => {
  it('drives the preview and the side inspector from the selected side', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    await user.click(await screen.findByText('Mặt trước'));

    expect(screen.getByTestId('placement-side-inspector')).toBeInTheDocument();
    // The canvas is sized from the authored model, not from a percentage.
    const canvas = screen.getByTestId('placement-preview-canvas');
    expect(canvas).toHaveAttribute('aria-label', PLACEMENT_COPY.preview.canvasLabel(2000, 1500));
  });

  it('drives the bounds inspector from the selected area', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    await user.click(await screen.findByText('Ngực trái'));

    const inspector = screen.getByTestId('placement-area-inspector');
    expect(within(inspector).getByLabelText(PLACEMENT_COPY.fields.boundWidthPx)).toHaveValue('400');
    expect(within(inspector).getByLabelText(PLACEMENT_COPY.fields.boundXPx)).toHaveValue('100');
  });
});

describe('responsive composition', () => {
  it('renders all three regions at 1440', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    expect(
      await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: PLACEMENT_COPY.preview.title })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: PLACEMENT_COPY.inspector.title }),
    ).toBeInTheDocument();
  });

  it('keeps all three regions simultaneously visible at 1280', async () => {
    setViewportWidth(1280);
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    // The 618:74 ruling: the panels narrow, nothing collapses to a drawer and
    // nothing is dropped from the composition.
    expect(
      await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: PLACEMENT_COPY.preview.title })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: PLACEMENT_COPY.inspector.title }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('placement-mobile-notice')).toBeNull();
  });

  it('replaces the editor with the read-only notice at mobile width', async () => {
    setViewportWidth(390);
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    expect(await screen.findByTestId('placement-mobile-notice')).toBeInTheDocument();
    expect(screen.getByText(PLACEMENT_COPY.mobile.title)).toBeInTheDocument();

    // Replaced, not hidden: no numeric field survives in the tab order, and no
    // save control is reachable.
    expect(screen.queryByTestId('placement-save')).toBeNull();
    expect(screen.queryByLabelText(PLACEMENT_COPY.fields.boundWidthPx)).toBeNull();
    expect(screen.queryByRole('region', { name: PLACEMENT_COPY.inspector.title })).toBeNull();

    // The structure stays readable, retirement included.
    expect(screen.getByText('Ngực trái')).toBeInTheDocument();
    expect(screen.getByText('Tay áo (cũ)')).toBeInTheDocument();
  });
});

describe('scope', () => {
  it('offers no template, publication or search control', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /mẫu thiết kế/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /xuất bản/i })).toBeNull();
    // Retirement is never described as deletion.
    expect(screen.queryByRole('button', { name: /^xoá/i })).toBeNull();
  });

  it('labels every hierarchy control for assistive technology', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    const side = await screen.findByText('Mặt trước');
    const button = side.closest('button') as HTMLElement;
    await user.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-current', 'true');
    });

    // Every field in the inspector is reachable by its visible label.
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.code)).toBeInTheDocument();
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.pxPerMm)).toBeInTheDocument();
  });
});
