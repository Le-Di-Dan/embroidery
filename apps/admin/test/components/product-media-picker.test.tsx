/**
 * The Admin product asset picker, and the capacity `APP12-M01.A1` added to it.
 *
 * The asset list is mocked at `adminAsset_list`, so the cursor values under
 * test are exactly what the generated operation receives — which is what makes
 * the same-cursor retry assertion meaningful.
 *
 * The picker is where `PRODUCT_MEDIA_DUPLICATE` and the over-capacity refusal
 * stop being reachable from the happy path. Both are still mapped for a race
 * (`product-published-media.test.tsx`), but a single operator working one tab
 * must not be able to compose a request the server would refuse whole.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminAssetList, adminProductDetail } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { MAX_PRODUCT_MEDIA_ITEMS } from '../../src/features/products/model/product-media-capacity';
import { PRODUCT_MEDIA_COPY } from '../../src/features/products/model/product-media-copy';
import { makeApiClientError } from '../support/api-error';
import { makeAsset, makePage } from '../support/asset-fixture';
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
  adminAssetList: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const assetsMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

function assetEnvelope(page: ReturnType<typeof makePage>) {
  return {
    success: true,
    code: 'ASSET_LIST_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-1', timestamp: '2026-07-31T00:00:00.000Z' },
  } as never;
}

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

async function openPicker() {
  await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add }));
  return screen.findByRole('dialog');
}

function gridTiles() {
  return within(
    screen.getByRole('list', { name: PRODUCT_MEDIA_COPY.header.gridLabel }),
  ).getAllByRole('listitem');
}

describe('dialog behaviour', () => {
  it('is a modal dialog with focus trapped and a described body', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(PRODUCT_MEDIA_COPY.picker.title);
    await waitFor(() => expect(dialog).toHaveAttribute('aria-describedby'));
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const trigger = screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add });
    await openPicker();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('does not fetch the asset library until it is opened', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);

    expect(assetsMock).not.toHaveBeenCalled();
  });
});

describe('eligibility and disclosure', () => {
  it('offers only accepted catalog media', async () => {
    assetsMock.mockResolvedValue(
      assetEnvelope(
        makePage([
          makeAsset({ assetId: 'ok-1' }),
          makeAsset({ assetId: 'busy', status: 'INSPECTING' }),
          makeAsset({ assetId: 'bad', status: 'REJECTED' }),
        ]),
      ),
    );
    await renderWithMedia(0);
    const dialog = await openPicker();

    await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1));
  });

  it('never renders a filename, checksum or classification', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByText('Ảnh PNG');
    expect(dialog.textContent).not.toMatch(/[0-9a-f]{64}/i);
    expect(dialog.textContent).not.toContain('PRODUCTION_SENSITIVE');
    expect(dialog.textContent).not.toContain('CATALOG_MEDIA');

    const src = dialog.querySelector('img')?.getAttribute('src') ?? '';
    expect(src).toMatch(/^\/api\/admin\/assets\/[0-9a-f-]+\/thumbnail$/);
    expect(src).not.toMatch(/[0-9a-f]{64}|PRODUCTION_SENSITIVE|CATALOG_MEDIA|minio|X-Amz-/i);
  });
});

describe('capacity', () => {
  it('states the remaining capacity, and updates it as options are chosen', async () => {
    assetsMock.mockResolvedValue(
      assetEnvelope(makePage([makeAsset({ assetId: 'free-1' }), makeAsset({ assetId: 'free-2' })])),
    );
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      within(dialog).getByText(PRODUCT_MEDIA_COPY.picker.remaining(MAX_PRODUCT_MEDIA_ITEMS)),
    ).toBeInTheDocument();

    await user.click((await within(dialog).findAllByRole('checkbox'))[0] as HTMLElement);

    expect(
      within(dialog).getByText(
        PRODUCT_MEDIA_COPY.picker.footerCount(1, MAX_PRODUCT_MEDIA_ITEMS - 1),
      ),
    ).toBeInTheDocument();
  });

  it('badges an already-added asset and offers no checkbox for it', async () => {
    const attached = makeProductMedia(0);
    assetsMock.mockResolvedValue(
      assetEnvelope(
        makePage([makeAsset({ assetId: attached.assetId }), makeAsset({ assetId: 'free-1' })]),
      ),
    );
    await renderWithMedia(1);
    const dialog = await openPicker();

    await within(dialog).findByText(PRODUCT_MEDIA_COPY.picker.alreadyAdded);
    // One option, one checkbox: the duplicate cannot be chosen a second time,
    // so `PRODUCT_MEDIA_DUPLICATE` is unreachable from a single session.
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
  });

  it('blocks every unattached option and the confirm button at the cap', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'free-1' })])));
    await renderWithMedia(MAX_PRODUCT_MEDIA_ITEMS);

    // The add control itself is disabled at the cap, so the picker is opened
    // through the state it guards rather than by clicking a live button.
    expect(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add })).toBeDisabled();
  });

  it('marks an over-capacity option aria-disabled and refuses to stage it', async () => {
    const attached = Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS - 1 }, (_, index) =>
      makeProductMedia(index),
    );
    assetsMock.mockResolvedValue(
      assetEnvelope(makePage([makeAsset({ assetId: 'free-1' }), makeAsset({ assetId: 'free-2' })])),
    );
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ media: attached })));
    renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
    await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
    const dialog = await openPicker();

    const boxes = await within(dialog).findAllByRole('checkbox');
    await user.click(boxes[0] as HTMLElement);

    // The staged set is now exactly 20; the second option must not be reachable.
    await within(dialog).findByText(PRODUCT_MEDIA_COPY.picker.fullNotice);
    const after = within(dialog).getAllByRole('checkbox');
    expect(after[1]).toHaveAttribute('aria-disabled', 'true');

    await user.click(after[1] as HTMLElement);
    expect(within(dialog).getAllByRole('checkbox')[1]).not.toBeChecked();
  });

  it('still lets the operator uncheck their own choice at the cap', async () => {
    const attached = Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS - 1 }, (_, index) =>
      makeProductMedia(index),
    );
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'free-1' })])));
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ media: attached })));
    renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
    await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
    const dialog = await openPicker();

    const box = (await within(dialog).findAllByRole('checkbox'))[0] as HTMLElement;
    await user.click(box);
    expect(within(dialog).getAllByRole('checkbox')[0]).toBeChecked();

    await user.click(within(dialog).getAllByRole('checkbox')[0] as HTMLElement);
    expect(within(dialog).getAllByRole('checkbox')[0]).not.toBeChecked();
  });
});

describe('continuation', () => {
  it('appends the next cursor page and preserves the loaded rows', async () => {
    assetsMock.mockResolvedValueOnce(
      assetEnvelope(makePage([makeAsset({ assetId: 'a-1' })], 'cursor-2')),
    );
    assetsMock.mockResolvedValueOnce(assetEnvelope(makePage([makeAsset({ assetId: 'a-2' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByRole('button', { name: PRODUCT_MEDIA_COPY.picker.loadMore });
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.loadMore }),
    );

    await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2));
    expect(assetsMock.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cursor-2' });
  });

  it('retries a failed continuation with the identical cursor', async () => {
    assetsMock.mockResolvedValueOnce(
      assetEnvelope(makePage([makeAsset({ assetId: 'a-1' })], 'cursor-2')),
    );
    assetsMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));
    assetsMock.mockResolvedValueOnce(assetEnvelope(makePage([makeAsset({ assetId: 'a-2' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByRole('button', { name: PRODUCT_MEDIA_COPY.picker.loadMore });
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.loadMore }),
    );

    await within(dialog).findByText(PRODUCT_MEDIA_COPY.picker.loadMoreFailed);
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.retry }));
    await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2));

    expect(assetsMock.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cursor-2' });
    expect(assetsMock.mock.calls[2]?.[0]).toMatchObject({ cursor: 'cursor-2' });
  });

  it('implements no infinite scroll, page number or total count', async () => {
    assetsMock.mockResolvedValue(
      assetEnvelope(makePage([makeAsset({ assetId: 'a-1' })], 'cursor-2')),
    );
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByRole('button', { name: PRODUCT_MEDIA_COPY.picker.loadMore });
    expect(dialog.textContent).not.toMatch(/trang \d/i);
    expect(assetsMock).toHaveBeenCalledTimes(1);
  });
});

describe('confirming', () => {
  it('adds the chosen images to the grid on confirm', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'picked' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.confirm(1) }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(gridTiles()).toHaveLength(1);
  });

  it('offers nothing to confirm until something is chosen', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'picked' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.confirm(0) }),
    ).toBeDisabled();
  });

  it('discards a staged selection when dismissed', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'picked' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.cancel }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(PRODUCT_MEDIA_COPY.header.empty)).toBeInTheDocument();
  });

  it('surfaces a first-page failure safely and retries', async () => {
    assetsMock.mockRejectedValueOnce(
      makeApiClientError({ status: 500, code: 'INTERNAL', message: 'bucket unreachable' }),
    );
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      await within(dialog).findByText(PRODUCT_MEDIA_COPY.picker.unavailableTitle),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('bucket unreachable');

    await user.click(within(dialog).getByRole('button', { name: PRODUCT_MEDIA_COPY.picker.retry }));
    await within(dialog).findByText('Ảnh PNG');
  });

  it('shows the approved empty state when no asset is selectable', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ status: 'INSPECTING' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      await within(dialog).findByText(PRODUCT_MEDIA_COPY.picker.emptyTitle),
    ).toBeInTheDocument();
  });
});
