/**
 * @jest-environment node
 *
 * One backend read per browser request — and a fresh one for the next request.
 *
 * Next.js calls `generateMetadata` and the page component separately for a
 * single request. Without request-scoped memoization that is two detail reads
 * per page view, and worse, two reads that can disagree: an entry unpublished
 * between them would produce a page whose title and body describe different
 * states of the world.
 *
 * The other half matters more. The memo must NOT survive the request, because
 * `APP11-B03` re-reads publication *and* image eligibility on every call
 * precisely because nothing in this system invalidates a cache — a
 * process-global memo would keep serving an entry the operator has just
 * unpublished, or an image whose bytes have been withdrawn.
 *
 * **What this file can and cannot prove.** React's `cache()` memoizes only
 * inside a React Server Components render scope. `next/jest` resolves React's
 * *client* build, so no such scope exists here — a `cache()`d function called
 * from Jest runs every time. That was measured for `APP2-S02` rather than
 * assumed, and it has not changed. So the "exactly one read per request" half
 * is **not** provable in this harness and is not asserted here; it is measured
 * against the running production server in the browser acceptance, by counting
 * the API's own access-log lines for a single page view.
 *
 * What is provable here is the half that would silently break durable
 * visibility: that nothing is replayed across requests, that two slugs never
 * share a read, and that an unpublish takes effect on the very next request.
 */
import { publicGalleryEntryDetail } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import GalleryDetailPage, { generateMetadata } from '../../src/app/bo-suu-tap/[slug]/page';
import {
  galleryDetailEnvelope,
  galleryNotFoundError,
  makeGalleryDetail,
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

/** Metadata and the page for one slug, as Next invokes them per request. */
async function oneRequest(slug: string): Promise<{ title: unknown; html: string }> {
  const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
  const element = await GalleryDetailPage({ params: Promise.resolve({ slug }) });
  return { title: meta.title, html: renderToStaticMarkup(element) };
}

describe('request-scoped gallery detail read', () => {
  it('describes the same entry in the title and the body', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    const { title, html } = await oneRequest(GALLERY_DETAIL_SLUG);

    expect(title).toBe('Kỷ niệm được giữ lại');
    expect(html).toContain('Kỷ niệm được giữ lại');
    // Both call sites go through the one exported loader, so in the RSC runtime
    // they share its request-scoped memo. The call COUNT is deliberately not
    // asserted here — see the file header.
    expect(detailMock).toHaveBeenLastCalledWith(GALLERY_DETAIL_SLUG, expect.anything());
  });

  it('asks the API again for the next request', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    await oneRequest(GALLERY_DETAIL_SLUG);
    const callsAfterFirst = detailMock.mock.calls.length;
    await oneRequest(GALLERY_DETAIL_SLUG);

    expect(detailMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('stops serving an entry the moment the API says it is gone', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));
    const first = await oneRequest(GALLERY_DETAIL_SLUG);
    expect(first.html).toContain('Kỷ niệm được giữ lại');

    // The operator unpublishes, or the last image is withdrawn. The very next
    // request must 404 — nothing may be replayed from the previous one.
    detailMock.mockRejectedValue(galleryNotFoundError());
    await expect(oneRequest(GALLERY_DETAIL_SLUG)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('does not share one entry read across different slugs', async () => {
    detailMock.mockResolvedValue(galleryDetailEnvelope(makeGalleryDetail()));

    await oneRequest(GALLERY_DETAIL_SLUG);
    const before = detailMock.mock.calls.length;
    await oneRequest('mua-he-thu-nhat');

    expect(detailMock.mock.calls.length).toBeGreaterThan(before);
    expect(detailMock).toHaveBeenLastCalledWith('mua-he-thu-nhat', expect.anything());
  });

  it('issues no request at all for a malformed slug, in either call site', async () => {
    await expect(oneRequest('../secret')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(detailMock).not.toHaveBeenCalled();
  });
});
