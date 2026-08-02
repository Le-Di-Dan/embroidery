/**
 * @jest-environment node
 *
 * Server rendering, metadata and the safe-404 matrix for `/san-pham/[slug]`.
 *
 * The point of this file is what a component test cannot show: that the
 * Product's identity, first image and description are in the HTML the server
 * sends before any browser JavaScript runs, that the page and its metadata share
 * exactly one backend read per request, and that four different internal reasons
 * for "you may not see this" arrive at one indistinguishable public 404.
 */
import { publicProductDetail } from '@embroidery/api-client';
import { renderToStaticMarkup } from 'react-dom/server';

import ProductDetailPage, { generateMetadata } from '../../src/app/san-pham/[slug]/page';
import {
  makePublicDetail,
  makePublicDetailWithoutDescription,
  publicDetailEnvelope,
  safeNotFoundError,
  serverError,
} from '../support/product-detail-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductDetail: jest.fn(),
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw notFoundError;
  }),
}));

const detailMock = publicProductDetail as jest.MockedFunction<typeof publicProductDetail>;

beforeEach(() => {
  detailMock.mockReset();
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
});

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function renderPage(slug: string): Promise<string> {
  const element = await ProductDetailPage(params(slug));
  return renderToStaticMarkup(element);
}

describe('server-rendered Product Detail', () => {
  it('puts identity, first media and description in the server HTML', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).toContain('Gấu bông thêu tay');
    expect(html).toContain('Thú bông');
    expect(html).toContain('Câu chuyện về tác phẩm');
    expect(html).toContain('khu vườn nhỏ sau nhà bà ngoại');
    expect(html).toContain('/api/public/products/gau-bong-theu-tay/media/m-1/catalog-preview');
    expect(detailMock).toHaveBeenCalledTimes(1);
  });

  it('renders exactly one h1 and adds no second landmark', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('<main');
    expect(html).not.toContain('id="main-content"');
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
  });

  it('never renders price, currency or the stock flag', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).not.toContain('450000');
    expect(html).not.toContain('VND');
    expect(html.toLowerCase()).not.toContain('hết hàng');
  });

  it('omits the story section entirely when the Product has no description', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetailWithoutDescription()));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).not.toContain('Câu chuyện về tác phẩm');
    expect(html).toContain('Gấu bông thêu tay');
  });

  it('links back into Discover truthfully', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).toContain('href="/kham-pha"');
    expect(html).toContain('href="/kham-pha?category=thu-bong"');
    expect(html).toContain('Khám phá tất cả');
    expect(html).toContain('Khám phá Thú bông');
  });

  it('states the empty-media case without offering a zoom affordance', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail({ media: [] })));

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).toContain('Chưa có ảnh cho tác phẩm này');
    expect(html).not.toContain('Nhấn vào ảnh để mở chế độ xem lớn');
    expect(html).not.toContain('Xem ảnh 1 trên');
  });

  it('omits the thumbnail strip for a single image', async () => {
    detailMock.mockResolvedValue(
      publicDetailEnvelope(
        makePublicDetail({
          media: [{ role: 'GALLERY', url: '/api/public/products/x/media/m-1/catalog-preview' }],
        }),
      ),
    );

    const html = await renderPage('gau-bong-theu-tay');

    expect(html).not.toContain('Xem ảnh 1 trên 1');
    expect(html).toContain('/api/public/products/x/media/m-1/catalog-preview');
  });
});

describe('safe not-found matrix', () => {
  // The API collapses unknown / DRAFT / ARCHIVED / non-public category into one
  // 404 on purpose. The page must not widen that back out.
  it.each(['unknown slug', 'DRAFT', 'ARCHIVED', 'non-public category'])(
    'renders the same public not-found for %s',
    async (_reason) => {
      detailMock.mockRejectedValue(safeNotFoundError());
      await expect(renderPage('gau-bong-theu-tay')).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('rejects a malformed slug without calling the API at all', async () => {
    await expect(renderPage('Not A Slug')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('does not turn a server failure into "this artwork does not exist"', async () => {
    detailMock.mockRejectedValue(serverError(500));
    await expect(renderPage('gau-bong-theu-tay')).rejects.toThrow(
      'The product detail request failed.',
    );
  });

  it('leaks no internal detail from a failed request', async () => {
    const leaky = serverError(500);
    leaky.message = 'ECONNREFUSED postgres://user:secret@db:5432 requestId=abc-123';
    detailMock.mockRejectedValue(leaky);

    await expect(renderPage('gau-bong-theu-tay')).rejects.toThrow(
      'The product detail request failed.',
    );
  });
});

describe('metadata', () => {
  it('prefers SEO title and description over the Product fields', async () => {
    detailMock.mockResolvedValue(
      publicDetailEnvelope(
        makePublicDetail({
          seo: { title: 'SEO title', description: 'SEO desc', isIndexable: true },
        }),
      ),
    );

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta.title).toBe('SEO title');
    expect(meta.description).toBe('SEO desc');
  });

  it('falls back to the Product name and description', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta.title).toBe('Gấu bông thêu tay');
    expect(meta.description).toContain('khu vườn nhỏ sau nhà bà ngoại');
  });

  it('omits description when neither SEO nor the Product carries one', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetailWithoutDescription()));

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta.description).toBeUndefined();
  });

  it('maps isIndexable onto robots and always follows', async () => {
    detailMock.mockResolvedValue(
      publicDetailEnvelope(makePublicDetail({ seo: { isIndexable: false } })),
    );

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('emits the relative canonical from the route helper and fabricates no host', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    const canonical = meta.alternates?.canonical;
    expect(canonical).toBe('/san-pham/gau-bong-theu-tay');
    // A plain relative string, not a URL object built around a fabricated host.
    expect(typeof canonical).toBe('string');
    expect(canonical as string).not.toMatch(/^https?:/);
  });

  it('describes nothing for a Product the visitor may not see', async () => {
    detailMock.mockRejectedValue(safeNotFoundError());

    // Metadata takes the not-found boundary rather than returning empty tags:
    // it resolves before the render, which is the earliest point the decision
    // can be made, and it guarantees the title never names a hidden Product.
    await expect(generateMetadata(params('gau-bong-theu-tay'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('leaves a genuine failure to the page, so it is not reported as missing', async () => {
    detailMock.mockRejectedValue(serverError(503));

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta).toEqual({});
  });

  it('invents no structured data, price schema or social image', async () => {
    detailMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));

    const meta = await generateMetadata(params('gau-bong-theu-tay'));

    expect(meta.openGraph).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain('schema.org');
    expect(JSON.stringify(meta)).not.toContain('450000');
  });
});
