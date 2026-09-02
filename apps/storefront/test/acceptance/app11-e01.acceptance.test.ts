/**
 * `APP11-E01` — the phase-outcome claims of bounded cross-boundary acceptance.
 *
 * ### What this file is, and what it deliberately is not
 *
 * E01's eleven cases are a **live** exercise: an Admin session authors, orders,
 * publishes and unpublishes a real Gallery entry while the Storefront, the API
 * and the gateway all run, and the evidence for that lives in
 * `docs/implementation/reports/APP11-E01-COMPLETION-REPORT.md`. A Jest process
 * cannot hold a staff session, so this file does not pretend to re-run those
 * journeys and it is not a substitute for them.
 *
 * What it does own are the four claims E01 established that are **about the
 * shape of the phase as a whole** rather than about any one checkpoint — the
 * claims that would silently rot if nothing pinned them, and that no
 * checkpoint-owned suite is responsible for:
 *
 * 1. **The route authority is exact.** APP11 closed at eighteen Storefront
 *    pages, having added six; a nineteenth may only arrive with the checkpoint
 *    that owns it (`APP12-S02`'s checkout did), never by accident.
 * 2. **Discover and Gallery are two capabilities, not one.** `APP11-G01`
 *    predicted the Gallery feed at Discover's `5 / 3 / 2`; the delivered
 *    authority is `3 / 2 / 1` against Discover's unchanged `5 / 3 / 2`. E01
 *    reconciled that stale prediction, and this pins the reconciliation so a
 *    later reader cannot re-derive the wrong invariant.
 * 3. **The content system has no backend.** Zero content-page operations in the
 *    committed contract — the pages are static authority in this repository.
 * 4. **One predicate contains the category divergence.** `FU-APP11-S04-C1-02`
 *    is a live contract/data divergence E01 classified as non-blocking
 *    *because* the Storefront narrows every category link through a single
 *    function. If the breadcrumb and the continuation CTA ever stopped sharing
 *    it, they could disagree about whether a category is addressable and the
 *    containment argument would no longer hold.
 *
 * Each assertion reads the shipped source or the committed contract, so it
 * fails on the change that would invalidate it rather than on a restated
 * constant.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const STOREFRONT_SRC = join(__dirname, '..', '..', 'src');
const APP_ROUTER_ROOT = join(STOREFRONT_SRC, 'app');
const OPENAPI_PATH = join(REPO_ROOT, 'packages', 'contracts', 'openapi', 'openapi.generated.json');

/** Every App Router page, as a route path, discovered from the tree on disk. */
function collectPageRoutes(dir: string, prefix = ''): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routes.push(...collectPageRoutes(full, `${prefix}/${entry}`));
    } else if (entry === 'page.tsx') {
      routes.push(prefix === '' ? '/' : prefix);
    }
  }
  return routes;
}

function readSource(...segments: string[]): string {
  return readFileSync(join(STOREFRONT_SRC, ...segments), 'utf8');
}

/**
 * The masonry column count a feature declares at each breakpoint.
 *
 * Read from the SCSS variables rather than from a compiled rule so the test
 * names the same three numbers a designer would change, and so a rename of the
 * selector does not silently pass.
 */
function declaredColumns(scss: string): { mobile: string; tablet: string; desktop: string } {
  const read = (name: string): string => {
    const declared = scss.match(new RegExp(`\\$columns-${name}:\\s*(\\d+)\\s*;`))?.[1];
    if (declared === undefined) throw new Error(`no $columns-${name} declared`);
    return declared;
  };
  return { mobile: read('mobile'), tablet: read('tablet'), desktop: read('desktop') };
}

describe('APP11-E01 — Storefront route authority', () => {
  /**
   * The pages the Storefront serves. APP11 exited with eighteen; `APP12-S02`
   * added the nineteenth. Written out rather than counted so a
   * *swap* — one route deleted and another added — fails as loudly as an
   * unannounced twentieth would.
   *
   * `robots.ts` and `sitemap.ts` are framework metadata routes and are
   * deliberately absent: they are not pages and are never counted as such.
   */
  const EXPECTED_ROUTES = [
    '/',
    '/bo-suu-tap',
    '/bo-suu-tap/[slug]',
    '/cau-hoi-thuong-gap',
    '/chinh-sach/[slug]',
    '/cua-hang',
    '/dich-vu',
    '/kham-pha',
    // `APP12-S02` — Ready-Made checkout. The one route that checkpoint adds.
    '/mua-hang/[slug]',
    '/san-pham/[slug]',
    '/san-pham/[slug]/thiet-ke',
    '/truy-cap',
    '/truy-cap/bao-gia',
    '/truy-cap/duyet-thiet-ke',
    '/truy-cap/thanh-toan',
    '/truy-cap/thanh-toan-con-lai',
    '/xac-minh-lien-he',
    '/yeu-cau/da-gui',
    '/yeu-cau/moi',
  ];

  it('ships exactly the nineteen pages the Storefront serves today', () => {
    expect(collectPageRoutes(APP_ROUTER_ROOT).sort()).toEqual(EXPECTED_ROUTES);
  });

  /**
   * The three aliases `APP11-G01-C1` rejected when it locked `/bo-suu-tap` as
   * the single Gallery address. A second address for one capability splits its
   * link equity and gives the sitemap a duplicate to exclude, so the absence is
   * an outcome worth pinning rather than an accident of never having typed it.
   */
  it('publishes no rejected Gallery alias route', () => {
    const routes = collectPageRoutes(APP_ROUTER_ROOT);
    for (const alias of ['/collections', '/gallery', '/thu-vien']) {
      expect(routes).not.toContain(alias);
    }
  });

  /**
   * A blog or Journal would be a content *type* the phase never delivered, and
   * the shared content-page system is explicitly not a CMS. Neither may arrive
   * as a route without its own checkpoint.
   */
  it('ships no blog or Journal surface', () => {
    const routes = collectPageRoutes(APP_ROUTER_ROOT).join(' ');
    expect(routes).not.toMatch(/blog|journal|tin-tuc/i);
  });
});

describe('APP11-E01 — Discover and Gallery are distinct capabilities', () => {
  const discover = readSource('features', 'product-discovery', 'styles', 'product-discovery.scss');
  const gallery = readSource('features', 'gallery-feed', 'styles', '_gallery-tokens.scss');

  /**
   * Product Discover was delivered at `APP2-S01` and APP11 was not permitted to
   * redesign it. `5 / 3 / 2` at desktop / tablet / mobile is the measurement
   * E01 re-confirmed live at 1440 / 1024 / 390.
   */
  it('keeps Product Discover at 5 / 3 / 2', () => {
    expect(declaredColumns(discover)).toEqual({ desktop: '5', tablet: '3', mobile: '2' });
  });

  /**
   * The Gallery feed's own density, from `APP11-D01`. `APP11-G01`'s exit text
   * predicted Discover's numbers here; the delivered design is deliberately
   * sparser because a Gallery card carries a variable-height image and a
   * description rather than a fixed product tile.
   */
  it('keeps the Gallery feed at 3 / 2 / 1', () => {
    expect(declaredColumns(gallery)).toEqual({ desktop: '3', tablet: '2', mobile: '1' });
  });

  /**
   * The reconciliation itself: whatever the two densities become, they may not
   * become the *same* density, because that would mean one of the two feeds had
   * been redesigned into the other.
   */
  it('never lets the two feeds share one density', () => {
    expect(declaredColumns(discover)).not.toEqual(declaredColumns(gallery));
  });
});

describe('APP11-E01 — the content system has no backend', () => {
  const contract = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };

  /**
   * `APP11-G01` found that `07-ADMIN-OPERATIONS` carries no content-page
   * section, so no CMS was ever specified. The four content routes are static
   * authority in `features/content-pages`. An operation appearing here would
   * mean a CMS had been introduced without the checkpoint that decides it.
   */
  it('exposes no content-page operation', () => {
    const contentPaths = Object.keys(contract.paths).filter((path) => /content-?page/i.test(path));
    expect(contentPaths).toEqual([]);
  });

  /**
   * The gallery-asset preparation family `APP11-B03A` added. E01's OpenAPI
   * delta reconciliation turns on these two existing: `APP11-G01` predicted
   * `+11` operations for the phase and the accepted baseline carries `+13`,
   * the difference being exactly this pair. Their absence would not merely
   * change a count — it would remove the only route by which a catalog asset
   * becomes publishable Gallery media.
   */
  it('carries the two APP11-B03A gallery-asset operations', () => {
    expect(contract.paths['/api/admin/gallery-assets']?.post).toBeDefined();
    expect(contract.paths['/api/admin/gallery-assets/{assetId}/{rendition}']?.get).toBeDefined();
  });
});

describe('APP12-C01-C1 — the category divergence is removed, not contained', () => {
  const breadcrumb = readSource('features', 'product-detail', 'model', 'product-breadcrumb.ts');
  const continuation = readSource(
    'features',
    'product-detail',
    'components',
    'detail-continue-discover.tsx',
  );
  const discoverNav = readSource(
    'features',
    'product-discovery',
    'components',
    'discover-category-nav.tsx',
  );
  const staticRoutes = readSource('features', 'storefront-seo', 'model', 'public-static-routes.ts');

  /**
   * ## What this block used to assert, and why it no longer can
   *
   * `FU-APP11-S04-C1-02`: the committed contract declared a closed category enum
   * the running API did not honour (`ao-thun-cotton` carries `ao-thun`). E01
   * classified that non-blocking **on the evidence that the Storefront never
   * emits a link for a category Discover cannot render** — enforced by both
   * linking surfaces narrowing through `toDiscoverCategorySlug`, a predicate
   * over four compiled slugs.
   *
   * That containment was correct for a divergence it could not fix. `APP12-C01`
   * fixed the contract half and `APP12-C01-C1` fixed the Storefront half: the
   * category set is the `categories` table, Discover lists from it, and a
   * Product is publicly visible only when its category is published and not
   * archived. There is no divergence left to contain, and the predicate — along
   * with the compiled list behind it — is gone.
   *
   * So the invariant inverts. What must be proved now is that **no compiled
   * category list has come back**, on any of the four surfaces that used to
   * carry one.
   */
  it.each([
    ['the Product breadcrumb', breadcrumb],
    ['the Continue Discovering CTA', continuation],
    ['the Discover category navigation', discoverNav],
    ['the static Storefront route inventory', staticRoutes],
  ])('holds no compiled category list in %s', (_name, source) => {
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');

    for (const removed of [
      'toDiscoverCategorySlug',
      'DISCOVER_CATEGORY_SLUGS',
      'LEGACY_CATEGORY_SLUGS',
      'LegacyCategorySlug',
    ]) {
      expect({ removed, present: code.includes(removed) }).toEqual({ removed, present: false });
    }
    // And no historical value survives as a literal either.
    for (const slug of ['thu-bong', 'quan-ao', 'khac']) {
      expect({ slug, present: code.includes(`'${slug}'`) }).toEqual({ slug, present: false });
    }
  });

  /**
   * The two linking surfaces still guard, but on **syntax** rather than
   * membership: a slug is interpolated into a URL this page publishes, and a
   * malformed value must not become an advertised address. That is a rule this
   * app owns; which categories exist is not.
   */
  it.each([
    ['the Product breadcrumb', breadcrumb],
    ['the Continue Discovering CTA', continuation],
  ])('guards the href in %s on slug shape, not on a taxonomy', (_name, source) => {
    expect(source).toContain('isCategorySlugShape');

    const calls = [...source.matchAll(/buildDiscoverHref\(([^)]*)\)/g)].map((call) =>
      (call[1] ?? '').trim(),
    );
    expect(calls.length).toBeGreaterThan(0);
    // Built from the Product's own category slug, never from a narrowed
    // stand-in for it.
    expect(calls.every((argument) => argument.includes('categorySlug'))).toBe(true);
  });

  /**
   * Each surface's own degradation is preserved, so a later edit cannot swap one
   * for the other: the crumb may vanish, the CTA may not.
   */
  it('drops the category crumb rather than advertising a malformed one', () => {
    // The category level is spread in conditionally and collapses to `[]`, so a
    // trail can still lose it — the one degradation the crumb is allowed.
    expect(breadcrumb).toMatch(/hasLinkableCategory[\s\S]{0,200}:\s*\[\]\)/);
  });

  it('keeps the continuation CTA pointed at unfiltered Discover', () => {
    expect(continuation).toMatch(/isCategorySlugShape[\s\S]{0,120}DISCOVER_ROUTE/);
  });

  /**
   * And the positive half: the chip row and the sitemap are built from the
   * inventory the API serves, so a category the operator publishes reaches both
   * with no deployment.
   */
  it('builds the Discover chips from the API inventory', () => {
    expect(discoverNav).toContain('toDiscoverChips');
    expect(discoverNav).toContain('categories');
  });

  it('keeps category URLs out of the fixed route inventory entirely', () => {
    const code = staticRoutes.replaceAll(/\/\*[\s\S]*?\*\//g, '');

    expect(code).not.toContain('buildDiscoverHref');
    expect(code).not.toContain('category=');
  });
});
