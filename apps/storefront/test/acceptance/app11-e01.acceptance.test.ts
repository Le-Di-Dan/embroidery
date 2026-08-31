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
 * 1. **The route authority is final.** Eighteen Storefront pages, an exact set.
 *    APP11 closes having added six and it may not add a nineteenth by accident.
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
   * The eighteen pages APP11 exits with. Written out rather than counted so a
   * *swap* — one route deleted and another added — fails as loudly as a
   * nineteenth would.
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

  it('ships exactly the eighteen pages APP11 closes with', () => {
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

describe('APP11-E01 — one predicate contains the category divergence', () => {
  const breadcrumb = readSource('features', 'product-detail', 'model', 'product-breadcrumb.ts');
  const continuation = readSource(
    'features',
    'product-detail',
    'components',
    'detail-continue-discover.tsx',
  );

  /**
   * `FU-APP11-S04-C1-02`: the committed contract declares a closed category
   * enum that the running API does not honour (`ao-thun-cotton` carries
   * `ao-thun`). E01 classified that as non-blocking for APP11 **on the evidence
   * that the Storefront never emits a link for a category Discover cannot
   * render** — and that argument is only true while both category-linking
   * surfaces narrow through the same predicate.
   *
   * Two surfaces, one predicate: a crumb and a continuation CTA can then never
   * disagree, and a future contract change moves both at once.
   */
  it.each([
    ['the Product breadcrumb', breadcrumb],
    ['the Continue Discovering CTA', continuation],
  ])('narrows the category in %s before building an href', (_name, source) => {
    expect(source).toContain('toDiscoverCategorySlug');
  });

  /**
   * The narrowing must actually *guard* the href. Importing the predicate and
   * then composing the link from the raw slug anyway would satisfy the check
   * above while reintroducing the 404.
   *
   * The two surfaces degrade differently, and correctly so: the breadcrumb
   * **drops the category level** (a trail may not name a place it cannot link
   * to), while the continuation CTA **keeps its second link and points it at
   * unfiltered Discover** (deleting it would let a data defect quietly remove a
   * section of an approved design). What they share is the invariant that
   * matters — `buildDiscoverHref` is only ever reached with the narrowed value,
   * never with the raw one the API returned.
   */
  it.each([
    ['the Product breadcrumb', breadcrumb],
    ['the Continue Discovering CTA', continuation],
  ])('builds a category href in %s only from the narrowed slug', (_name, source) => {
    const calls = [...source.matchAll(/buildDiscoverHref\(([^)]*)\)/g)].map((call) =>
      (call[1] ?? '').trim(),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((argument) => argument === 'canonicalSlug')).toBe(true);
  });

  /**
   * And each surface's own degradation, so a later edit cannot swap one for the
   * other: the crumb must be able to vanish, the CTA must not.
   */
  it('drops the category crumb rather than linking it', () => {
    expect(breadcrumb).toMatch(/canonicalSlug === undefined[\s\S]{0,40}\?\s*\[\]/);
  });

  it('keeps the continuation CTA pointed at unfiltered Discover', () => {
    expect(continuation).toMatch(/canonicalSlug === undefined[\s\S]{0,40}DISCOVER_ROUTE/);
  });
});
