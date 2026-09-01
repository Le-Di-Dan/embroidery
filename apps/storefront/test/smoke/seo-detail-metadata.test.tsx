/**
 * @jest-environment node
 *
 * Canonical, Open Graph and `BreadcrumbList` on the two public detail pages
 * (`APP11-S04`).
 *
 * `APP2-S02` and `APP11-S03` each emit a route-relative canonical and neither
 * emitted Open Graph, on the recorded reason that no public origin existed. S04
 * supplied one. What this file proves is that the route models are unchanged and
 * only their resolution moved — and that a `noindex` entity keeps every one of
 * those tags while being absent from the sitemap.
 */
import { publicGalleryEntryDetail, publicProductDetail } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import ProductDetailPage, {
  generateMetadata as productMetadata,
} from '../../src/app/san-pham/[slug]/page';
import GalleryDetailPage, {
  generateMetadata as galleryMetadata,
} from '../../src/app/bo-suu-tap/[slug]/page';
import {
  makePublicDetail,
  makePublicDetailWithUncontractedCategory,
  publicDetailEnvelope,
  safeNotFoundError,
} from '../support/product-detail-fixture';
import {
  galleryDetailEnvelope,
  galleryNotFoundError,
  makeGalleryDetail,
  GALLERY_DETAIL_SLUG,
} from '../support/gallery-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductDetail: jest.fn(),
  publicGalleryEntryDetail: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const productMock = publicProductDetail as jest.MockedFunction<typeof publicProductDetail>;
const galleryMock = publicGalleryEntryDetail as jest.MockedFunction<
  typeof publicGalleryEntryDetail
>;

const ORIGIN = 'https://shop.example.test';
const PRODUCT_SLUG = 'gau-bong-theu-tay';

beforeEach(() => {
  productMock.mockReset();
  galleryMock.mockReset();
  process.env.STOREFRONT_PUBLIC_ORIGIN = ORIGIN;
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
});

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** Every JSON-LD document in a rendered page, parsed rather than substring-matched. */
function jsonLdOf(html: string): unknown[] {
  const pattern = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
  return [...html.matchAll(pattern)].map((match) => JSON.parse(match[1] as string) as unknown);
}

describe('Product Detail', () => {
  it('resolves its existing relative canonical to an absolute URL', async () => {
    productMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const metadata = await productMetadata(params(PRODUCT_SLUG));

    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/san-pham/${PRODUCT_SLUG}`);
  });

  it('publishes public Open Graph using the first already-public media path', async () => {
    const product = makePublicDetail();
    productMock.mockResolvedValue(publicDetailEnvelope(product));

    const metadata = await productMetadata(params(PRODUCT_SLUG));

    expect(metadata.openGraph?.url).toBe(`${ORIGIN}/san-pham/${PRODUCT_SLUG}`);
    expect(metadata.openGraph).toMatchObject({ type: 'website', locale: 'vi_VN' });
    // The page's own first gallery image, resolved against the same origin.
    // Nothing is queried for it and no storage URL is constructed.
    expect(JSON.stringify(metadata.openGraph)).toContain(`${ORIGIN}${product.media[0]?.url}`);
  });

  it('omits og:image for a Product with no deliverable media', async () => {
    productMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail({ media: [] })));

    const metadata = await productMetadata(params(PRODUCT_SLUG));

    expect(metadata.openGraph).not.toHaveProperty('images');
  });

  it('keeps a public noindex Product readable, self-canonical and fully tagged', async () => {
    productMock.mockResolvedValue(
      publicDetailEnvelope(makePublicDetail({ seo: { isIndexable: false } })),
    );

    const metadata = await productMetadata(params(PRODUCT_SLUG));
    const html = renderToStaticMarkup(await ProductDetailPage(params(PRODUCT_SLUG)));

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/san-pham/${PRODUCT_SLUG}`);
    // Indexability is not visibility. Sitemap exclusion is `APP11-B04`'s job,
    // and it is not the same thing as hiding the page.
    expect(html).toContain('Gấu bông thêu tay');
  });

  it('emits exactly one BreadcrumbList matching the visible trail', async () => {
    productMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const documents = jsonLdOf(renderToStaticMarkup(await ProductDetailPage(params(PRODUCT_SLUG))));

    expect(documents).toHaveLength(1);
    expect(documents[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Khám phá', item: `${ORIGIN}/kham-pha` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Thú bông',
          item: `${ORIGIN}/kham-pha?category=thu-bong`,
        },
        { '@type': 'ListItem', position: 3, name: 'Gấu bông thêu tay' },
      ],
    });
  });

  it('advertises the category crumb for a category no build knew about', async () => {
    // The inverse of the assertion that stood here, and the correction is the
    // point. `APP11-S04` advertised `/kham-pha?category=ao-thun` while Discover
    // could only render four compiled slugs, so the trail named a page that
    // 404ed; `S04-C1` dropped the crumb instead, which meant a real category
    // lost its crumb until someone deployed. `APP12-C01-C1` made Discover list
    // from the same `categories` table the Product's category comes from, so
    // the URL resolves and the crumb is ordinary (`FU-APP11-S04-C1-02`).
    productMock.mockResolvedValue(publicDetailEnvelope(makePublicDetailWithUncontractedCategory()));

    const html = renderToStaticMarkup(await ProductDetailPage(params('ao-thun-cotton')));
    const documents = jsonLdOf(html);

    expect(documents).toHaveLength(1);
    expect(documents[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Khám phá', item: `${ORIGIN}/kham-pha` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Áo thun',
          item: `${ORIGIN}/kham-pha?category=ao-thun`,
        },
        { '@type': 'ListItem', position: 3, name: 'Áo thun cotton' },
      ],
    });
    // And the rendered trail agrees, because it is the same resolved sequence.
    const nav = html.slice(html.indexOf('product-detail__breadcrumb'), html.indexOf('</nav>'));

    expect(nav).toContain('href="/kham-pha?category=ao-thun"');
  });

  it('still omits the crumb when the category slug could not be a URL segment', async () => {
    // A malformed slug is a data defect, not an unfamiliar category, and must
    // never become an advertised address.
    productMock.mockResolvedValue(
      publicDetailEnvelope(
        makePublicDetailWithUncontractedCategory({
          category: { slug: 'ao thun', name: 'Áo thun' },
        }),
      ),
    );

    const html = renderToStaticMarkup(await ProductDetailPage(params('ao-thun-cotton')));
    const nav = html.slice(html.indexOf('product-detail__breadcrumb'), html.indexOf('</nav>'));

    expect(nav).not.toContain('category=');
    expect(nav).toContain('href="/kham-pha"');
  });

  it('keeps the JSON-LD trail identical to the visible crumbs in both branches', async () => {
    // One resolved model, two consumers. The `<li>` text of the desktop trail
    // and the JSON-LD names are compared directly rather than assumed equal.
    const cases = [
      { detail: makePublicDetail(), expected: ['Khám phá', 'Thú bông', 'Gấu bông thêu tay'] },
      {
        // A category the build never knew: three levels now, not two.
        detail: makePublicDetailWithUncontractedCategory({ name: 'Gấu bông thêu tay' }),
        expected: ['Khám phá', 'Áo thun', 'Gấu bông thêu tay'],
      },
      {
        // A malformed slug: still two, and still no advertised URL.
        detail: makePublicDetailWithUncontractedCategory({
          name: 'Gấu bông thêu tay',
          category: { slug: 'ao thun', name: 'Áo thun' },
        }),
        expected: ['Khám phá', 'Gấu bông thêu tay'],
      },
    ];

    for (const { detail, expected } of cases) {
      productMock.mockResolvedValue(publicDetailEnvelope(detail));

      const html = renderToStaticMarkup(await ProductDetailPage(params(PRODUCT_SLUG)));
      const crumbPattern = new RegExp('<li class="product-detail__crumb"[^>]*>(.*?)</li>', 'gs');
      const crumbs = [...html.matchAll(crumbPattern)].map((match) =>
        (match[1] as string).replace(/<[^>]*>/g, '').trim(),
      );
      const names = (
        jsonLdOf(html)[0] as { itemListElement: { name: string }[] }
      ).itemListElement.map((item) => item.name);

      expect(crumbs).toEqual(expected);
      expect(names).toEqual(expected);
    }
  });
  it('describes nothing on the safe not-found', async () => {
    productMock.mockRejectedValue(safeNotFoundError());

    await expect(productMetadata(params('khong-ton-tai'))).rejects.toThrow(notFoundError);
  });
});

describe('Gallery Detail', () => {
  it('resolves its existing relative canonical to an absolute URL', async () => {
    galleryMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const metadata = await galleryMetadata(params(GALLERY_DETAIL_SLUG));

    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/bo-suu-tap/${GALLERY_DETAIL_SLUG}`);
  });

  it('delivers the Open Graph block APP11-S03 deferred (FU-APP11-S03-04)', async () => {
    const entry = makeGalleryDetail();
    galleryMock.mockResolvedValue(galleryDetailEnvelope(entry));

    const metadata = await galleryMetadata(params(GALLERY_DETAIL_SLUG));

    expect(metadata.openGraph?.url).toBe(`${ORIGIN}/bo-suu-tap/${GALLERY_DETAIL_SLUG}`);
    expect(metadata.openGraph?.title).toBe(entry.title);
    // The cover — `assets[0]`, position 0 in the curated order — at the same
    // publication-gated address the page renders.
    expect(JSON.stringify(metadata.openGraph)).toContain(`${ORIGIN}${entry.assets[0]?.url}`);
  });

  it('keeps a public noindex entry readable, self-canonical and fully tagged', async () => {
    galleryMock.mockResolvedValue(
      galleryDetailEnvelope(makeGalleryDetail({ seo: { isIndexable: false } })),
    );

    const metadata = await galleryMetadata(params(GALLERY_DETAIL_SLUG));

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/bo-suu-tap/${GALLERY_DETAIL_SLUG}`);
    expect(metadata.openGraph?.url).toBe(`${ORIGIN}/bo-suu-tap/${GALLERY_DETAIL_SLUG}`);
  });

  it('emits exactly one flat, two-level BreadcrumbList', async () => {
    galleryMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const documents = jsonLdOf(
      renderToStaticMarkup(await GalleryDetailPage(params(GALLERY_DETAIL_SLUG))),
    );

    expect(documents).toHaveLength(1);
    expect(documents[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Bộ sưu tập', item: `${ORIGIN}/bo-suu-tap` },
        { '@type': 'ListItem', position: 2, name: 'Kỷ niệm được giữ lại' },
      ],
    });
  });

  it('leaks no internal identity into the structured data', async () => {
    const entry = makeGalleryDetail();
    galleryMock.mockResolvedValue(galleryDetailEnvelope(entry));

    const serialized = JSON.stringify(
      jsonLdOf(renderToStaticMarkup(await GalleryDetailPage(params(GALLERY_DETAIL_SLUG)))),
    );

    expect(serialized).not.toContain(entry.galleryEntryId);
    expect(serialized).not.toContain(entry.assets[0]?.assetId);
    expect(serialized).not.toMatch(/isIndexable|displayOrder/);
  });

  it('describes nothing on the safe not-found', async () => {
    galleryMock.mockRejectedValue(galleryNotFoundError());

    await expect(galleryMetadata(params('khong-ton-tai'))).rejects.toThrow(notFoundError);
  });
});
