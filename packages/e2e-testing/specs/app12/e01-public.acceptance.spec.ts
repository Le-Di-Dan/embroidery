/**
 * `APP12-E01` — the public-surface half of the Wave-1 regression: CSP and the
 * security headers (§20, §3.6) and the public SEO truth (§21).
 *
 * ### A separate project, and that is the point
 *
 * Every case here is an **anonymous** visitor. It runs in its own Playwright
 * project, so its browser context has never held an `ORDER_ACCESS` grant or an
 * operator session. A public-surface assertion made in a context that had would
 * report a page as publicly correct when it was only correct for someone already
 * signed in, and no amount of clearing state afterwards is as trustworthy as
 * never having had it.
 *
 * ### `/mua-hang/[slug]` is the one that was missing
 *
 * `FU-APP12-H02-03`: the `APP12-H02` Chromium CSP pass covered the public reads
 * and the Admin, and left checkout out — the one Wave-1 surface that is a client
 * island over a server-rendered page, and therefore the one most likely to need
 * an inline script. So it is covered here against a purchasable SKU, with a real
 * listener installed before the document's own first script runs.
 *
 * ### What is reused rather than re-run
 *
 * `APP12-H06` owns the SEO matrix: seven Products spanning `AggregateOffer`, a
 * single `Offer`, no offer, `noindex`, `DRAFT`, `ARCHIVED` and the ambiguous
 * exclusion, against its own fixture. That suite is E01 evidence by being run,
 * not by being copied. What is asserted here is the §21 **sanity** half on the
 * commerce fixture this run already has: that the offer a customer could act on
 * agrees with the price and availability the catalog publishes, that a Product
 * nobody may see answers a real 404, and that the structurally unbuyable variant
 * offers no buying control.
 */
import { expect, test, type Page } from '@playwright/test';

import { recordCspViolations, securityHeadersOf } from './support/h01-security';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; the orchestrator owns this run's environment.`);
  }
  return value;
}

const PRODUCT_SLUG = (): string => requiredEnv('E2E_APP12_S02_PRODUCT_SLUG');
const MAIN_SKU = (): string => requiredEnv('E2E_APP12_S02_MAIN_SKU');
const AMBIGUOUS_SKU = (): string => requiredEnv('E2E_APP12_S02_AMBIGUOUS_SKU');

/** Safe facts only. Printed at the end so the report can quote the run. */
const proofs: Record<string, boolean | number | string> = {};

test.afterAll(() => {
  process.stdout.write(`[app12-e01-public] ${JSON.stringify(proofs)}\n`);
});

function detailPath(): string {
  return `/san-pham/${PRODUCT_SLUG()}`;
}

function checkoutPath(skuId: string, quantity = '1'): string {
  const query = new URLSearchParams({ sku: skuId, quantity });
  return `/mua-hang/${PRODUCT_SLUG()}?${query.toString()}`;
}

/** Every JSON-LD document on the page, parsed. A parse failure fails the test. */
async function jsonLdOfType(
  page: Page,
  type: string,
): Promise<Record<string, unknown> | undefined> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw
    .map((text) => JSON.parse(text) as Record<string, unknown>)
    .find((doc) => doc['@type'] === type);
}

/**
 * A violation that means executable code was blocked.
 *
 * The distinction matters. A blocked font or image is a resource policy decision
 * and may be entirely intended; a blocked `script-src` or an `eval` is a page
 * that needs the policy relaxed to work, which is the thing §3.6 forbids trading
 * away. So the gate is the executable directives, named explicitly.
 */
const EXECUTABLE_DIRECTIVES = ['script-src', 'script-src-elem', 'script-src-attr'];

test.describe('§20 · §3.6 Content-Security-Policy in a real Chromium', () => {
  for (const surface of [
    { label: 'product-detail', path: () => detailPath() },
    { label: 'checkout', path: () => checkoutPath(MAIN_SKU()) },
    { label: 'secure-order-entry', path: () => '/truy-cap/don-hang' },
  ]) {
    test(`${surface.label} runs with no executable-inline violation`, async ({ page }) => {
      // Installed through an init script, so the listener exists before the
      // document's own first script — a violation caused by hydration itself is
      // caught rather than missed.
      const readViolations = await recordCspViolations(page);
      const response = await page.goto(surface.path(), { waitUntil: 'load' });
      expect(response, `no response for ${surface.label}`).not.toBeNull();

      const headers = securityHeadersOf(response!);
      const csp = headers['content-security-policy'];
      expect(csp, `${surface.label} carries a Content-Security-Policy`).toBeDefined();
      // The policy is not weakened to make the page work. Asserted positively so
      // a future relaxation fails here rather than passing silently.
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp, 'the policy does not allow arbitrary inline script').not.toContain(
        "script-src 'unsafe-inline'",
      );

      // Give hydration a moment to have run and violated, if it was going to.
      await page.waitForTimeout(1_000);
      const violations = await readViolations();
      const executable = violations.filter((violation) =>
        EXECUTABLE_DIRECTIVES.some((directive) => violation.directive.startsWith(directive)),
      );
      expect(
        executable,
        `${surface.label} blocked executable code: ${JSON.stringify(executable)}`,
      ).toHaveLength(0);
      proofs[`csp:${surface.label}`] = violations.length;
    });
  }

  test('every public surface names neither its framework nor its server version', async ({
    page,
  }) => {
    for (const path of [detailPath(), checkoutPath(MAIN_SKU()), '/truy-cap/don-hang']) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      const headers = securityHeadersOf(response!);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect('x-powered-by' in headers, `${path} names no framework`).toBe(false);
      const server = headers['server'];
      if (server !== undefined) {
        expect(/\d/.test(server), `${path}'s Server header carries no version`).toBe(false);
      }
    }
  });

  test('the two private surfaces stay out of the index', async ({ page }) => {
    for (const path of [checkoutPath(MAIN_SKU()), '/truy-cap/don-hang']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const robots = await page
        .locator('meta[name="robots"]')
        .getAttribute('content')
        .catch(() => null);
      expect(robots, `${path} declares a robots policy`).not.toBeNull();
      expect(robots).toContain('noindex');
    }
  });
});

test.describe('§21 public truth', () => {
  test('an in-stock Product answers 200 and publishes an offer that agrees with it', async ({
    page,
  }) => {
    const response = await page.goto(detailPath(), { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const product = await jsonLdOfType(page, 'Product');
    expect(product, 'the Product page publishes Product structured data').toBeDefined();

    // The offer block, whichever shape the price range produced. Both are legal;
    // what must hold is that it exists, is priced in VND, and says the thing is
    // buyable — because the page is simultaneously offering a buying control.
    const offers = product?.['offers'] as Record<string, unknown> | undefined;
    expect(offers, 'the Product publishes an offer').toBeDefined();
    expect(String(offers?.['priceCurrency'])).toBe('VND');
    const availability = JSON.stringify(offers?.['availability'] ?? offers);
    expect(availability, 'the published availability is in stock').toContain('InStock');

    // …and the page really does offer a way to buy, so the structured data is
    // not describing a different page than the one a customer sees.
    //
    // The control is asserted in the state this Product is genuinely in rather
    // than in the state a one-variant Product would be: three variants means
    // nothing is preselected (`APP12-S01`), so the affordance on first paint is
    // the disabled `Mua ngay` button that becomes a link once a size is chosen.
    // What must not be true is the sold-out presentation — that would be the
    // page contradicting the `InStock` it just published.
    const panel = page.getByRole('region', { name: 'Mua sản phẩm có sẵn' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Mua ngay' })).toBeVisible();
    await expect(panel.getByText('Hiện chưa có phân loại nào còn hàng.')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Tạm hết hàng' })).toHaveCount(0);
    proofs['offerCurrency'] = 'VND';
  });

  test('a nonexistent Product is a real 404, not a soft one', async ({ page }) => {
    // The transport is the only place this can be observed: the `H01-F06` soft
    // 404 had a correct body and a 200 status line.
    const response = await page.goto('/san-pham/e01-khong-ton-tai', {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(404);
    proofs['missingProductStatus'] = 404;
  });

  test('a structurally unbuyable variant offers no buying control', async ({ page }) => {
    // The ambiguous variant carries two SKUs priced outside any legitimate
    // range — the state the Admin write side forbids and the read side has to
    // survive. §21 asks what the public behaviour actually *is*, so this records
    // it: the route is reachable and it refuses to sell.
    const response = await page.goto(checkoutPath(AMBIGUOUS_SKU()), {
      waitUntil: 'domcontentloaded',
    });
    const status = response?.status() ?? 0;
    proofs['ambiguousCheckoutStatus'] = status;

    if (status === 200) {
      // Reachable, but with nothing to act on: no submit, and no price a
      // customer could be held to.
      await expect(page.getByRole('button', { name: 'Đặt hàng' })).toHaveCount(0);
    } else {
      expect(status, 'an unbuyable SKU is refused rather than half-sold').toBeGreaterThanOrEqual(
        400,
      );
    }
  });
});
