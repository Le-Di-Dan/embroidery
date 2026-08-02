/**
 * @jest-environment node
 *
 * Server rendering of `/kham-pha`.
 *
 * The point of this file is the property a component test cannot show: that the
 * first page of products is in the HTML the server sends, produced by exactly
 * one API request, before any browser JavaScript runs. A discovery feed that
 * only fills in after hydration is invisible to a crawler and slow for the
 * visitor, and `APP2` requires the Storefront to be SSR/SEO-valid.
 */
import { publicProductList } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import DiscoverPage, { metadata } from '../../src/app/kham-pha/page';
import { makePublicPage, makePublicProduct, publicEnvelope } from '../support/discover-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductList: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const listMock = publicProductList as jest.MockedFunction<typeof publicProductList>;

const PRODUCTS = [
  makePublicProduct({ slug: 'a', name: 'Thỏ trắng của Mai' }),
  makePublicProduct({
    slug: 'b',
    name: 'Chiếc khăn tay cưới',
    category: { slug: 'khan', name: 'Khăn' },
  }),
];

beforeEach(() => {
  listMock.mockReset();
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
});

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await DiscoverPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe('/kham-pha server rendering', () => {
  it('puts the heading, the chips and the first page of products in the HTML', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS, 'cursor-1')));

    const markup = await renderPage();

    expect(markup).toContain('<h1');
    expect(markup).toContain('Khám phá');
    expect(markup).toContain('Thỏ trắng của Mai');
    expect(markup).toContain('Chiếc khăn tay cưới');
    expect(markup).toContain('/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail');
    // The shell owns the landmarks; the page adds none of its own.
    expect(markup).not.toContain('<main');
    expect(markup).not.toContain('<header');
    expect(markup).not.toContain('<footer');
  });

  it('issues exactly one API request for the initial render', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    await renderPage();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith({ limit: 20 }, expect.anything());
  });

  it('asks the API for the category in the URL and marks that chip current', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    const markup = await renderPage({ category: 'khan' });

    expect(listMock).toHaveBeenCalledWith({ limit: 20, categorySlug: 'khan' }, expect.anything());
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('/kham-pha?category=khan');
  });

  it('takes the not-found boundary for an unknown category instead of showing everything', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    await expect(renderPage({ category: 'khong-ton-tai' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('absorbs a failed prefetch instead of rendering an error page', async () => {
    listMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:4000'));

    const markup = await renderPage();

    // The page still renders: heading, chips, and the pending state. The client
    // then issues the request itself, and only a request that also fails there
    // becomes the approved "Chưa thể tải các tác phẩm" state (proved in
    // `discover-feed.test.tsx`). A transient API blip must never cost the
    // visitor the whole page.
    expect(markup).toContain('Khám phá');
    expect(markup).toContain('Đang tải tác phẩm…');
    // Nothing technical may reach the HTML on any path.
    expect(markup).not.toContain('ECONNREFUSED');
    expect(markup).not.toContain('10.0.0.4');
  });

  it('renders the empty state as server markup', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage([])));

    const markup = await renderPage();

    expect(markup).toContain('Chưa có tác phẩm được xuất bản');
  });

  it('never renders the route as a cached or static page', async () => {
    const { dynamic } = await import('../../src/app/kham-pha/page');
    expect(dynamic).toBe('force-dynamic');
  });

  it('publishes source-grounded metadata with no invented canonical URL', () => {
    expect(metadata.title).toContain('Khám phá');
    expect(metadata).not.toHaveProperty('alternates');
    expect(JSON.stringify(metadata)).not.toContain('/san-pham');
  });
});
