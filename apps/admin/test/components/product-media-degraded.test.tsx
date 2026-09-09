/**
 * The degraded-media signal on the Admin product media editor
 * (`APP12-M01.E1-C1`, Blocker 1).
 *
 * `APP12-M01.E1` proved the defect live: with the stored primary's Asset
 * `REJECTED`, the Admin read returned `status: "REJECTED"` and the media grid
 * rendered a perfectly healthy tile, because the grid was handed asset ids only
 * and passed a literal `state="READY"` to every thumbnail. Every public surface
 * had meanwhile moved to the effective fallback, so the operator could not
 * discover that their stored primary was no longer usable.
 *
 * These are the boundary the fix restores, in one place:
 *
 * ```text
 * the read's status survives into the tile
 * a rejected primary is still the primary, and also says it is rejected
 * the approved Vietnamese caption is used, never a raw enum
 * the picture is still requested — §8 keeps `adminAsset_preview` as it is
 * an accepted Asset carries no treatment at all
 * recovery removes the treatment on the next read
 * the write body is still an ordered `mediaAssetIds[]`
 * ```
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductUpdate } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { MEDIA_COPY } from '../../src/shared/media/media-copy';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
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

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

/** Every backend code that must never reach an operator's screen. */
const RAW_STATUSES = ['REJECTED', 'ACCEPTED', 'UPLOADED', 'INSPECTING'] as const;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

/**
 * Renders a three-image DRAFT whose *primary* carries `status`.
 *
 * The primary specifically, because that is the association every public
 * surface follows and therefore the one whose degradation is invisible on the
 * page while being decisive off it.
 */
async function renderWithPrimaryStatus(status: string) {
  const media = [makeProductMedia(0, { status }), makeProductMedia(1), makeProductMedia(2)];
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

test('a rejected stored primary says so, and is still the primary', async () => {
  await renderWithPrimaryStatus('REJECTED');

  const primary = at(0);

  // The truthful state, in the approved Vietnamese and visible — not only as
  // the accessible name of a placeholder a sighted operator has to interpret.
  expect(within(primary).getByText(MEDIA_COPY.rejected)).toBeVisible();

  // And still the stored primary. Both facts at once is the whole point: this
  // is the state where the public pages have moved to a fallback while the
  // stored designation has not changed at all.
  expect(within(primary).queryAllByText(PRODUCT_MEDIA_COPY.tile.rolePrimary)).toHaveLength(2);

  // No raw enum anywhere on the screen.
  for (const raw of RAW_STATUSES) {
    expect(screen.queryByText(raw)).toBeNull();
  }

  // The other two images are untouched — a degraded primary does not make the
  // whole set look broken.
  expect(within(at(1)).queryByText(MEDIA_COPY.rejected)).toBeNull();
  expect(within(at(2)).queryByText(MEDIA_COPY.rejected)).toBeNull();
});

test('a rejected Asset keeps its picture — the preview route is not the fix', async () => {
  await renderWithPrimaryStatus('REJECTED');

  // `APP12-M01.E1` proved `adminAsset_preview` serves derivative bytes whatever
  // the Asset's lifecycle state, and §8 requires that to stay true. The operator
  // finds images by their photograph, so the tile still asks for one and says
  // what is wrong beside it rather than instead of it.
  const image = within(at(0)).getByRole('img', { name: MEDIA_COPY.thumbnailAlt });
  expect(image).toBeVisible();
  expect(image.getAttribute('src')).toContain('/thumbnail');
});

test('an accepted primary carries no degraded treatment at all', async () => {
  await renderWithPrimaryStatus('ACCEPTED');

  expect(screen.queryByText(MEDIA_COPY.rejected)).toBeNull();
  expect(screen.queryByText(MEDIA_COPY.processing)).toBeNull();
  expect(screen.queryByText(MEDIA_COPY.absent)).toBeNull();
  expect(within(at(0)).queryAllByText(PRODUCT_MEDIA_COPY.tile.rolePrimary)).toHaveLength(2);
});

test('an Asset still being inspected says that instead, and shows no picture', async () => {
  await renderWithPrimaryStatus('INSPECTING');

  // A different state, a different word — the mapping is not a boolean.
  expect(within(at(0)).getByText(MEDIA_COPY.processing)).toBeVisible();
  expect(within(at(0)).queryByText(MEDIA_COPY.rejected)).toBeNull();

  // And no image is promised: an Asset mid-inspection has no derivative yet, so
  // requesting one would only produce a broken tile.
  expect(within(at(0)).queryByRole('img', { name: MEDIA_COPY.thumbnailAlt })).toBeNull();
  expect(within(at(0)).getByRole('img', { name: MEDIA_COPY.processing })).toBeVisible();
});

test('a status this screen does not know promises no image and invents no words', async () => {
  await renderWithPrimaryStatus('SOME_FUTURE_STATE');

  expect(within(at(0)).getByText(MEDIA_COPY.absent)).toBeVisible();
  expect(screen.queryByText('SOME_FUTURE_STATE')).toBeNull();
});

test('recovery to ACCEPTED clears the treatment on the next read', async () => {
  const { unmount } = await renderWithPrimaryStatus('REJECTED');
  expect(screen.getByText(MEDIA_COPY.rejected)).toBeVisible();

  // A fresh read of a recovered Asset. Unmounted and re-rendered rather than
  // mutated in place, because the requirement is about what the *server* says
  // on the next read — not about a local flag this screen could have cleared.
  unmount();
  jest.clearAllMocks();
  await renderWithPrimaryStatus('ACCEPTED');

  expect(screen.queryByText(MEDIA_COPY.rejected)).toBeNull();
  expect(within(at(0)).queryAllByText(PRODUCT_MEDIA_COPY.tile.rolePrimary)).toHaveLength(2);
});

test('the write body is still an ordered mediaAssetIds[] with no status in it', async () => {
  updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
  await renderWithPrimaryStatus('REJECTED');

  // The ids the fixture actually seeded, in seeded order.
  const [a, b, c] = [0, 1, 2].map((position) => makeProductMedia(position).assetId);

  // A real change, because the save control only exists once the form is dirty —
  // and a reorder is the sharpest version of this assertion: the body must carry
  // the operator's new order, and must still carry nothing else.
  await user.click(
    within(at(2)).getByRole('button', {
      name: PRODUCT_MEDIA_COPY.actions.moveEarlierLabel({ position: 3, total: 3 }),
    }),
  );

  await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
  await waitFor(() => {
    expect(updateMock).toHaveBeenCalled();
  });

  const body = (updateMock.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
  // Status is a read-only fact and never travels in operator write intent.
  expect(JSON.stringify(body)).not.toContain('REJECTED');
  // [A,B,C] with C moved earlier is [A,C,B] — the ids, in the operator's order.
  expect(body['mediaAssetIds']).toEqual([a, c, b]);
});
