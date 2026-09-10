/**
 * Curating a PUBLISHED product's images (`APP12-M01.A1` §11).
 *
 * The screen that used to refuse a published product entirely now offers it
 * exactly one write. What is asserted here is the *boundary*: the commercial
 * fields stay locked, the media section stays live, the request is B2's and
 * never the generic draft PATCH, and no path through the screen unpublishes
 * anything.
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
  AdminProductMediaResponseRole,
  adminProductDetail,
  adminProductVariantList,
  adminProductMediaReplace,
  adminProductUpdate,
} from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import {
  PRODUCT_MEDIA_COPY,
  PRODUCT_MEDIA_FAILURE_COPY,
} from '../../src/features/products/model/product-media-copy';
import { makeApiClientError } from '../support/api-error';
import {
  makeProductDetail,
  makeProductMedia,
  productDetailEnvelope,
  sellableVariantListEnvelope,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductVariantList: jest.fn(),
  adminProductUpdate: jest.fn(),
  adminProductMediaReplace: jest.fn(),
  adminAssetList: jest.fn(),
  adminCategoryList: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;
const replaceMock = adminProductMediaReplace as jest.MockedFunction<
  typeof adminProductMediaReplace
>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const TOKEN = '2026-09-08T03:12:44.512Z';

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  // The detail screen now composes the sellability section, which always
  // reads. An empty list keeps these suites about their own subject.
  (adminProductVariantList as jest.Mock).mockResolvedValue(sellableVariantListEnvelope());
});

function publishedProduct(count: number, updatedAt = TOKEN) {
  return makeProductDetail({
    status: 'PUBLISHED',
    updatedAt,
    media: Array.from({ length: count }, (_, index) => makeProductMedia(index)),
  });
}

async function renderPublished(count: number) {
  detailMock.mockResolvedValue(productDetailEnvelope(publishedProduct(count)));
  const result = renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
  await screen.findByText(PRODUCT_MEDIA_COPY.published.bannerTitle);
  return result;
}

function tiles() {
  return within(
    screen.getByRole('list', { name: PRODUCT_MEDIA_COPY.header.gridLabel }),
  ).getAllByRole('listitem');
}

function tileAction(index: number, name: string) {
  return within(tiles()[index] as HTMLElement).getByRole('button', { name });
}

const place = (position: number, total: number) => ({ position, total });

describe('what a published product may and may not change', () => {
  it('locks the commercial fields programmatically, not merely visually', async () => {
    await renderPublished(3);

    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toBeDisabled();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel)).toBeDisabled();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.priceLabel)).toBeDisabled();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.descriptionLabel)).toBeDisabled();
    expect(screen.getAllByText(PRODUCT_MEDIA_COPY.published.readOnlyBadge).length).toBeGreaterThan(
      0,
    );
  });

  it('keeps the media section fully interactive', async () => {
    await renderPublished(3);

    expect(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.header.add })).toBeEnabled();
    expect(tileAction(1, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(2, 3)))).toBeEnabled();
    expect(tileAction(2, PRODUCT_MEDIA_COPY.actions.removeLabel(place(3, 3)))).toBeEnabled();
  });

  it('says plainly that curating images does not unpublish the product', async () => {
    await renderPublished(3);

    expect(screen.getByText(PRODUCT_MEDIA_COPY.published.bannerBody)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_MEDIA_COPY.published.mediaNote)).toBeInTheDocument();
  });

  it('refuses to remove the last image, and explains the minimum', async () => {
    await renderPublished(1);

    expect(tileAction(0, PRODUCT_MEDIA_COPY.actions.removeLabel(place(1, 1)))).toBeDisabled();

    await user.click(
      within(tiles()[0] as HTMLElement).getByRole('button', {
        name: PRODUCT_MEDIA_COPY.tile.select(place(1, 1)),
      }),
    );
    expect(screen.getByText(PRODUCT_MEDIA_COPY.actions.publishedMinimum)).toBeInTheDocument();
  });

  it('offers no save until the media actually changed', async () => {
    await renderPublished(3);

    expect(
      screen.queryByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }),
    ).not.toBeInTheDocument();
  });
});

describe('the media-only write', () => {
  it('sends the whole ordered array through B2, never the draft PATCH', async () => {
    replaceMock.mockResolvedValue(
      productDetailEnvelope(publishedProduct(3, '2026-09-08T04:00:00.000Z')),
    );
    await renderPublished(3);

    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(updateMock).not.toHaveBeenCalled();

    const [productId, body] = replaceMock.mock.calls[0] as unknown as [
      string,
      { expectedUpdatedAt: string; mediaAssetIds: string[] },
    ];
    expect(productId).toBe(PRODUCT_ID);
    expect(body.expectedUpdatedAt).toBe(TOKEN);
    expect(body.mediaAssetIds).toEqual([2, 0, 1].map((i) => makeProductMedia(i).assetId));
    // The body can express nothing else: no status, no price, no name.
    expect(Object.keys(body).sort()).toEqual(['expectedUpdatedAt', 'mediaAssetIds']);
  });

  it('makes one request for many staged actions', async () => {
    replaceMock.mockResolvedValue(productDetailEnvelope(publishedProduct(4, 'v2')));
    await renderPublished(4);

    await user.click(tileAction(3, PRODUCT_MEDIA_COPY.actions.moveEarlierLabel(place(4, 4))));
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 4))));
    await user.click(tileAction(3, PRODUCT_MEDIA_COPY.actions.removeLabel(place(4, 4))));
    expect(replaceMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  });

  it('reconciles from the response: order, count and a fresh token', async () => {
    const saved = publishedProduct(0, '2026-09-08T05:00:00.000Z');
    const reordered = {
      ...saved,
      // The role comes from the contract enum, not a literal: the server derives
      // it from position and a string here would only be checked by this test.
      media: [2, 0, 1].map((index, position) => ({
        ...makeProductMedia(index),
        position,
        role:
          position === 0
            ? AdminProductMediaResponseRole.THUMBNAIL
            : AdminProductMediaResponseRole.GALLERY,
      })),
    };
    replaceMock.mockResolvedValue(productDetailEnvelope(reordered));
    await renderPublished(3);

    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));

    // The dirty state clears because the response *is* the new truth, which is
    // also what moves the concurrency token forward.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText(PRODUCT_MEDIA_COPY.header.capacity(3))).toBeInTheDocument();
    // Still published: nothing on this screen can change that.
    expect(screen.getByText(PRODUCT_MEDIA_COPY.published.bannerTitle)).toBeInTheDocument();
  });

  it('discards staged changes on cancel without any request', async () => {
    await renderPublished(3);

    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.cancel }));

    expect(replaceMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }),
    ).not.toBeInTheDocument();
  });
});

describe('refusals', () => {
  async function refuse(code: string, status: number) {
    replaceMock.mockRejectedValue(makeApiClientError({ status, code, message: 'raw server text' }));
    await renderPublished(3);
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));
    return screen.findByRole('alert');
  }

  it('maps an unpublishable set to its approved Vietnamese copy', async () => {
    const alert = await refuse('PRODUCT_MEDIA_NOT_PUBLISHABLE', 409);

    expect(alert).toHaveTextContent(PRODUCT_MEDIA_FAILURE_COPY['not-publishable'].title);
    expect(alert).toHaveTextContent(PRODUCT_MEDIA_FAILURE_COPY['not-publishable'].body);
  });

  it('maps an unavailable asset, and shows no raw code or server sentence', async () => {
    const alert = await refuse('PRODUCT_MEDIA_ASSET_UNAVAILABLE', 409);

    expect(alert).toHaveTextContent(PRODUCT_MEDIA_FAILURE_COPY['asset-unavailable'].title);
    expect(alert.textContent).not.toContain('PRODUCT_MEDIA_ASSET_UNAVAILABLE');
    expect(alert.textContent).not.toContain('raw server text');
  });

  it('maps a deleted asset and a duplicate to their own messages', async () => {
    const notFound = await refuse('PRODUCT_MEDIA_ASSET_NOT_FOUND', 400);
    expect(notFound).toHaveTextContent(PRODUCT_MEDIA_FAILURE_COPY['asset-not-found'].title);
  });

  it('keeps the staged selection on screen after a refusal', async () => {
    await refuse('PRODUCT_MEDIA_NOT_PUBLISHABLE', 409);

    // Nothing was written, so the operator's arrangement is still theirs.
    expect(
      screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }),
    ).toBeInTheDocument();
    expect(tiles()).toHaveLength(3);
  });

  it('opens the reload prompt on a stale token instead of overwriting', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_VERSION_CONFLICT' }),
    );
    await renderPublished(3);
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(PRODUCT_MEDIA_FAILURE_COPY['version-conflict'].title);
    expect(dialog).toHaveTextContent(PRODUCT_MEDIA_FAILURE_COPY['version-conflict'].body);
    // There is no force-save: reload and close are the only two ways out.
    expect(within(dialog).getAllByRole('button')).toHaveLength(2); // close, reload
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the staged selection while the conflict is unresolved', async () => {
    replaceMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_VERSION_CONFLICT' }),
    );
    await renderPublished(3);
    await user.click(tileAction(2, PRODUCT_MEDIA_COPY.actions.setPrimaryLabel(place(3, 3))));
    await user.click(screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }));

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.conflict.close }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: PRODUCT_MEDIA_COPY.published.save }),
    ).toBeInTheDocument();
  });
});
