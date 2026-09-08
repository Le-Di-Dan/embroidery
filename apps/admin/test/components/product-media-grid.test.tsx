/**
 * The Admin product media grid on a DRAFT product (`APP12-M01.A1`).
 *
 * The subject is the grid `APP12-M01.D1` approved in place of the one-row-per-
 * image list: capacity, primary state, the anchor rule, reordering, removal and
 * what each of those announces. The picker has its own file, and the PUBLISHED
 * media-only write has a third.
 *
 * Everything here is staged. The assertion that matters most is not any single
 * interaction but that twenty of them still produce exactly one request.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminProductDetail,
  adminProductMediaReplace,
  adminProductUpdate,
} from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { MEDIA_COPY } from '../../src/shared/media/media-copy';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { MAX_PRODUCT_MEDIA_ITEMS } from '../../src/features/products/model/product-media-capacity';
import { PRODUCT_MEDIA_COPY } from '../../src/features/products/model/product-media-copy';
import {
  makeProductDetail,
  makeProductMedia,
  productDetailEnvelope,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductUpdate: jest.fn(),
  adminProductMediaReplace: jest.fn(),
  adminAssetList: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;
const replaceMock = adminProductMediaReplace as jest.MockedFunction<
  typeof adminProductMediaReplace
>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

async function renderWithMedia(count: number) {
  const media = Array.from({ length: count }, (_, index) => makeProductMedia(index));
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ media })));
  const result = renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
  await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
  return result;
}

function tiles() {
  return within(
    screen.getByRole('list', { name: PRODUCT_MEDIA_COPY.header.gridLabel }),
  ).getAllByRole('listitem');
}

function at(index: number) {
  return tiles()[index] as HTMLElement;
}

/** The desktop in-tile control, addressed by its position-carrying name. */
function tileAction(index: number, name: string) {
  return within(at(index)).getByRole('button', { name });
}

const place = (position: number, total: number) => ({ position, total });

/**
 * The primary is signalled twice on purpose — a badge on the image and a label
 * beneath it — so neither signal is colour alone. A single-match query would
 * therefore fail on the tile that is *most* correct.
 */
function primarySignals(index: number) {
  return within(at(index)).queryAllByText(PRODUCT_MEDIA_COPY.tile.rolePrimary);
}

async function save() {
  await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
  await waitFor(() => expect(updateMock).toHaveBeenCalled());
  return (updateMock.mock.calls[0] as unknown as [string, { mediaAssetIds: string[] }])[1];
}

describe('grid presentation', () => {
  it('renders one tile per image, in server order, as a grid and not a row list', async () => {
    await renderWithMedia(8);

    expect(tiles()).toHaveLength(8);
    // The old presentation is gone: no per-row metadata caption survives.
    expect(screen.queryByText('Ảnh PNG')).not.toBeInTheDocument();
  });

  it('marks position 1 primary and every other tile gallery', async () => {
    await renderWithMedia(3);

    expect(primarySignals(0)).toHaveLength(2);
    for (const index of [1, 2]) {
      expect(within(at(index)).getByText(PRODUCT_MEDIA_COPY.tile.roleGallery)).toBeInTheDocument();
      expect(primarySignals(index)).toHaveLength(0);
    }
  });

  it('shows the count against the contract cap', async () => {
    await renderWithMedia(8);

    expect(screen.getByText(PRODUCT_MEDIA_COPY.header.capacity(8))).toBeInTheDocument();
    expect(screen.getByText(`8/${String(MAX_PRODUCT_MEDIA_ITEMS)}`)).toBeInTheDocument();
  });

  it('renders each image from the Admin preview route, never a UUID', async () => {
    await renderWithMedia(2);
    const image = at(0).querySelector('img');

    expect(image).toHaveAttribute('alt', MEDIA_COPY.thumbnailAlt);
    expect(image?.getAttribute('src')).toMatch(/^\/api\/admin\/assets\/[0-9a-f-]+\/thumbnail$/);
    // The operator-facing text names positions, not identifiers.
    expect(at(0).textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('shows the approved empty copy and no grid when nothing is selected', async () => {
    await renderWithMedia(0);

    expect(screen.getByText(PRODUCT_MEDIA_COPY.header.empty)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: PRODUCT_MEDIA_COPY.header.gridLabel }),
    ).not.toBeInTheDocument();
  });
});

describe('capacity', () => {
  it('blocks adding at the cap and explains why', async () => {
    await renderWithMedia(MAX_PRODUCT_MEDIA_ITEMS);

    expect(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add })).toBeDisabled();
    expect(screen.getByText(PRODUCT_MEDIA_COPY.header.capacityFull)).toBeInTheDocument();
  });

  it('keeps every image operable at the cap', async () => {
    await renderWithMedia(MAX_PRODUCT_MEDIA_ITEMS);

    expect(tiles()).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
    const last = MAX_PRODUCT_MEDIA_ITEMS - 1;
    expect(
      tileAction(last, PRODUCT_MEDIA_COPY.actions.removeLabel(place(last + 1, 20))),
    ).toBeEnabled();
    expect(
      tileAction(last, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(last + 1, 20))),
    ).toBeEnabled();
  });

  it('leaves the add control live below the cap', async () => {
    await renderWithMedia(MAX_PRODUCT_MEDIA_ITEMS - 1);

    expect(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add })).toBeEnabled();
    expect(screen.queryByText(PRODUCT_MEDIA_COPY.header.capacityFull)).not.toBeInTheDocument();
  });
});

describe('set-primary', () => {
  it('offers no set-primary action on the image that already is one', async () => {
    await renderWithMedia(3);

    expect(
      within(at(0)).queryByRole('button', {
        name: PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(1, 3)),
      }),
    ).not.toBeInTheDocument();
  });

  it('moves the chosen image to the front and preserves the rest of the order', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(4);

    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 4))));

    // [A,B,C,D] with C promoted is [C,A,B,D].
    expect(primarySignals(0)).toHaveLength(2);
    const body = await save();
    expect(body.mediaAssetIds).toEqual(
      [2, 0, 1, 3].map((index) => makeProductMedia(index).assetId),
    );
  });

  it('announces the promotion politely', async () => {
    await renderWithMedia(3);
    await user.click(tileAction(1, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(2, 3))));

    const status = screen
      .getAllByRole('status')
      .find((node) => node.textContent === PRODUCT_MEDIA_COPY.announce.primarySet(2));
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('the primary anchor', () => {
  it('disables both arrows on the primary rather than silently demoting it', async () => {
    await renderWithMedia(4);

    expect(tileAction(0, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(1, 4)))).toBeDisabled();
    expect(tileAction(0, PRODUCT_MEDIA_COPY.actions.moveLaterLabel(place(1, 4)))).toBeDisabled();
  });

  it('refuses to move position 2 into the primary slot', async () => {
    await renderWithMedia(4);

    expect(tileAction(1, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(2, 4)))).toBeDisabled();
    expect(tileAction(1, PRODUCT_MEDIA_COPY.actions.moveLaterLabel(place(2, 4)))).toBeEnabled();
  });

  it('disables move-later on the last tile', async () => {
    await renderWithMedia(3);

    expect(tileAction(2, PRODUCT_MEDIA_COPY.actions.moveLaterLabel(place(3, 3)))).toBeDisabled();
  });
});

describe('reordering', () => {
  it('reorders the gallery by button alone, with no pointer drag involved', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(3);

    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(3, 3))));

    const body = await save();
    expect(body.mediaAssetIds).toEqual([0, 2, 1].map((index) => makeProductMedia(index).assetId));
  });

  it('announces the new position, not merely that something moved', async () => {
    await renderWithMedia(3);
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(3, 3))));

    expect(
      screen
        .getAllByRole('status')
        .some((node) => node.textContent === PRODUCT_MEDIA_COPY.announce.reordered(place(2, 3))),
    ).toBe(true);
  });

  it('issues no request per action — twenty of them still make one save', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(4);

    await user.click(tileAction(3, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(4, 4))));
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(3, 4))));
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 4))));
    expect(updateMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();

    await save();
    expect(updateMock).toHaveBeenCalledTimes(1);
    // A DRAFT saves through the atomic product update, never through B2's
    // media-only authority (`APP12-M01.A1` §3).
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('removal on a draft', () => {
  it('removes a non-primary image without confirming', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(3);

    await user.click(tileAction(1, PRODUCT_MEDIA_COPY.actions.removeLabel(place(2, 3))));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const body = await save();
    expect(body.mediaAssetIds).toEqual([0, 2].map((index) => makeProductMedia(index).assetId));
  });

  it('confirms before removing the primary, and promotes position 2', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(3);

    await user.click(tileAction(0, PRODUCT_MEDIA_COPY.actions.removeLabel(place(1, 3))));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(PRODUCT_MEDIA_COPY.removePrimary.title);

    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.removePrimary.confirm }),
    );

    const body = await save();
    expect(body.mediaAssetIds).toEqual([1, 2].map((index) => makeProductMedia(index).assetId));
  });

  it('keeps the primary when the confirmation is declined', async () => {
    await renderWithMedia(3);

    await user.click(tileAction(0, PRODUCT_MEDIA_COPY.actions.removeLabel(place(1, 3))));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.removePrimary.cancel }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(tiles()).toHaveLength(3);
  });

  it('lets a draft be emptied entirely', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(1);

    await user.click(tileAction(0, PRODUCT_MEDIA_COPY.actions.removeLabel(place(1, 1))));

    // A sole image is not a primary whose removal promotes anything, so there
    // is nothing to confirm.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const body = await save();
    expect(body.mediaAssetIds).toEqual([]);
  });

  it('announces what is left after a removal', async () => {
    await renderWithMedia(3);
    await user.click(tileAction(1, PRODUCT_MEDIA_COPY.actions.removeLabel(place(2, 3))));

    expect(
      screen
        .getAllByRole('status')
        .some((node) => node.textContent === PRODUCT_MEDIA_COPY.announce.removed(2)),
    ).toBe(true);
  });
});

describe('the mobile selected-image action bar', () => {
  it('appears only once a tile is selected, and names the image it acts on', async () => {
    await renderWithMedia(6);
    expect(
      screen.queryByRole('group', { name: PRODUCT_MEDIA_COPY.actions.barLabel(place(4, 6)) }),
    ).not.toBeInTheDocument();

    await user.click(
      within(at(3)).getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.select(place(4, 6)) }),
    );

    const bar = screen.getByRole('group', {
      name: PRODUCT_MEDIA_COPY.actions.barLabel(place(4, 6)),
    });
    // Four controls for one image, rather than four on each of six tiles.
    expect(within(bar).getAllByRole('button')).toHaveLength(5); // four actions + dismiss
    expect(within(bar).getByText(PRODUCT_MEDIA_COPY.actions.setPrimaryShort)).toBeInTheDocument();
  });

  it('exposes selection with aria-pressed, not colour alone', async () => {
    await renderWithMedia(3);
    const select = within(at(1)).getByRole('button', {
      name: PRODUCT_MEDIA_COPY.tile.select(place(2, 3)),
    });

    expect(select).toHaveAttribute('aria-pressed', 'false');
    await user.click(select);
    expect(
      within(at(1)).getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.select(place(2, 3)) }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('carries the anchor rule as a sentence on the primary', async () => {
    await renderWithMedia(3);
    await user.click(
      within(at(0)).getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.select(place(1, 3)) }),
    );

    const bar = screen.getByRole('group', {
      name: PRODUCT_MEDIA_COPY.actions.barLabel(place(1, 3)),
    });
    expect(within(bar).getByText(PRODUCT_MEDIA_COPY.actions.primaryAnchorNote)).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', {
        name: PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(1, 3)),
      }),
    ).toBeDisabled();
  });

  it('acts on the selected image and follows it after a reorder', async () => {
    await renderWithMedia(4);
    await user.click(
      within(at(2)).getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.select(place(3, 4)) }),
    );

    const bar = screen.getByRole('group', {
      name: PRODUCT_MEDIA_COPY.actions.barLabel(place(3, 4)),
    });
    await user.click(
      within(bar).getByRole('button', {
        name: PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(3, 4)),
      }),
    );

    expect(
      screen.getByRole('group', { name: PRODUCT_MEDIA_COPY.actions.barLabel(place(2, 4)) }),
    ).toBeInTheDocument();
  });

  it('closes on the dismiss control', async () => {
    await renderWithMedia(3);
    await user.click(
      within(at(1)).getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.select(place(2, 3)) }),
    );

    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.tile.deselect }));

    expect(
      screen.queryByRole('group', { name: PRODUCT_MEDIA_COPY.actions.barLabel(place(2, 3)) }),
    ).not.toBeInTheDocument();
  });
});
