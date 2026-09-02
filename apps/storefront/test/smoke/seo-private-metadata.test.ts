/**
 * @jest-environment node
 *
 * The private-route indexing matrix (`APP11-S04`, `FU-APP11-G01-07`).
 *
 * `APP11-G01` warned that adding global SEO infrastructure is exactly how a
 * secure route quietly acquires a public identity: Next merges metadata field by
 * field down the segment tree, so a root `openGraph` would be inherited by every
 * route that did not think to override it. The Storefront's root carries only
 * `metadataBase` for that reason, and public Open Graph is *requested* by each
 * public page rather than inherited.
 *
 * This file asserts the consequence for all nine private routes at once: each
 * declares `noindex`, and none carries a canonical URL, an `og:url` or an
 * `og:image` — including the five whose directives `APP11-G01` had not verified.
 *
 * The static-metadata routes are read as modules. `/san-pham/[slug]/thiet-ke` is
 * dynamic, so its `generateMetadata` is driven against a real Product.
 */
import type { Metadata } from 'next';

import { publicProductDetail } from '@embroidery/api-client';

import { makePublicDetail, publicDetailEnvelope } from '../support/product-detail-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductDetail: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const productMock = publicProductDetail as jest.MockedFunction<typeof publicProductDetail>;

beforeEach(() => {
  productMock.mockReset();
  // Set deliberately: the point is that a configured origin still produces no
  // public URL on these routes. An unset one would prove nothing.
  process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://shop.example.test';
  process.env.INTERNAL_API_BASE_URL = 'http://api:4000/api';
});

/**
 * The nine private routes whose metadata is a static object.
 *
 * `/mua-hang/[slug]` joined them at `APP12-S02`. It is a **dynamic** segment
 * whose metadata is nevertheless a static object, and deliberately so: a
 * checkout title derived from the Product, the SKU or the quantity would put
 * per-customer state into a browser history and a shared screenshot. So it is
 * driven here exactly like the eight static routes, and the same three
 * assertions apply — `noindex`, no canonical, no Open Graph.
 */
const STATIC_PRIVATE_ROUTES: readonly [string, () => Promise<{ metadata: Metadata }>][] = [
  ['/truy-cap', () => import('../../src/app/truy-cap/page')],
  ['/truy-cap/bao-gia', () => import('../../src/app/truy-cap/bao-gia/page')],
  ['/truy-cap/duyet-thiet-ke', () => import('../../src/app/truy-cap/duyet-thiet-ke/page')],
  ['/truy-cap/thanh-toan', () => import('../../src/app/truy-cap/thanh-toan/page')],
  ['/truy-cap/thanh-toan-con-lai', () => import('../../src/app/truy-cap/thanh-toan-con-lai/page')],
  ['/xac-minh-lien-he', () => import('../../src/app/xac-minh-lien-he/page')],
  ['/yeu-cau/moi', () => import('../../src/app/yeu-cau/moi/page')],
  ['/yeu-cau/da-gui', () => import('../../src/app/yeu-cau/da-gui/page')],
  ['/mua-hang/[slug]', () => import('../../src/app/mua-hang/[slug]/page')],
];

/** The Studio, resolved through a real Product exactly as a visitor would. */
async function studioMetadata(): Promise<Metadata> {
  productMock.mockResolvedValue(publicDetailEnvelope(makePublicDetail()));
  const { generateMetadata } = await import('../../src/app/san-pham/[slug]/thiet-ke/page');
  return generateMetadata({ params: Promise.resolve({ slug: 'gau-bong-theu-tay' }) });
}

describe.each(STATIC_PRIVATE_ROUTES)('%s', (_route, load) => {
  it('declares noindex, nofollow', async () => {
    const { metadata } = await load();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('inherits no public canonical and no Open Graph payload', async () => {
    const { metadata } = await load();

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });

  it('carries no public URL, image or route-specific secret in its metadata', async () => {
    const serialized = JSON.stringify((await load()).metadata);

    expect(serialized).not.toContain('https://shop.example.test');
    expect(serialized).not.toMatch(/og:|opengraph/i);
    // A static route title such as "Thanh toán" is accepted; a token, request
    // id, order id, payment reference or contact detail never is. These routes
    // resolve their subject from a fragment the server never sees, so there is
    // nothing request-shaped for a static object to have captured.
    expect(serialized).not.toMatch(/#t=|token|requestId|orderId|@|\+84/i);
  });
});

describe('/san-pham/[slug]/thiet-ke', () => {
  it('declares noindex, nofollow (FU-APP11-G01-07)', async () => {
    // `follow` was `true` before `APP11-S04`, alone among the private routes. A
    // page a crawler is told not to index is not a page whose outbound links it
    // should be mining.
    expect((await studioMetadata()).robots).toEqual({ index: false, follow: false });
  });

  it('publishes no canonical, which a private working surface must not claim', async () => {
    // It carried a self-canonical before `APP11-S04`. A canonical tag is a
    // request to index *this* address — the opposite of the directive beside it,
    // and with `metadataBase` now set it would have resolved to a real absolute
    // URL for a per-Product design tool.
    expect((await studioMetadata()).alternates).toBeUndefined();
  });

  it('inherits no Open Graph payload and names no public origin', async () => {
    const metadata = await studioMetadata();

    expect(metadata.openGraph).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('https://shop.example.test');
  });

  it('still resolves its Product, so only the metadata boundary changed', async () => {
    expect((await studioMetadata()).title).toContain('Gấu bông thêu tay');
    expect(productMock).toHaveBeenCalled();
  });
});
