import { BRAND_NAME } from '@embroidery/i18n';
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
import { publicCategoryList, publicProductList } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import DiscoverPage, { generateMetadata } from '../../src/app/kham-pha/page';
import { makePublicPage, makePublicProduct, publicEnvelope } from '../support/discover-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductList: jest.fn(),
  publicCategoryList: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const listMock = publicProductList as jest.MockedFunction<typeof publicProductList>;
const categoryMock = publicCategoryList as jest.MockedFunction<typeof publicCategoryList>;

/**
 * The category inventory this page now renders its chips from
 * (`APP12-C01-C1`).
 *
 * Arbitrary fixture values, deliberately not the four migration `0033` seeded:
 * the page must render whatever the database publishes, and a test asserting
 * the historical four would make this file a second taxonomy.
 */
const CATEGORIES = [
  { slug: 'mu-luoi-trai', name: 'Mũ lưỡi trai', isIndexable: true, displayOrder: 7 },
  { slug: 'tui-vai', name: 'Túi vải', isIndexable: false, displayOrder: 8 },
];

function categoryEnvelope(items: readonly (typeof CATEGORIES)[number][]) {
  return {
    success: true as const,
    code: 'PUBLIC_CATEGORY_LIST_READ',
    message: '',
    data: { items: [...items] },
    meta: { requestId: 'test', timestamp: '2026-09-01T00:00:00.000Z' },
  } as unknown as Awaited<ReturnType<typeof publicCategoryList>>;
}

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
  categoryMock.mockReset();
  categoryMock.mockResolvedValue(categoryEnvelope(CATEGORIES));
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

  it('issues exactly one product request and one category request per render', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    await renderPage();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith({ limit: 20 }, expect.anything());
    expect(categoryMock).toHaveBeenCalledTimes(1);
  });

  it('renders the chips from the database inventory, labelled by row name', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    const markup = await renderPage();

    expect(markup).toContain('Mũ lưỡi trai');
    expect(markup).toContain('/kham-pha?category=mu-luoi-trai');
    // A non-indexable category is still browsable.
    expect(markup).toContain('/kham-pha?category=tui-vai');
  });

  it('asks the API for the category in the URL and marks that chip current', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    const markup = await renderPage({ category: 'mu-luoi-trai' });

    expect(listMock).toHaveBeenCalledWith(
      { limit: 20, categorySlug: 'mu-luoi-trai' },
      expect.anything(),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('/kham-pha?category=mu-luoi-trai');
  });

  it('renders a category the build never knew, with no source change', async () => {
    // The dynamic property in one assertion: a row added to the inventory
    // becomes a chip and a valid selection, from data alone.
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));
    categoryMock.mockResolvedValue(
      categoryEnvelope([
        ...CATEGORIES,
        {
          slug: 'danh-muc-moi',
          name: 'Danh mục hoàn toàn mới',
          isIndexable: true,
          displayOrder: 9,
        },
      ]),
    );

    const markup = await renderPage({ category: 'danh-muc-moi' });

    expect(markup).toContain('Danh mục hoàn toàn mới');
    expect(listMock).toHaveBeenCalledWith(
      { limit: 20, categorySlug: 'danh-muc-moi' },
      expect.anything(),
    );
  });

  it('takes the not-found boundary for a category the inventory does not contain', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));

    await expect(renderPage({ category: 'khong-ton-tai' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(listMock).not.toHaveBeenCalled();
  });

  it('degrades the chip row, and never substitutes a taxonomy, when the inventory fails', async () => {
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));
    categoryMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:4000'));

    const markup = await renderPage();

    expect(markup).toContain('Chưa thể tải danh mục.');
    // The feed still renders, and no remembered category list appears.
    expect(markup).toContain('Thỏ trắng của Mai');
    for (const historical of ['thu-bong', 'quan-ao', 'category=khan', 'category=khac']) {
      expect(markup).not.toContain(historical);
    }
    expect(markup).not.toContain('ECONNREFUSED');
  });

  it('still renders a well-formed category when the inventory is unavailable', async () => {
    // Unknown is not empty: 404ing a valid category because the inventory read
    // blipped would be worse than rendering it.
    listMock.mockResolvedValue(publicEnvelope(makePublicPage(PRODUCTS)));
    categoryMock.mockRejectedValue(new Error('boom'));

    const markup = await renderPage({ category: 'mu-luoi-trai' });

    expect(markup).toContain('Thỏ trắng của Mai');
    expect(listMock).toHaveBeenCalledWith(
      { limit: 20, categorySlug: 'mu-luoi-trai' },
      expect.anything(),
    );
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

  it('publishes source-grounded metadata and an absolute self-canonical', async () => {
    // This assertion used to require the *absence* of a canonical, on the stale
    // reason that the Product Detail route was unresolved (`FU-APP11-G01-05`).
    // IMP-D039 locked that route and `APP11-S04` supplied the origin, so the
    // rule inverts: the canonical must exist, and must be absolute.
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(metadata.title).toContain('Khám phá');
    expect(metadata.alternates?.canonical).toBe('https://example.test/kham-pha');
    // The unfiltered feed's canonical carries no category query, and the page
    // still invents no Product URL.
    expect(JSON.stringify(metadata)).not.toContain('category=');
    expect(JSON.stringify(metadata)).not.toContain('/san-pham');
  });

  it('self-canonicalises each category state to its own URL (APP11-S04)', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'mu-luoi-trai' }),
    });

    expect(metadata.alternates?.canonical).toBe(
      'https://example.test/kham-pha?category=mu-luoi-trai',
    );
    expect(metadata.openGraph?.url).toBe('https://example.test/kham-pha?category=mu-luoi-trai');
  });

  it('canonicalises a category the build never knew, from the inventory alone', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    categoryMock.mockResolvedValue(
      categoryEnvelope([
        { slug: 'ao-khoac', name: 'Áo khoác', isIndexable: true, displayOrder: 4 },
      ]),
    );

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'ao-khoac' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://example.test/kham-pha?category=ao-khoac');
  });

  it('titles a category state with the operator name, never one rebuilt from the slug', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'mu-luoi-trai' }),
    });

    // The name comes from the row. Renaming the category renames the title with
    // no deployment, and no slug is ever title-cased into a label.
    expect(metadata.title).toBe(`Mũ lưỡi trai — Khám phá — ${BRAND_NAME}`);
    expect(metadata.openGraph?.title).toBe(`Mũ lưỡi trai — Khám phá — ${BRAND_NAME}`);
  });

  it('asks crawlers not to index a published non-indexable category, and still shows it', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'tui-vai' }),
    });

    // `noindex, follow`: indexability is not visibility. The chip, the feed and
    // the self-canonical all stay; only the index invitation is withdrawn — the
    // half the sitemap could not say on its own (`APP12-C03`).
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('https://example.test/kham-pha?category=tui-vai');

    const markup = renderToStaticMarkup(
      await DiscoverPage({ searchParams: Promise.resolve({ category: 'tui-vai' }) }),
    );
    expect(markup).toContain('Túi vải');
  });

  it('invites indexing of a published indexable category', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'mu-luoi-trai' }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('emits no indexing directive for the unfiltered feed', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });

    // `/kham-pha` is not a category and has no operator indexability decision;
    // inventing one here would make this file the store's robots authority.
    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toBe(`Khám phá — ${BRAND_NAME}`);
  });

  it('withholds the directive rather than guessing noindex when the inventory is unreadable', async () => {
    process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://example.test';
    categoryMock.mockRejectedValue(new Error('inventory unavailable'));

    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ category: 'mu-luoi-trai' }),
    });

    // Unknown is not "not indexable". A momentary API blip must not be able to
    // ask a crawler to drop a real category page, and the canonical still holds
    // because the slug shape is a rule this app owns.
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(
      'https://example.test/kham-pha?category=mu-luoi-trai',
    );
    expect(metadata.title).toBe(`Khám phá — ${BRAND_NAME}`);
  });
});
