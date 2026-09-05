import { BRAND_NAME } from '@embroidery/i18n';
/**
 * @jest-environment node
 *
 * Server rendering, metadata and the safe-404 matrix for `/bo-suu-tap/[slug]`.
 *
 * The point of this file is what a component test cannot show: that the entry's
 * title, narrative, first image and every link are in the HTML the server sends
 * before any browser JavaScript runs, that the page and its metadata share one
 * backend read per request, and that five different internal reasons for "you
 * may not see this" arrive at one indistinguishable public 404.
 */
import { publicGalleryEntryDetail } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import GalleryDetailPage, { generateMetadata } from '../../src/app/bo-suu-tap/[slug]/page';
import {
  galleryDetailEnvelope,
  galleryNotFoundError,
  galleryServerError,
  makeGalleryDetail,
  makeSingleImageGalleryDetail,
  GALLERY_DETAIL_SLUG,
} from '../support/gallery-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicGalleryEntryDetail: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const detailMock = publicGalleryEntryDetail as jest.MockedFunction<typeof publicGalleryEntryDetail>;

beforeEach(() => {
  detailMock.mockReset();
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
  // `APP11-S04` gave the Storefront a `metadataBase` and absolute canonicals,
  // both composed from the one public-origin authority. It has no fallback by
  // design, so a test that generates metadata has to configure it.
  process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.test';
});

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function renderPage(slug: string = GALLERY_DETAIL_SLUG): Promise<string> {
  const element = await GalleryDetailPage(params(slug));
  return renderToStaticMarkup(element);
}

describe('server-rendered Gallery Entry Detail', () => {
  it('puts the title, the narrative and the first image in the server HTML', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const html = await renderPage();

    expect(html).toContain('Kỷ niệm được giữ lại');
    expect(html).toContain('Về mục này');
    expect(html).toContain('khâu trong sáu tuần mùa hè');
    expect(html).toContain(
      `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/0199c0de-0000-7000-8000-0000000000a1/catalog-preview`,
    );
    expect(detailMock).toHaveBeenCalledTimes(1);
  });

  it('renders exactly one h1 and adds no second landmark', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const html = await renderPage();

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<h1 class="gallery-detail__title">Kỷ niệm được giữ lại</h1>');
    // The shell already owns <main>, <header> and <footer>.
    expect(html).not.toContain('<main');
    expect(html).not.toContain('<footer');
  });

  it('renders the flat two-level breadcrumb back to the feed', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const html = await renderPage();

    expect(html).toContain('href="/bo-suu-tap"');
    expect(html).toContain('aria-current="page"');
    // No parent collection, no /works, no third level.
    expect(html).not.toMatch(/\/works\//);
    expect(html).not.toContain('Member Works');
  });

  it('leaks no internal identity, ordering or SEO fact into the body', async () => {
    detailMock.mockResolvedValue(
      galleryDetailEnvelope(
        makeGalleryDetail({
          seo: { isIndexable: false, title: 'SEO title', description: 'SEO d' },
        }),
      ),
    );

    const html = await renderPage();

    // The gallery entry id and every asset id are dropped at the projection.
    expect(html).not.toContain('0199c0de-0000-7000-8000-000000000001');
    expect(html).not.toContain('displayOrder');
    expect(html).not.toContain('isIndexable');
    // SEO fields feed the document head only; they are never body copy.
    expect(html).not.toContain('SEO title');
    expect(html).not.toContain('SEO d');
  });

  it('renders no price, cart or buy affordance', async () => {
    detailMock.mockResolvedValue(
      galleryDetailEnvelope(
        makeGalleryDetail({
          linkedProduct: { slug: 'gau-bong-theu-tay', name: 'Gấu bông thêu tay' },
        }),
      ),
    );

    const html = await renderPage();

    expect(html).toContain('href="/san-pham/gau-bong-theu-tay"');
    expect(html).not.toMatch(/₫|VND|Thêm vào giỏ|Mua ngay|Còn hàng|Hết hàng/);
  });
});

describe('media states in the server HTML', () => {
  it('renders the ordered strip and the position affordances for many images', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const html = await renderPage();

    expect(html).toContain('Xem ảnh 1 trên 3');
    expect(html).toContain('Xem ảnh 3 trên 3');
    // Strip order is the API's; the first asset is selected.
    const first = html.indexOf('0000000000a1/catalog-preview');
    const second = html.indexOf('0000000000a2/catalog-preview');
    const third = html.indexOf('0000000000a3/catalog-preview');
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
  });

  it('hides the strip entirely for a single image', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeSingleImageGalleryDetail()));

    const html = await renderPage();

    expect(html).not.toContain('gallery-detail__thumbnails');
    expect(html).not.toContain('Xem ảnh 1 trên 1');
    // The stage and its lightbox trigger stay.
    expect(html).toContain('gallery-detail__stage-image');
    expect(html).toContain('Mở ảnh 1 trong chế độ xem lớn');
  });
});

describe('the safe not-found surface', () => {
  /**
   * Five internal reasons, one public answer. The API returns the identical
   * 404 for all of them and the page must not be able to tell them apart —
   * which is why this is a single mocked rejection rather than five, and why
   * the malformed case is proved by the absence of a request at all.
   */
  it.each([
    ['an unknown slug', 'khong-ton-tai'],
    ['a DRAFT entry', GALLERY_DETAIL_SLUG],
    ['an ARCHIVED entry', GALLERY_DETAIL_SLUG],
    ['a published entry with no deliverable image', GALLERY_DETAIL_SLUG],
  ])('collapses %s to the same not-found', async (_label, slug) => {
    detailMock.mockRejectedValue(galleryNotFoundError());

    await expect(renderPage(slug)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each(['../etc/passwd', 'Có Dấu', 'a b', '', 'UPPER', 'slug?x=1', 'a/b'])(
    'refuses the malformed slug %p without calling the API',
    async (slug) => {
      await expect(renderPage(slug)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(detailMock).not.toHaveBeenCalled();
    },
  );

  it('does not report a server failure as a missing entry', async () => {
    detailMock.mockRejectedValue(galleryServerError(500));

    // The route's error boundary, not the 404 surface: telling a visitor a
    // collection does not exist because the database is down would be a lie.
    await expect(renderPage()).rejects.toThrow('The gallery entry detail request failed.');
  });

  it('emits no gallery metadata at all for a refused entry', async () => {
    detailMock.mockRejectedValue(galleryNotFoundError());

    await expect(generateMetadata(params(GALLERY_DETAIL_SLUG))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('emits no metadata describing an entry when the read merely failed', async () => {
    detailMock.mockRejectedValue(galleryServerError(503));

    // No title, no description, no canonical and no robots directive: an error
    // must not become an index instruction for an address that renders nothing.
    await expect(generateMetadata(params(GALLERY_DETAIL_SLUG))).resolves.toEqual({});
  });
});

describe('per-entry metadata', () => {
  it('falls back to the entry title and description when SEO fields are absent', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));

    expect(meta.title).toBe('Kỷ niệm được giữ lại');
    expect(meta.description).toContain('khâu trong sáu tuần mùa hè');
  });

  it('prefers the operator SEO overrides when they exist', async () => {
    detailMock.mockResolvedValue(
      galleryDetailEnvelope(
        makeGalleryDetail({
          seo: { isIndexable: true, title: `Kỷ niệm — ${BRAND_NAME}`, description: 'Mô tả SEO.' },
        }),
      ),
    );

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));

    expect(meta.title).toBe(`Kỷ niệm — ${BRAND_NAME}`);
    expect(meta.description).toBe('Mô tả SEO.');
  });

  it('emits the canonical from the one route builder, on the configured origin', async () => {
    // This used to require a *relative* canonical and no absolute origin
    // anywhere, because `APP11-S04` had not yet supplied one. It has, so the
    // requirement inverts: the same builder's path, resolved against the one
    // configured origin rather than a guessed host.
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));

    expect(meta.alternates?.canonical).toBe(
      `https://shop.example.test/bo-suu-tap/${GALLERY_DETAIL_SLUG}`,
    );
  });

  it('emits the Open Graph block it deferred to APP11-S04', async () => {
    // S03's reason for emitting none was exact — an OG image must be absolute,
    // and without a `metadataBase` Next would have guessed an origin. S04
    // supplied the origin, so the block lands here (`FU-APP11-S03-04`).
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));

    expect(meta.openGraph?.url).toBe(`https://shop.example.test/bo-suu-tap/${GALLERY_DETAIL_SLUG}`);
  });

  it('marks an indexable entry index,follow', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));

    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it('marks a noindex entry noindex,follow and still renders it', async () => {
    const entry = makeGalleryDetail({ seo: { isIndexable: false } });
    detailMock.mockResolvedValue(galleryDetailEnvelope(entry));

    const meta = await generateMetadata(params(GALLERY_DETAIL_SLUG));
    const html = await renderPage();

    expect(meta.robots).toEqual({ index: false, follow: true });
    // Indexability is an SEO directive, never a visibility one.
    expect(html).toContain('Kỷ niệm được giữ lại');
  });
});
