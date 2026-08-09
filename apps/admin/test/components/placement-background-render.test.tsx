/**
 * Rendering the authorized Side background in the placement preview
 * (`APP3-A01-C1`).
 *
 * Three properties carry the weight here, and none is visible in a screenshot:
 *
 *  - **the previous Side's image is never shown under the new Side's areas.**
 *    The query is keyed by `productId + sideId` and carries no
 *    `placeholderData`, so a switch has no data to fall back to — asserted by
 *    switching and checking the `href` rather than by trusting the key;
 *  - **every object URL is revoked.** A leaked handle pins protected media in
 *    memory for the life of the tab, and nothing in the DOM would ever show it;
 *  - **an unsaved background replacement is not represented by the bytes of the
 *    background it replaces.** The server still serves the old association, so
 *    drawing it would tell the operator the change had already been applied.
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
  adminProductPlacementReplace,
  adminProductSideBackgroundGet,
} from '@embroidery/api-client';

import { ProductPlacementScreen } from '../../src/features/product-placement';
import { PLACEMENT_COPY } from '../../src/features/product-placement/model/placement-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';
import {
  assetEnvelope,
  makeAssetPage,
  makeBackgroundAsset,
  makePlacement,
  makeSide,
  makeArea,
  placementEnvelope,
  setViewportWidth,
  PLACEMENT_PRODUCT_ID,
  SIDE_FRONT_ID,
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
  adminProductSideBackgroundGet: jest.fn(),
  adminProductDetail: jest.fn(),
  adminAssetList: jest.fn(),
}));

const getMock = adminProductPlacementGet as jest.MockedFunction<typeof adminProductPlacementGet>;
const replaceMock = adminProductPlacementReplace as jest.MockedFunction<
  typeof adminProductPlacementReplace
>;
const backgroundMock = adminProductSideBackgroundGet as jest.MockedFunction<
  typeof adminProductSideBackgroundGet
>;
const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const assetMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;

const FRONT_BYTES = 'FRONT-BACKGROUND';
const BACK_BYTES = 'BACK-BACKGROUND';

/** An Asset other than the one the fixture Side already carries. */
const REPLACEMENT_ASSET = makeBackgroundAsset({
  assetId: '01920000-0000-7000-8000-0000000000cf',
});

let created: string[];
let revoked: string[];
let user: ReturnType<typeof createUser>;

/**
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`, so they are
 * installed here — and recording them is also how the revocation assertions are
 * made at all. The url encodes a counter so a stale handle is distinguishable
 * from a fresh one.
 */
function installObjectUrl(): void {
  created = [];
  revoked = [];
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:placement/${String(created.length)}/${String(blob.size)}`;
      created.push(url);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: (url: string) => {
      revoked.push(url);
    },
  });
}

const blobOf = (text: string) => new Blob([text], { type: 'image/webp' });

/** Two live Sides, each with its own persisted background association. */
function twoSidedPlacement() {
  return makePlacement({
    sides: [
      makeSide({ id: SIDE_FRONT_ID, code: 'front', name: 'Mặt trước', areas: [makeArea()] }),
      makeSide({
        id: SIDE_BACK_ID,
        code: 'back',
        name: 'Mặt sau',
        displayOrder: 1,
        backgroundAssetId: '01920000-0000-7000-8000-0000000000c2',
        areas: [makeArea({ id: '01920000-0000-7000-8000-0000000000b9', code: 'back-centre' })],
      }),
    ],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  installObjectUrl();
  setViewportWidth(1440);
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
  getMock.mockResolvedValue(placementEnvelope(twoSidedPlacement()));
  assetMock.mockResolvedValue(assetEnvelope(makeAssetPage([makeBackgroundAsset()])));
  backgroundMock.mockImplementation((_productId: unknown, sideId: unknown) =>
    Promise.resolve(blobOf(sideId === SIDE_BACK_ID ? BACK_BYTES : FRONT_BYTES) as never),
  );
});

function render() {
  return renderWithProviders(<ProductPlacementScreen productId={PLACEMENT_PRODUCT_ID} />);
}

const backgroundImage = () => screen.queryByTestId('placement-preview-background');

describe('the generated operation is the only source', () => {
  it('is exported from the curated client boundary', () => {
    const actual = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');

    expect(typeof actual['adminProductSideBackgroundGet']).toBe('function');
  });

  it('requests the selected Side with the Product and Side ids', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));

    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });
    const [productId, sideId] = backgroundMock.mock.calls[0] as unknown as [string, string];
    expect(productId).toBe(PLACEMENT_PRODUCT_ID);
    expect(sideId).toBe(SIDE_FRONT_ID);
  });

  it('fetches nothing until a Side is selected', async () => {
    render();
    await screen.findByRole('region', { name: PLACEMENT_COPY.hierarchy.title });

    expect(backgroundMock).not.toHaveBeenCalled();
  });
});

describe('SVG composition', () => {
  it('renders the background as an image inside the Side pixel coordinate space', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));

    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });
    const image = backgroundImage() as unknown as SVGImageElement;
    expect(image.tagName.toLowerCase()).toBe('image');
    // The authored canvas, not the decoded intrinsic size.
    expect(image.getAttribute('x')).toBe('0');
    expect(image.getAttribute('y')).toBe('0');
    expect(image.getAttribute('width')).toBe('2000');
    expect(image.getAttribute('height')).toBe('1500');
    // `meet`, so a derivative whose intrinsic ratio differs letterboxes rather
    // than distorting — a distorted background is one an operator would trust.
    expect(image.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('paints the background beneath the area rectangles', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });

    const canvas = screen.getByTestId('placement-preview-canvas');
    const children = [...canvas.children].map((child) => child.tagName.toLowerCase());
    // SVG has no z-index; document order is the stacking.
    expect(children[0]).toBe('image');
    expect(children).toContain('g');
  });

  it('keeps the area geometry in SVG attributes, not CSS', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });

    const rect = screen.getByTestId('placement-preview-canvas').querySelector('rect');
    expect(rect?.getAttribute('x')).toBe('100');
    expect(rect?.getAttribute('width')).toBe('400');
    expect(rect?.getAttribute('style')).toBeNull();
  });

  it('does not make the artwork focusable', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });

    expect(backgroundImage()).toHaveAttribute('aria-hidden', 'true');
    expect(backgroundImage()).not.toHaveAttribute('tabindex');
  });
});

describe('object URL lifecycle', () => {
  it('turns the Blob into an object URL', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));

    await waitFor(() => {
      expect(created).toHaveLength(1);
    });
    expect(backgroundImage()).toHaveAttribute('href', created[0]);
  });

  it('revokes the previous handle when the Side changes', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(created).toHaveLength(1);
    });
    const first = created[0] as string;

    await user.click(screen.getByText('Mặt sau'));

    await waitFor(() => {
      expect(revoked).toContain(first);
    });
  });

  it('never presents the previous Side image as the new Side background', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });
    const front = backgroundImage()?.getAttribute('href');

    await user.click(screen.getByText('Mặt sau'));

    // The moment the Side changes the old handle is gone. It may reappear only
    // as the *new* Side's own bytes, never as a leftover.
    await waitFor(() => {
      expect(backgroundImage()?.getAttribute('href') ?? null).not.toBe(front);
    });
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(2);
    });
    const [, sideId] = backgroundMock.mock.calls[1] as unknown as [string, string];
    expect(sideId).toBe(SIDE_BACK_ID);
  });

  it('revokes on unmount', async () => {
    const { unmount } = render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(created).toHaveLength(1);
    });

    unmount();

    expect(revoked).toContain(created[0]);
  });
});

describe('failure states', () => {
  it('shows a bounded unavailable state for a 404 and offers no retry', async () => {
    backgroundMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'ADMIN_SIDE_BACKGROUND_NOT_FOUND' }),
    );

    render();
    await user.click(await screen.findByText('Mặt trước'));

    expect(
      await screen.findByText(PLACEMENT_COPY.preview.backgroundUnavailable),
    ).toBeInTheDocument();
    // Retrying cannot resolve a background the server will not serve here.
    expect(screen.queryByTestId('placement-background-retry')).toBeNull();
    expect(backgroundImage()).toBeNull();
  });

  it('offers a retry for a 503', async () => {
    backgroundMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'ADMIN_SIDE_BACKGROUND_UNAVAILABLE' }),
    );

    render();
    await user.click(await screen.findByText('Mặt trước'));

    expect(await screen.findByText(PLACEMENT_COPY.preview.backgroundFailed)).toBeInTheDocument();
    expect(screen.getByTestId('placement-background-retry')).toBeInTheDocument();
  });

  it('offers a retry for a transport failure', async () => {
    backgroundMock.mockRejectedValue(makeNetworkError());

    render();
    await user.click(await screen.findByText('Mặt trước'));

    expect(await screen.findByText(PLACEMENT_COPY.preview.backgroundFailed)).toBeInTheDocument();
  });

  it('preserves the placement draft when the background fails', async () => {
    backgroundMock.mockRejectedValue(makeNetworkError());

    render();
    await user.click(await screen.findByText('Mặt trước'));
    await screen.findByText(PLACEMENT_COPY.preview.backgroundFailed);

    const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
    await user.clear(name);
    await user.type(name, 'Mặt trước (đã sửa)');

    // A picture that failed to load must not cost the operator their edits, and
    // must not disable the hierarchy either.
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue('Mặt trước (đã sửa)');
    expect(screen.getByText('Mặt sau').closest('button')).toBeEnabled();
  });

  it('renders no storage detail in any failure state', async () => {
    backgroundMock.mockRejectedValue(
      makeApiClientError({
        status: 503,
        code: 'ADMIN_SIDE_BACKGROUND_UNAVAILABLE',
        message: 'bucket DERIVATIVES key development/derivatives/abc/NORMALIZED.webp failed',
      }),
    );

    render();
    await user.click(await screen.findByText('Mặt trước'));
    await screen.findByText(PLACEMENT_COPY.preview.backgroundFailed);

    for (const forbidden of ['DERIVATIVES', 'derivatives/', 'NORMALIZED', 'bucket', 'minio']) {
      expect(document.body.textContent).not.toContain(forbidden);
    }
  });
});

describe('unsaved background replacement', () => {
  it('does not present the persisted image as the newly chosen Asset', async () => {
    // The picker must offer an Asset *other* than the one already persisted for
    // this Side, or confirming changes nothing and there is no pending state.
    assetMock.mockResolvedValue(assetEnvelope(makeAssetPage([REPLACEMENT_ASSET])));

    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundImage()).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('placement-choose-background'));
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('radio'));
    await user.click(screen.getByTestId('placement-background-confirm'));

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.preview.backgroundPending)).toBeInTheDocument();
    });
    // The old bytes are gone rather than standing in for the new choice.
    expect(backgroundImage()).toBeNull();
    expect(revoked.length).toBeGreaterThan(0);
  });

  it('never reaches a generic Asset delivery route for the pending choice', async () => {
    assetMock.mockResolvedValue(assetEnvelope(makeAssetPage([REPLACEMENT_ASSET])));

    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByTestId('placement-choose-background'));
    await waitFor(() => {
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('radio'));
    await user.click(screen.getByTestId('placement-background-confirm'));

    // No second background request at all: there is no asset-keyed address to
    // ask, and inventing one is the bypass this checkpoint forbids.
    await waitFor(() => {
      expect(screen.getByTestId('placement-save')).toBeEnabled();
    });
    expect(backgroundMock).toHaveBeenCalledTimes(1);
  });
});

describe('save success', () => {
  it('refreshes only the Side whose background association changed', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });

    const replaced = twoSidedPlacement();
    replaceMock.mockResolvedValue(
      placementEnvelope({
        ...replaced,
        updatedAt: '2026-08-01T11:00:00.000Z',
        sides: [
          { ...replaced.sides[0], backgroundAssetId: '01920000-0000-7000-8000-0000000000cf' },
          replaced.sides[1],
        ],
      } as never),
    );

    const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
    await user.clear(name);
    await user.type(name, 'Mặt trước v2');
    await user.click(screen.getByTestId('placement-save'));

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.save.saved)).toBeInTheDocument();
    });
    // The front Side's association moved, so its bytes are re-authorized. The
    // back Side's did not, and must not be refetched.
    await waitFor(() => {
      expect(backgroundMock.mock.calls.length).toBeGreaterThan(1);
    });
    const requestedSides = backgroundMock.mock.calls.map((call) => call[1]);
    expect(requestedSides).not.toContain(SIDE_BACK_ID);
  });

  it('introduces no second placement read', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });
    const readsBefore = getMock.mock.calls.length;

    replaceMock.mockResolvedValue(
      placementEnvelope({ ...twoSidedPlacement(), updatedAt: '2026-08-01T11:00:00.000Z' }),
    );
    const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
    await user.clear(name);
    await user.type(name, 'Mặt trước v2');
    await user.click(screen.getByTestId('placement-save'));

    await waitFor(() => {
      expect(screen.getByText(PLACEMENT_COPY.save.saved)).toBeInTheDocument();
    });
    expect(getMock.mock.calls.length).toBe(readsBefore);
  });
});

describe('conflict', () => {
  it('keeps the local draft and does not re-authorize a background for it', async () => {
    render();
    await user.click(await screen.findByText('Mặt trước'));
    await waitFor(() => {
      expect(backgroundMock).toHaveBeenCalledTimes(1);
    });

    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PLACEMENT_VERSION_CONFLICT' }),
    );
    const name = screen.getByLabelText(PLACEMENT_COPY.fields.name);
    await user.clear(name);
    await user.type(name, 'Mặt trước v2');
    await user.click(screen.getByTestId('placement-save'));

    await screen.findByRole('alertdialog');
    // Nothing about the server's newest geometry has been adopted, so the
    // background must not be refetched as though it had.
    expect(backgroundMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(PLACEMENT_COPY.fields.name)).toHaveValue('Mặt trước v2');
  });
});

describe('mobile', () => {
  it('fetches no background for an editor that is not mounted', async () => {
    setViewportWidth(390);

    render();

    expect(await screen.findByTestId('placement-mobile-notice')).toBeInTheDocument();
    expect(backgroundMock).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});

describe('retired Side', () => {
  it('stays non-editable', async () => {
    getMock.mockResolvedValue(placementEnvelope(makePlacement()));

    render();

    const retired = await screen.findByText('Tay áo (cũ)');
    expect(retired.closest('button')).toBeDisabled();
  });
});
