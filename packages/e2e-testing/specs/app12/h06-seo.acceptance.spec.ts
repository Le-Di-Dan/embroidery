/**
 * `APP12-H06` — Wave-1 SEO and public readiness, in a real browser.
 *
 * Real Chromium against the real production-mode Storefront process, served
 * through the real Nginx gateway, reading the real API over a disposable
 * PostgreSQL carrying the migration chain and a clearly test-only catalog.
 * Nothing is mocked and nothing is written: every case is an anonymous GET.
 *
 * ## What each group proves, and why it needs a live rig
 *
 * The metadata builders are unit-tested next to the code. What only a running
 * stack can answer is what the *transport* and the *rendered document* say:
 *
 * - a status line. The `H01-F06` soft 404 was a status defect with a correct
 *   body, and no unit test can observe a status Next writes while streaming.
 * - which tags actually survive Next's field-by-field metadata merge, including
 *   the ones a page never wrote and inherited from the root layout.
 * - whether a `<script type="application/ld+json">` parses, and what the API
 *   really published into it for price and availability.
 * - whether an `og:image` can be fetched.
 *
 * ## Reading the head
 *
 * Every assertion goes through the DOM rather than through a regular expression
 * over the HTML, so an attribute this suite claims is absent is absent from the
 * parsed document rather than merely unmatched by a pattern.
 */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const INDEXABLE_CATEGORY = process.env['E2E_APP12_H06_INDEXABLE_CATEGORY'] ?? '';
const NONINDEXABLE_CATEGORY = process.env['E2E_APP12_H06_NONINDEXABLE_CATEGORY'] ?? '';
const AGGREGATE_PRODUCT = process.env['E2E_APP12_H06_AGGREGATE_PRODUCT'] ?? '';
const SINGLE_OFFER_PRODUCT = process.env['E2E_APP12_H06_SINGLE_OFFER_PRODUCT'] ?? '';
const NO_OFFER_PRODUCT = process.env['E2E_APP12_H06_NO_OFFER_PRODUCT'] ?? '';
const NOINDEX_PRODUCT = process.env['E2E_APP12_H06_NOINDEX_PRODUCT'] ?? '';
const IN_NOINDEX_CATEGORY_PRODUCT = process.env['E2E_APP12_H06_IN_NOINDEX_CATEGORY_PRODUCT'] ?? '';
const DRAFT_PRODUCT = process.env['E2E_APP12_H06_DRAFT_PRODUCT'] ?? '';
const ARCHIVED_PRODUCT = process.env['E2E_APP12_H06_ARCHIVED_PRODUCT'] ?? '';
const GALLERY = process.env['E2E_APP12_H06_GALLERY'] ?? '';
const NOINDEX_GALLERY = process.env['E2E_APP12_H06_NOINDEX_GALLERY'] ?? '';
const UNKNOWN = process.env['E2E_APP12_H06_UNKNOWN_SLUG'] ?? '';
const ORIGIN = (process.env['E2E_BASE_STOREFRONT'] ?? '').replace(/\/$/, '');

/** The brand `BRD0-F02` locked and `APP12-H06` §7 makes canonical. */
const BRAND = 'Nét Thêu';
/** The wordmark it replaced. It may not appear in any published metadata. */
const STALE_BRAND = 'Xưởng Thêu';

/** Amounts the fixture seeded, restated so a drift breaks here loudly. */
const LOW_PRICE = '399000';
const HIGH_PRICE = '520000';
const SINGLE_PRICE = '250000';
const AMBIGUOUS_LOW_PRICE = '111000';
const AMBIGUOUS_HIGH_PRICE = '900000';

test.beforeAll(() => {
  expect(
    AGGREGATE_PRODUCT,
    'The orchestrator must export the seeded fixture slugs (run via `pnpm e2e:app12:h06`).',
  ).not.toBe('');
  expect(ORIGIN, 'The orchestrator must export the public origin.').not.toBe('');
});

/** The `content` of a `<meta>`, or `null` when the tag is absent entirely. */
async function meta(page: Page, selector: string): Promise<string | null> {
  const node = page.locator(`head > meta[${selector}]`);
  return (await node.count()) === 0 ? null : node.first().getAttribute('content');
}

async function robotsMeta(page: Page): Promise<string | null> {
  return meta(page, 'name="robots"');
}

async function canonical(page: Page): Promise<string | null> {
  const node = page.locator('head > link[rel="canonical"]');
  return (await node.count()) === 0 ? null : node.first().getAttribute('href');
}

/**
 * Whether a published URL names the same address as the expected one.
 *
 * Compared after URL normalization rather than as strings, for one measured
 * reason. The builder composes the Homepage canonical as `<origin>/`, and Next
 * emits it as `<origin>` — the framework drops the root path's trailing slash
 * because `trailingSlash` is false. RFC 3986 §6.2.3 makes an empty path
 * equivalent to `/`, so the two are the same address and `new URL().href`
 * resolves both to the same string.
 *
 * This is a normalization, not a relaxation: every other difference — a
 * different host, a different path, a surviving query parameter — still fails,
 * which is what the `utm_source` case immediately below depends on.
 */
function sameAddress(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  return new URL(actual).href === new URL(expected).href;
}

/** Every JSON-LD document on the page, parsed. A parse failure fails the test. */
async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((text) => JSON.parse(text) as Record<string, unknown>);
}

async function jsonLdOfType(
  page: Page,
  type: string,
): Promise<Record<string, unknown> | undefined> {
  return (await jsonLd(page)).find((doc) => doc['@type'] === type);
}

/** Navigates and returns the transport status of the document response itself. */
async function statusOf(page: Page, path: string): Promise<number> {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `no response for ${path}`).not.toBeNull();
  return response?.status() ?? 0;
}

test.describe('APP12-H06 · HTTP status integrity', () => {
  // The defect `H01-F06` recorded, and the three neighbours it never named.
  // `APP2-S02` and `APP12-H01` both concluded the 200 was an unfixable framework
  // limitation; it was a `loading.tsx` Suspense boundary flushing the head
  // before the page could decide, and the fix is a segment layout that renders
  // outside it. A regression would restore the 200 silently, which is precisely
  // why the status is asserted rather than the not-found copy.
  test('an unknown product slug answers 404, not a soft 404', async ({ page }) => {
    expect(await statusOf(page, `/san-pham/${UNKNOWN}`)).toBe(404);
  });

  test('a malformed product slug answers 404 without reaching the API', async ({ page }) => {
    expect(await statusOf(page, '/san-pham/-khong-hop-le-')).toBe(404);
    expect(await statusOf(page, '/san-pham/CHU%20HOA')).toBe(404);
  });

  test('a DRAFT product answers 404', async ({ page }) => {
    expect(await statusOf(page, `/san-pham/${DRAFT_PRODUCT}`)).toBe(404);
  });

  test('an ARCHIVED product answers 404', async ({ page }) => {
    expect(await statusOf(page, `/san-pham/${ARCHIVED_PRODUCT}`)).toBe(404);
  });

  test('an unknown gallery entry answers 404', async ({ page }) => {
    expect(await statusOf(page, `/bo-suu-tap/${UNKNOWN}`)).toBe(404);
  });

  test('an unknown category answers 404', async ({ page }) => {
    expect(await statusOf(page, '/kham-pha?category=khong-co-danh-muc-nay')).toBe(404);
  });

  test('published public surfaces answer 200', async ({ page }) => {
    for (const path of [
      '/',
      '/kham-pha',
      `/kham-pha?category=${INDEXABLE_CATEGORY}`,
      `/kham-pha?category=${NONINDEXABLE_CATEGORY}`,
      '/bo-suu-tap',
      `/san-pham/${AGGREGATE_PRODUCT}`,
      `/san-pham/${NOINDEX_PRODUCT}`,
      `/bo-suu-tap/${GALLERY}`,
    ]) {
      expect(await statusOf(page, path), path).toBe(200);
    }
  });

  // A not-found page must not be canonicalised onto a real Product: that would
  // ask a crawler to merge a dead address into a live one (`APP12-H06` §6).
  test('a not-found product page publishes no canonical to a real product', async ({ page }) => {
    await page.goto(`/san-pham/${UNKNOWN}`, { waitUntil: 'domcontentloaded' });
    const href = await canonical(page);
    if (href !== null) {
      expect(href).not.toContain(AGGREGATE_PRODUCT);
    }
  });
});

test.describe('APP12-H06 · canonical URLs and brand', () => {
  test('each public surface self-canonicalises through the configured origin', async ({ page }) => {
    const cases: readonly (readonly [string, string])[] = [
      ['/', `${ORIGIN}/`],
      ['/kham-pha', `${ORIGIN}/kham-pha`],
      [
        `/kham-pha?category=${INDEXABLE_CATEGORY}`,
        `${ORIGIN}/kham-pha?category=${INDEXABLE_CATEGORY}`,
      ],
      ['/bo-suu-tap', `${ORIGIN}/bo-suu-tap`],
      [`/san-pham/${AGGREGATE_PRODUCT}`, `${ORIGIN}/san-pham/${AGGREGATE_PRODUCT}`],
      [`/bo-suu-tap/${GALLERY}`, `${ORIGIN}/bo-suu-tap/${GALLERY}`],
    ];
    for (const [path, expected] of cases) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(sameAddress(await canonical(page), expected), path).toBe(true);
      expect(sameAddress(await meta(page, 'property="og:url"'), expected), path).toBe(true);
    }
  });

  // Only the category parameter survives. The canonical is rebuilt from the
  // resolved selection rather than echoed, so an appended tracking parameter
  // cannot enter it.
  test('a tracking parameter never reaches the canonical', async ({ page }) => {
    await page.goto(`/kham-pha?category=${INDEXABLE_CATEGORY}&utm_source=h06&fbclid=abc`, {
      waitUntil: 'domcontentloaded',
    });
    expect(await canonical(page)).toBe(`${ORIGIN}/kham-pha?category=${INDEXABLE_CATEGORY}`);
  });

  test('no public localhost or unconfigured host is published', async ({ page }) => {
    for (const path of ['/', '/kham-pha', `/san-pham/${AGGREGATE_PRODUCT}`]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const head = (await page.locator('head').innerHTML()).toLowerCase();
      expect(head, path).not.toContain('localhost');
      expect(head, path).not.toContain('127.0.0.1');
    }
  });

  test('the canonical brand is published and the stale wordmark is not', async ({ page }) => {
    for (const path of ['/', '/kham-pha', '/bo-suu-tap']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(await page.title(), path).toContain(BRAND);
      expect(await page.title(), path).not.toContain(STALE_BRAND);
      expect(await meta(page, 'property="og:site_name"'), path).toBe(BRAND);
    }
  });

  // The operator's own SEO title is published verbatim: a brand suffix appended
  // to it would overrule a decision this app does not own.
  test('a product publishes the operator SEO title and description verbatim', async ({ page }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    expect(await page.title()).toBe('Áo thun thêu tay H06');
    expect(await meta(page, 'name="description"')).toBe(
      'Mô tả SEO do người vận hành soạn cho H06.',
    );
    expect(await meta(page, 'property="og:title"')).toBe('Áo thun thêu tay H06');
    expect(await meta(page, 'property="og:site_name"')).toBe(BRAND);
  });

  // A Product with no description of its own must not inherit the root layout's
  // app-wide fallback and publish the store's blurb as the artwork's own.
  //
  // Next merges metadata field by field down the segment tree, so an omitted
  // `description` silently becomes the root layout's sentence — measured on the
  // running stack before the fix, identical on every description-less Product.
  // The builder now emits `null`, Next's explicit "no value, do not inherit",
  // so the tag disappears rather than lying. Open Graph falls back to the same
  // field, which is why both are asserted absent.
  test('a product without a description publishes none rather than inheriting', async ({
    page,
  }) => {
    await page.goto(`/san-pham/${SINGLE_OFFER_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    expect(await meta(page, 'name="description"')).toBeNull();
    expect(await meta(page, 'property="og:description"')).toBeNull();
  });
});

test.describe('APP12-H06 · indexability', () => {
  test('an indexable category state is indexable and self-canonical', async ({ page }) => {
    await page.goto(`/kham-pha?category=${INDEXABLE_CATEGORY}`, { waitUntil: 'domcontentloaded' });
    expect(await robotsMeta(page)).toContain('index');
    expect(await robotsMeta(page)).not.toContain('noindex');
  });

  // `is_indexable = false` is the operator saying *do not index this filter*.
  // The category stays a first-class, browsable, linked filter — indexability is
  // not visibility — and is simply not indexed.
  test('a non-indexable category is usable but noindex', async ({ page }) => {
    const status = await statusOf(page, `/kham-pha?category=${NONINDEXABLE_CATEGORY}`);
    expect(status).toBe(200);
    expect(await robotsMeta(page)).toContain('noindex');
    expect(await canonical(page)).toBe(`${ORIGIN}/kham-pha?category=${NONINDEXABLE_CATEGORY}`);
  });

  test('a noindex product is readable and noindex', async ({ page }) => {
    expect(await statusOf(page, `/san-pham/${NOINDEX_PRODUCT}`)).toBe(200);
    expect(await robotsMeta(page)).toContain('noindex');
    expect(await canonical(page)).toBe(`${ORIGIN}/san-pham/${NOINDEX_PRODUCT}`);
  });

  test('a noindex gallery entry is readable and noindex', async ({ page }) => {
    expect(await statusOf(page, `/bo-suu-tap/${NOINDEX_GALLERY}`)).toBe(200);
    expect(await robotsMeta(page)).toContain('noindex');
  });

  test('checkout is noindex and carries no customer or order identifier', async ({ page }) => {
    expect(await statusOf(page, `/mua-hang/${AGGREGATE_PRODUCT}?quantity=1`)).toBe(200);
    const robots = await robotsMeta(page);
    expect(robots).toContain('noindex');
    expect(robots).toContain('nofollow');
    expect(await canonical(page)).toBeNull();
    expect(await meta(page, 'property="og:url"')).toBeNull();
    expect(await page.title()).toContain(BRAND);
  });

  test('the secure order surface is noindex', async ({ page }) => {
    expect(await statusOf(page, '/truy-cap/don-hang')).toBe(200);
    const robots = await robotsMeta(page);
    expect(robots).toContain('noindex');
    expect(robots).toContain('nofollow');
    expect(await canonical(page)).toBeNull();
    expect(await meta(page, 'property="og:url"')).toBeNull();
  });
});

test.describe('APP12-H06 · Product structured data', () => {
  test('several priced SKUs publish an AggregateOffer over the real range', async ({ page }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const doc = await jsonLdOfType(page, 'Product');
    expect(doc, 'no Product JSON-LD on the page').toBeDefined();
    expect(doc?.['name']).toBe('Áo thun H06');
    expect(doc?.['url']).toBe(`${ORIGIN}/san-pham/${AGGREGATE_PRODUCT}`);

    const offers = doc?.['offers'] as Record<string, unknown>;
    expect(offers['@type']).toBe('AggregateOffer');
    expect(offers['priceCurrency']).toBe('VND');

    // The whole point of the fixture's pricing. The ambiguous variant's two
    // SKUs sit outside the range on both sides, so a regression that stopped
    // excluding them — the exclusion mirroring the purchase panel's refusal to
    // pick a winning SKU — moves these two numbers and this fails.
    expect(offers['lowPrice']).toBe(LOW_PRICE);
    expect(offers['highPrice']).toBe(HIGH_PRICE);
    expect(offers['offerCount']).toBe(3);

    const nested = offers['offers'] as Record<string, unknown>[];
    const prices = nested.map((offer) => offer['price']);
    expect(prices).not.toContain(AMBIGUOUS_LOW_PRICE);
    expect(prices).not.toContain(AMBIGUOUS_HIGH_PRICE);

    // Availability is per SKU and truthful: two in stock, one published with
    // zero available. `sold-out` is a real sellable SKU, not an omission.
    const availability = nested.map((offer) => offer['availability']);
    expect(availability.filter((value) => value === 'https://schema.org/InStock')).toHaveLength(2);
    expect(availability.filter((value) => value === 'https://schema.org/OutOfStock')).toHaveLength(
      1,
    );
  });

  test('exactly one offerable SKU publishes a single Offer', async ({ page }) => {
    await page.goto(`/san-pham/${SINGLE_OFFER_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const offers = (await jsonLdOfType(page, 'Product'))?.['offers'] as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    expect(offers['price']).toBe(SINGLE_PRICE);
    expect(offers['priceCurrency']).toBe('VND');
    expect(offers['availability']).toBe('https://schema.org/InStock');
    expect(offers['url']).toBe(`${ORIGIN}/san-pham/${SINGLE_OFFER_PRODUCT}`);
  });

  // A published Product with nothing sellable is an ordinary Product. It keeps
  // its document and simply has no `offers` — never a fabricated zero price and
  // never an invented `OutOfStock`.
  test('a product with nothing sellable publishes a Product with no offers', async ({ page }) => {
    await page.goto(`/san-pham/${NO_OFFER_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const doc = await jsonLdOfType(page, 'Product');
    expect(doc).toBeDefined();
    expect(doc?.['offers']).toBeUndefined();
  });

  test('the Product document invents no shipping, deposit or order total', async ({ page }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const doc = await jsonLdOfType(page, 'Product');
    for (const forbidden of [
      'shippingDetails',
      'priceValidUntil',
      'hasMerchantReturnPolicy',
      'aggregateRating',
      'review',
      'sku',
      'productID',
      'brand',
    ]) {
      expect(doc?.[forbidden], forbidden).toBeUndefined();
    }
    // No internal identity anywhere in the document — but the scan deliberately
    // excludes `image`.
    //
    // The public media path is `/api/public/products/<slug>/media/<assetId>/…`,
    // and that asset id is **existing public authority**: the contract describes
    // the field as a "relative application path served by the publication-gated
    // delivery route", it is the same URL `og:image` already publishes and the
    // page's own `<img>` already renders, and `APP12-H06` §8 bars a UUID only
    // where public authority does not already permit it. The identity this case
    // exists to catch is `skuId` and `productVariantId`, which live in `offers`
    // and must never appear.
    const { image: _image, ...withoutMedia } = doc ?? {};
    const serialized = JSON.stringify(withoutMedia);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  test('every JSON-LD document on a product page is valid JSON of a known type', async ({
    page,
  }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const docs = await jsonLd(page);
    expect(docs.length).toBeGreaterThanOrEqual(2);
    for (const doc of docs) {
      expect(doc['@context']).toBe('https://schema.org');
      expect(['Product', 'BreadcrumbList']).toContain(doc['@type']);
    }
  });
});

test.describe('APP12-H06 · media truth', () => {
  test('the product OpenGraph image and JSON-LD image are publicly retrievable', async ({
    page,
    request,
  }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });

    const ogImage = await meta(page, 'property="og:image"');
    expect(ogImage, 'the seeded product has media, so og:image must be present').not.toBeNull();
    await expectPubliclyRetrievable(request, ogImage ?? '');

    const images = (await jsonLdOfType(page, 'Product'))?.['image'] as string[];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      await expectPubliclyRetrievable(request, image);
    }
  });

  test('no storage locator reaches the rendered head', async ({ page }) => {
    await page.goto(`/san-pham/${AGGREGATE_PRODUCT}`, { waitUntil: 'domcontentloaded' });
    const head = (await page.locator('head').innerHTML()).toLowerCase();
    for (const locator of [
      'e2e-derivatives',
      'e2e-originals',
      'amazonaws',
      's3.',
      'minio',
      'storage_key',
      'thumbnail.webp',
      'catalog-preview.webp',
      'source.webp',
    ]) {
      expect(head, locator).not.toContain(locator);
    }
  });
});

async function expectPubliclyRetrievable(request: APIRequestContext, url: string): Promise<void> {
  expect(url.startsWith(`${ORIGIN}/`), `${url} is not on the public origin`).toBe(true);
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()['content-type'], url).toContain('image/');
}

test.describe('APP12-H06 · robots, sitemap and icon', () => {
  test('robots.txt fences the private families and advertises one sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();

    for (const disallowed of ['/truy-cap', '/xac-minh-lien-he', '/yeu-cau', '/thiet-ke']) {
      expect(body, disallowed).toContain(disallowed);
    }
    // The public entity families are deliberately NOT fenced: indexability is a
    // per-entity operator decision and belongs to each page's own directive.
    expect(body).not.toContain('Disallow: /san-pham\n');
    expect(body).not.toContain('Disallow: /bo-suu-tap\n');
    // The Admin application is a separate host and is not mapped here.
    expect(body.toLowerCase()).not.toContain('admin');
    expect(body).toContain(`${ORIGIN}/sitemap.xml`);
  });

  test('the sitemap carries indexable content and excludes everything else', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();

    for (const present of [
      `${ORIGIN}/`,
      `${ORIGIN}/kham-pha`,
      `${ORIGIN}/kham-pha?category=${INDEXABLE_CATEGORY}`,
      `${ORIGIN}/bo-suu-tap`,
      `${ORIGIN}/san-pham/${AGGREGATE_PRODUCT}`,
      `${ORIGIN}/bo-suu-tap/${GALLERY}`,
    ]) {
      expect(body, `missing ${present}`).toContain(present);
    }

    // The exclusions, each for its own reason: an operator's noindex decision,
    // a publication state, a secure surface, checkout, and Wave 2.
    for (const absent of [
      `category=${NONINDEXABLE_CATEGORY}`,
      NOINDEX_PRODUCT,
      NOINDEX_GALLERY,
      DRAFT_PRODUCT,
      ARCHIVED_PRODUCT,
      '/mua-hang',
      '/truy-cap',
      '/yeu-cau',
      '/xac-minh-lien-he',
      '/thiet-ke',
      '/chinh-sach/[slug]',
    ]) {
      expect(body, `must not advertise ${absent}`).not.toContain(absent);
    }
  });

  // The category half of the sitemap is database-derived, not a compiled enum.
  // The fixture's two categories were created by this run, so their presence and
  // absence together prove the read is live rather than built.
  test('the sitemap category URLs come from the database, not a fixed list', async ({
    request,
  }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain(`category=${INDEXABLE_CATEGORY}`);
    expect(body).not.toContain(`category=${NONINDEXABLE_CATEGORY}`);
  });

  test('the brand icon is served with the right content type', async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const href = await page.locator('head > link[rel="icon"]').first().getAttribute('href');
    expect(href, 'no <link rel="icon"> in the rendered head').not.toBeNull();

    const response = await request.get(href ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');

    // The approved mark, not a placeholder: the ink and ground are the locked
    // tokens and the gesture path is the one exported from the Figma master.
    const body = await response.text();
    expect(body).toContain('#171717');
    expect(body).toContain('#faf8f5');
    expect(body).toContain('M68.75 176.936');
  });
});

test.describe('APP12-H06 · metadata privacy', () => {
  // The head is published output. Nothing customer-shaped, secret-shaped or
  // infrastructural may appear in it on any surface the matrix visits — the
  // secure ones included, which is why they are in this list at all.
  const FORBIDDEN = [
    'order_access',
    'request_access',
    'step_up',
    'grant_token',
    'session=',
    'password',
    'secret',
    'bearer ',
    'postgres://',
    'internal_api_base_url',
    'embroidery_db7_',
  ] as const;

  test('no surface publishes a token, credential or infrastructure locator', async ({ page }) => {
    for (const path of [
      '/',
      '/kham-pha',
      `/kham-pha?category=${NONINDEXABLE_CATEGORY}`,
      `/san-pham/${AGGREGATE_PRODUCT}`,
      `/san-pham/${IN_NOINDEX_CATEGORY_PRODUCT}`,
      `/bo-suu-tap/${GALLERY}`,
      `/mua-hang/${AGGREGATE_PRODUCT}?quantity=1`,
      '/truy-cap/don-hang',
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const head = (await page.locator('head').innerHTML()).toLowerCase();
      for (const needle of FORBIDDEN) {
        expect(head, `${path} published ${needle}`).not.toContain(needle);
      }
    }
  });

  // A secure landing carries its grant in the URL fragment, which never leaves
  // the browser — but a page that copied it into a canonical or an `og:url`
  // would publish it. Neither tag exists on these routes at all.
  test('a secure surface publishes no canonical carrying a fragment value', async ({ page }) => {
    await page.goto('/truy-cap/don-hang#token=h06-synthetic-not-a-real-grant', {
      waitUntil: 'domcontentloaded',
    });
    const head = await page.locator('head').innerHTML();
    expect(head).not.toContain('h06-synthetic-not-a-real-grant');
    expect(await canonical(page)).toBeNull();
  });
});
