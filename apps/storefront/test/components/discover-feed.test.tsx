/**
 * The Discover feed's rendered behaviour (UI02 masonry + keyset continuation).
 *
 * These cover what a scroll-driven feed gets wrong in production: appending
 * instead of replacing, replaying a failed cursor automatically, requesting past
 * the end, and leaking shopping chrome onto a discovery card.
 */
import { publicProductList } from '@embroidery/api-client';
import {
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';

import { DiscoverFeedScreen } from '../../src/features/product-discovery/components/discover-feed-screen';
import { DISCOVER_COPY } from '../../src/features/product-discovery/model/discover-copy';
import {
  makePublicPage,
  makePublicProduct,
  makePublicProductWithoutThumbnail,
  publicEnvelope,
} from '../support/discover-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductList: jest.fn(),
}));

const listMock = publicProductList as jest.MockedFunction<typeof publicProductList>;

const PAGE_ONE = [
  makePublicProduct({ slug: 'a', name: 'Thỏ trắng của Mai' }),
  makePublicProduct({
    slug: 'b',
    name: 'Vườn hồng tháng Tư',
    category: { slug: 'khan', name: 'Khăn' },
  }),
];
const PAGE_TWO = [makePublicProduct({ slug: 'c', name: 'Sóng biển Nha Trang' })];

beforeEach(() => {
  listMock.mockReset();
});

function renderFeed(categorySlug?: 'thu-bong' | 'khan' | 'quan-ao' | 'khac') {
  return renderWithProviders(<DiscoverFeedScreen categorySlug={categorySlug} />);
}

function feedItemNames(): string[] {
  const list = screen.getByRole('list', { name: DISCOVER_COPY.feedLabel });
  return within(list)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '');
}

describe('Discover feed — products', () => {
  it('renders one collection of cards in server order', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PAGE_ONE)));
    renderFeed();

    await waitFor(() =>
      expect(feedItemNames()).toEqual(['Thỏ trắng của Mai', 'Vườn hồng tháng Tư']),
    );
    // One DOM collection, not a tree per viewport.
    expect(screen.getAllByRole('list', { name: DISCOVER_COPY.feedLabel })).toHaveLength(1);
  });

  it('shows name, category and image only — no shopping chrome', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage([makePublicProduct()])));
    renderFeed();

    await waitFor(() => expect(screen.getByText('Gấu bông thêu tay')).toBeInTheDocument());
    expect(screen.getByText('Thú bông')).toBeInTheDocument();
    // The fixture carries a price and a stock flag; neither may surface.
    expect(screen.queryByText(/450000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VND|₫/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hết hàng/i)).not.toBeInTheDocument();
  });

  it('renders the thumbnail path unchanged, lazily, with name-derived alt', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage([makePublicProduct()])));
    renderFeed();

    const image = await screen.findByAltText('Gấu bông thêu tay');
    expect(image).toHaveAttribute(
      'src',
      '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
    );
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    // Never the detail-page rendition, and never a storage address.
    expect(image.getAttribute('src')).not.toContain('catalog-preview');
    expect(image.getAttribute('src')).not.toMatch(/^https?:/);
  });

  it('falls back to an honest placeholder, keeping name and category', async () => {
    listMock.mockResolvedValue(
      publicEnvelope(makePublicPage([makePublicProductWithoutThumbnail()])),
    );
    renderFeed();

    await waitFor(() => expect(screen.getByText('Gấu bông thêu tay')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: DISCOVER_COPY.card.imageMissing })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Gấu bông thêu tay' })).not.toBeInTheDocument();
    expect(screen.getByText('Thú bông')).toBeInTheDocument();
  });

  /**
   * Superseded by `APP2-S02` (IMP-D039). Under IMP-D038 this asserted the cards
   * carried no destination at all, which was correct while none existed. The
   * detail route exists now, so the live rule is: exactly one link per card, to
   * the canonical route, with nothing else interactive inside it.
   */
  it('renders each card as one link to the detail route (IMP-D039)', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PAGE_ONE)));
    renderFeed();

    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
    const list = screen.getByRole('list', { name: DISCOVER_COPY.feedLabel });
    const links = within(list).queryAllByRole('link');

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/san-pham\/[a-z0-9-]+$/);
    }
    // Still no nested control and still no "Xem chi tiết" affordance.
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/Xem chi tiết/)).not.toBeInTheDocument();
  });
});

describe('Discover feed — keyset continuation', () => {
  it('appends the next page and stops at the end', async () => {
    const user = createUser();
    listMock
      .mockResolvedValueOnce(publicEnvelope(makePublicPage(PAGE_ONE, 'cursor-1')))
      .mockResolvedValueOnce(publicEnvelope(makePublicPage(PAGE_TWO)));
    renderFeed();

    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: DISCOVER_COPY.continuation.loadMore }));

    await waitFor(() => expect(feedItemNames()).toHaveLength(3));
    expect(feedItemNames()).toEqual([
      'Thỏ trắng của Mai',
      'Vườn hồng tháng Tư',
      'Sóng biển Nha Trang',
    ]);
    // The cursor travelled with the category it was issued under.
    expect(listMock.mock.calls[1]?.[0]).toMatchObject({ cursor: 'cursor-1' });
    expect(await screen.findByText(DISCOVER_COPY.continuation.end)).toBeInTheDocument();
  });

  it('never requests again after the last page', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PAGE_ONE)));
    renderFeed();

    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
    expect(screen.getByText(DISCOVER_COPY.continuation.end)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: DISCOVER_COPY.continuation.loadMore }),
    ).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('keeps loaded products through a failure and retries the exact cursor', async () => {
    const user = createUser();
    listMock
      .mockResolvedValueOnce(publicEnvelope(makePublicPage(PAGE_ONE, 'cursor-1')))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(publicEnvelope(makePublicPage(PAGE_TWO)));
    renderFeed();

    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: DISCOVER_COPY.continuation.loadMore }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(DISCOVER_COPY.continuation.error)).toBeInTheDocument();
    // The already-loaded page survives the failure.
    expect(feedItemNames()).toHaveLength(2);
    // No hidden auto-retry: exactly the first page and the failed attempt so far.
    expect(listMock).toHaveBeenCalledTimes(2);

    await user.click(within(alert).getByRole('button', { name: DISCOVER_COPY.continuation.retry }));
    await waitFor(() => expect(feedItemNames()).toHaveLength(3));
    expect(listMock).toHaveBeenCalledTimes(3);
    expect(listMock.mock.calls[2]?.[0]).toMatchObject({ cursor: 'cursor-1' });
  });

  it('never reports a total or a page number', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PAGE_ONE, 'cursor-1')));
    const { container } = renderFeed();

    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
    expect(container.textContent).not.toMatch(/\btrang\s*\d/i);
    expect(container.textContent).not.toMatch(/\d+\s*(kết quả|tác phẩm)\b/i);
  });
});

describe('Discover feed — states', () => {
  it('shows the unfiltered empty state when nothing is published', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage([])));
    renderFeed();

    expect(await screen.findByText(DISCOVER_COPY.emptyUnfiltered.heading)).toBeInTheDocument();
    expect(screen.getByText(DISCOVER_COPY.emptyUnfiltered.body)).toBeInTheDocument();
    // No fake count and no commission call to action as a consolation.
    expect(screen.queryByText(/Đặt thêu/)).not.toBeInTheDocument();
  });

  it('offers a real way back when a category is empty', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage([])));
    renderFeed('khan');

    expect(await screen.findByText(DISCOVER_COPY.emptyFiltered.heading)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: DISCOVER_COPY.emptyFiltered.action })).toHaveAttribute(
      'href',
      '/kham-pha',
    );
  });

  it('redacts the failure and offers a real refetch', async () => {
    const user = createUser();
    listMock.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.4:4000'), {
        response: { status: 500, data: { error: { code: 'INTERNAL_SERVER_ERROR' } } },
      }),
    );
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PAGE_ONE)));
    const { container } = renderFeed();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(DISCOVER_COPY.initialError.heading)).toBeInTheDocument();
    // Nothing technical reaches the page.
    expect(container.textContent).not.toMatch(/ECONNREFUSED|500|INTERNAL_SERVER_ERROR|cursor/i);

    await user.click(
      within(alert).getByRole('button', { name: DISCOVER_COPY.initialError.action }),
    );
    await waitFor(() => expect(feedItemNames()).toHaveLength(2));
  });
});
