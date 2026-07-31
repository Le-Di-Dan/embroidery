/**
 * Ordered media selection and the asset picker dialog.
 *
 * The asset list is mocked at `adminAsset_list`, so the cursor values under
 * test are exactly what the generated operation receives — which is what makes
 * the same-cursor retry assertion meaningful.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminAssetList, adminProductDetail, adminProductUpdate } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
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
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;
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

function mediaRows() {
  return within(screen.getByRole('list', { name: PRODUCT_FORM_COPY.media.listLabel })).getAllByRole(
    'listitem',
  );
}

async function openPicker() {
  await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.media.pick }));
  return screen.findByRole('dialog');
}

describe('selected media presentation', () => {
  it('labels the first image as the thumbnail and the rest as gallery', async () => {
    await renderWithMedia(3);
    const rows = mediaRows();

    expect(
      within(rows[0] as HTMLElement).getByText(PRODUCT_FORM_COPY.media.roleThumbnail),
    ).toBeInTheDocument();
    for (const row of rows.slice(1)) {
      expect(within(row).getByText(PRODUCT_FORM_COPY.media.roleGallery)).toBeInTheDocument();
    }
  });

  it('uses the server identity and never a filename', async () => {
    await renderWithMedia(1);
    const row = mediaRows()[0] as HTMLElement;

    expect(within(row).getByText('Ảnh PNG')).toBeInTheDocument();
    expect(row.textContent).toMatch(/2,4 MB · \d{2}\/\d{2}\/2026/);
    expect(row.textContent).not.toMatch(/\.(png|jpe?g|webp)\b/i);
  });

  it('states that no preview exists rather than rendering a broken image', async () => {
    await renderWithMedia(1);
    const row = mediaRows()[0] as HTMLElement;

    expect(within(row).getByText(PRODUCT_FORM_COPY.identity.placeholder)).toBeInTheDocument();
    expect(row.querySelector('img')).toBeNull();
  });

  it('shows the approved empty copy when nothing is selected', async () => {
    await renderWithMedia(0);

    expect(screen.getByText(PRODUCT_FORM_COPY.media.empty)).toBeInTheDocument();
  });
});

describe('keyboard reordering', () => {
  it('disables the move controls at each end', async () => {
    await renderWithMedia(3);
    const rows = mediaRows();

    expect(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.moveEarlier),
      }),
    ).toBeDisabled();
    expect(
      within(rows[2] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.moveLater),
      }),
    ).toBeDisabled();
  });

  it('reorders by button alone, with no pointer drag involved', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(2);

    await user.click(
      within(mediaRows()[1] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.moveEarlier),
      }),
    );
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const body = (updateMock.mock.calls[0] as [string, { mediaAssetIds: string[] }])[1];
    expect(body.mediaAssetIds).toEqual([makeProductMedia(1).assetId, makeProductMedia(0).assetId]);
  });

  it('announces the reorder politely', async () => {
    await renderWithMedia(2);
    await user.click(
      within(mediaRows()[1] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.moveEarlier),
      }),
    );

    const status = screen
      .getAllByRole('status')
      .find((node) => node.textContent === PRODUCT_FORM_COPY.media.reordered);
    expect(status).toBeDefined();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('promotes the new first image to thumbnail after a move', async () => {
    await renderWithMedia(2);
    await user.click(
      within(mediaRows()[1] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.moveEarlier),
      }),
    );

    expect(
      within(mediaRows()[0] as HTMLElement).getByText(PRODUCT_FORM_COPY.media.roleThumbnail),
    ).toBeInTheDocument();
  });
});

describe('removal', () => {
  it('unlinks the image without calling any asset operation', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(2);

    await user.click(
      within(mediaRows()[0] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.remove),
      }),
    );
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const body = (updateMock.mock.calls[0] as [string, { mediaAssetIds: string[] }])[1];
    expect(body.mediaAssetIds).toEqual([makeProductMedia(1).assetId]);
    expect(assetsMock).not.toHaveBeenCalled();
  });

  it('can empty the selection entirely', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderWithMedia(1);

    await user.click(
      within(mediaRows()[0] as HTMLElement).getByRole('button', {
        name: new RegExp(PRODUCT_FORM_COPY.media.remove),
      }),
    );
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const body = (updateMock.mock.calls[0] as [string, { mediaAssetIds: string[] }])[1];
    expect(body.mediaAssetIds).toEqual([]);
  });
});

describe('asset picker', () => {
  it('is a modal dialog with focus trapped and a described body', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(PRODUCT_FORM_COPY.picker.title);
    await waitFor(() => expect(dialog).toHaveAttribute('aria-describedby'));
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const trigger = screen.getByRole('button', { name: PRODUCT_FORM_COPY.media.pick });
    await openPicker();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

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
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('appends the next cursor page and preserves the loaded rows', async () => {
    assetsMock.mockResolvedValueOnce(
      assetEnvelope(makePage([makeAsset({ assetId: 'a-1' })], 'cursor-2')),
    );
    assetsMock.mockResolvedValueOnce(assetEnvelope(makePage([makeAsset({ assetId: 'a-2' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore });
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore }),
    );

    await waitFor(() => expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2));
    expect(assetsMock.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cursor-2' });
  });

  it('hides the continuation control when the collection is exhausted', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByText('Ảnh PNG');
    expect(
      within(dialog).queryByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore }),
    ).not.toBeInTheDocument();
  });

  it('retries a failed continuation with the identical cursor', async () => {
    assetsMock.mockResolvedValueOnce(
      assetEnvelope(makePage([makeAsset({ assetId: 'a-1' })], 'cursor-2')),
    );
    assetsMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));
    assetsMock.mockResolvedValueOnce(assetEnvelope(makePage([makeAsset({ assetId: 'a-2' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await within(dialog).findByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore });
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore }),
    );

    // The already-loaded tile survives the failure.
    await within(dialog).findByText(PRODUCT_FORM_COPY.picker.loadMoreFailed);
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.retry }));
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

    await within(dialog).findByRole('button', { name: PRODUCT_FORM_COPY.picker.loadMore });
    expect(dialog.textContent).not.toMatch(/trang \d/i);
    expect(dialog.textContent).not.toMatch(/\/\s*\d+\s*(mục|ảnh|kết quả)/i);
    expect(assetsMock).toHaveBeenCalledTimes(1);
  });

  it('adds the chosen images to the product on confirm', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'picked' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.confirm }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mediaRows()).toHaveLength(1);
  });

  it('discards a staged selection when dismissed', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ assetId: 'picked' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(PRODUCT_FORM_COPY.media.empty)).toBeInTheDocument();
  });

  it('shows the approved empty state when no asset is selectable', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset({ status: 'INSPECTING' })])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      await within(dialog).findByText(PRODUCT_FORM_COPY.picker.emptyTitle),
    ).toBeInTheDocument();
  });

  it('surfaces a first-page failure safely and retries', async () => {
    assetsMock.mockRejectedValueOnce(
      makeApiClientError({ status: 500, code: 'INTERNAL', message: 'bucket unreachable' }),
    );
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);
    const dialog = await openPicker();

    expect(
      await within(dialog).findByText(PRODUCT_FORM_COPY.picker.unavailableTitle),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('bucket unreachable');

    await user.click(within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.picker.retry }));
    await within(dialog).findByText('Ảnh PNG');
  });

  it('does not fetch the asset library until it is opened', async () => {
    assetsMock.mockResolvedValue(assetEnvelope(makePage([makeAsset()])));
    await renderWithMedia(0);

    expect(assetsMock).not.toHaveBeenCalled();
  });
});
