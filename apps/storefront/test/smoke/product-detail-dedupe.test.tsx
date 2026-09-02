/**
 * @jest-environment node
 *
 * One backend read per browser request — and a fresh one for the next request.
 *
 * Next.js calls `generateMetadata` and the page component separately for a
 * single request. Without request-scoped memoization that is two detail reads
 * per page view, and worse, two reads that can disagree: a Product unpublished
 * between them would produce a page whose title and body describe different
 * states of the world.
 *
 * The other half matters more. The memo must NOT survive the request, because
 * publication is re-read on every API call precisely because nothing in this
 * system invalidates a cache — a process-global memo would keep serving an
 * artwork the operator has just unpublished.
 *
 * **What this file can and cannot prove.** React's `cache()` memoizes only
 * inside a React Server Components render scope. `next/jest` resolves React's
 * *client* build, so no such scope exists here — a `cache()`d function called
 * from Jest runs every time, and that was measured, not assumed (a probe using
 * `react-dom/server.edge` did not dedupe either). So the "one read per request"
 * half is **not** provable in this harness and is not asserted here; it is
 * measured against the running production server in the gateway smoke, by
 * counting the API's own access-log lines for a single page view.
 *
 * What is provable here is the half that would silently break durable
 * visibility: that nothing is replayed across requests, that two slugs never
 * share a read, and that an unpublish takes effect on the very next request.
 */
import { publicProductDetail, publicProductVariantList } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import ProductDetailPage, { generateMetadata } from '../../src/app/san-pham/[slug]/page';
import {
  makePublicDetail,
  publicDetailEnvelope,
  safeNotFoundError,
} from '../support/product-detail-fixture';
import { makeVariantList, publicVariantEnvelope } from '../support/ready-made-purchase-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductDetail: jest.fn(),
  publicProductVariantList: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const detailMock = publicProductDetail as jest.MockedFunction<typeof publicProductDetail>;
// The route also reads the APP12-B01 purchase projection. It is memoized by the
// same request-scoped mechanism and is mocked so this suite measures the detail
// read it is about, without a second unmocked operation reaching Axios.
const variantMock = publicProductVariantList as jest.MockedFunction<
  typeof publicProductVariantList
>;

beforeEach(() => {
  detailMock.mockReset();
  variantMock.mockReset();
  variantMock.mockResolvedValue(publicVariantEnvelope(makeVariantList()));
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
  // `APP11-S04` gave the Storefront a `metadataBase` and absolute canonicals,
  // both composed from the one public-origin authority. It has no fallback by
  // design, so a test that generates metadata has to configure it.
  process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.test';
});

/** Metadata and the page for one slug, as Next invokes them per request. */
async function oneRequest(slug: string): Promise<{ title: unknown; html: string }> {
  const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
  const element = await ProductDetailPage({ params: Promise.resolve({ slug }) });
  return { title: meta.title, html: renderToStaticMarkup(element) };
}

describe('request-scoped detail read', () => {
  it('describes the same Product in the title and the body', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const { title, html } = await oneRequest('gau-bong-theu-tay');

    expect(title).toBe('Gấu bông thêu tay');
    expect(html).toContain('Gấu bông thêu tay');
    // Both call sites go through the one exported loader, so in the RSC runtime
    // they share its request-scoped memo. The call COUNT is deliberately not
    // asserted here — see the file header: this harness has no RSC scope, and a
    // "1" written here would pass only by accident of how Jest resolves React.
    expect(detailMock).toHaveBeenLastCalledWith('gau-bong-theu-tay', expect.anything());
  });

  it('asks the API again for the next request', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    await oneRequest('gau-bong-theu-tay');
    const callsAfterFirst = detailMock.mock.calls.length;
    await oneRequest('gau-bong-theu-tay');

    expect(detailMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('stops serving a Product the moment the API says it is gone', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));
    const first = await oneRequest('gau-bong-theu-tay');
    expect(first.html).toContain('Gấu bông thêu tay');

    // The operator unpublishes. The very next request must 404 — nothing may be
    // replayed from the previous one.
    detailMock.mockRejectedValue(safeNotFoundError());
    await expect(oneRequest('gau-bong-theu-tay')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('does not share one Product read across different slugs', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    await oneRequest('gau-bong-theu-tay');
    const before = detailMock.mock.calls.length;
    await oneRequest('khan-tay-hoa-sen');

    expect(detailMock.mock.calls.length).toBeGreaterThan(before);
    expect(detailMock).toHaveBeenLastCalledWith('khan-tay-hoa-sen', expect.anything());
  });
});
