/**
 * @jest-environment node
 *
 * Static boundary checks on the gallery feed's production source (`APP11-S02`,
 * with the two S03 handoffs taken).
 *
 * These guard the rules a rendering test cannot reach: which routes exist,
 * which API operations the **feed** may touch, and that no alias was created.
 *
 * Two assertions here were written to invert when `APP11-S03` landed, and have:
 * the route set gained `/bo-suu-tap/[slug]`, and the segment that had to be
 * absent must now be present. Everything the feed itself must not do is
 * unchanged and still asserted — most importantly that the feed consumes the
 * *list* operation and not the detail resolver, which belongs to a different
 * feature.
 *
 * Every route assertion is **enumerated**, never a blanket "nothing else may
 * exist". `APP11-S04` and `APP11-S05` add their own lines and delete their own
 * entries from `ROUTES_OWNED_BY_LATER_CHECKPOINTS`; nothing here has to be torn
 * out to let APP11 finish.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  isStorefrontNavRouteActive,
  STOREFRONT_GALLERY_ROUTE,
} from '../../src/features/storefront-shell/model/storefront-navigation';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'gallery-feed');
const SHELL_DIR = join(__dirname, '..', '..', 'src', 'features', 'storefront-shell');
const HOMEPAGE_DIR = join(__dirname, '..', '..', 'src', 'features', 'homepage');
const ROUTE_FILE = join(APP_DIR, 'bo-suu-tap', 'page.tsx');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `/bo-suu-tap/[slug]` until S03"). Matching against them
 * would make every well-documented file fail its own rule, so the checks run on
 * code only.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

function collect(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

/** Every browser route the Storefront serves, as App Router segment paths. */
function routeSegments(): string[] {
  return collect(APP_DIR, /^page\.tsx$/)
    .map((path) => relative(APP_DIR, path).split(sep).slice(0, -1).join('/'))
    .map((segment) => `/${segment}`)
    .sort();
}

/**
 * The Storefront's route set at the time of reading.
 *
 * `APP11-S02` left it at 13 and this list said so. `APP11-S03` added
 * `/bo-suu-tap/[slug]` — the line this file's own header anticipated — so the
 * list gains one entry rather than being loosened into a "contains" check. The
 * count stays exact: what these assertions are for is noticing a route nobody
 * meant to add.
 */
const ROUTES_AT_S05 = [
  '/',
  '/bo-suu-tap',
  '/bo-suu-tap/[slug]',
  '/cau-hoi-thuong-gap',
  '/chinh-sach/[slug]',
  '/cua-hang',
  '/dich-vu',
  '/kham-pha',
  // Added by `APP12-S02` — the Ready-Made checkout, the one route it adds.
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
].sort();

/**
 * The four routes `APP11-S05` delivered.
 *
 * This list held the *absence* of each one until S05, for the reason the header
 * states: the approved design draws them, but a route may not exist before the
 * checkpoint that owns its content. S05 built them, so the assertion inverts —
 * and what it now guards is stricter than what it replaced. Each singular route
 * is a page; `/chinh-sach` is deliberately **not**, because the policy family
 * is one dynamic route and a parent index would be a page with nothing on it.
 */
const ROUTES_DELIVERED_BY_S05 = [
  ['dich-vu', 'APP11-S05 — Service page'],
  ['cau-hoi-thuong-gap', 'APP11-S05 — FAQ page'],
  ['cua-hang', 'APP11-S05 — Local/store page'],
] as const;

/** Rejected aliases for the S05 areas. No alias and no redirect is approved. */
const REJECTED_S05_ALIASES = ['faq', 'lien-he', 'store', 'policy'] as const;

/** Rejected spellings of this area. No alias and no redirect is approved. */
const REJECTED_GALLERY_ALIASES = ['thu-vien', 'gallery', 'collections'] as const;

const galleryCode = codeOnly(
  [
    ...collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => readFileSync(path, 'utf8')),
    readFileSync(ROUTE_FILE, 'utf8'),
  ].join('\n'),
);

describe('gallery feed route boundary', () => {
  it('serves the feed route, and the Storefront serves nineteen in total', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    expect(routeSegments()).toEqual(ROUTES_AT_S05);
    expect(routeSegments()).toHaveLength(19);
  });

  it('has the entry detail route APP11-S03 owns, beneath the feed', () => {
    // This asserted the *absence* of the segment until `APP11-S03`: the card was
    // deliberately non-interactive while no detail route existed, and the two
    // had to land together so that neither a dead link nor an orphan route
    // could ship. They did, so the assertion inverts. What it still guards is
    // the shape: the entry sits directly beneath the feed, with no level
    // between them.
    expect(existsSync(join(APP_DIR, 'bo-suu-tap', '[slug]', 'page.tsx'))).toBe(true);
    expect(routeSegments().filter((segment) => segment.startsWith('/bo-suu-tap'))).toEqual([
      '/bo-suu-tap',
      '/bo-suu-tap/[slug]',
    ]);
  });

  it.each(REJECTED_GALLERY_ALIASES)('creates no /%s alias or redirect', (alias) => {
    expect(existsSync(join(APP_DIR, alias))).toBe(false);
    // Matched as a whole path literal, not as a substring: the feature directory
    // is `features/gallery-feed`, so a bare "contains /gallery" would fail on
    // its own import paths while catching no alias at all.
    expect(galleryCode).not.toMatch(new RegExp(`['"\`]/${alias}(?![-\\w])`));
  });

  it.each(ROUTES_DELIVERED_BY_S05)('serves /%s (%s)', (segment) => {
    expect(existsSync(join(APP_DIR, segment, 'page.tsx'))).toBe(true);
  });

  it('serves the policy family as one dynamic route, with no parent index page', () => {
    expect(existsSync(join(APP_DIR, 'chinh-sach', '[slug]', 'page.tsx'))).toBe(true);
    // A `/chinh-sach` page would be a list of four links the footer already
    // carries, and it is not in the sitemap, so it must not exist.
    expect(existsSync(join(APP_DIR, 'chinh-sach', 'page.tsx'))).toBe(false);
  });

  it.each(REJECTED_S05_ALIASES)('creates no /%s alias or redirect', (alias) => {
    expect(existsSync(join(APP_DIR, alias))).toBe(false);
  });

  it('writes the gallery path in exactly one production module', () => {
    // The shell owns it; the feed, the header item and the Homepage action all
    // read the same constant. A second literal is how an alias starts by
    // accident, so the only occurrence outside the shell is the App Router
    // directory name itself, which is not a string in any source file.
    const production = [
      ...collect(join(__dirname, '..', '..', 'src'), /\.(ts|tsx)$/).map((path) => ({
        path,
        text: codeOnly(readFileSync(path, 'utf8')),
      })),
    ].filter((source) => source.text.includes("'/bo-suu-tap'"));

    expect(production.map((source) => relative(SHELL_DIR, source.path))).toEqual([
      join('model', 'storefront-navigation.ts'),
    ]);
  });
});

describe('gallery feed data-source boundary', () => {
  it('consumes the delivered public list operation', () => {
    expect(galleryCode).toContain('publicGalleryEntryList');
  });

  it('consumes only the list — never the detail resolver or a later operation', () => {
    // `publicGalleryEntryDetail` now exists on the curated boundary, and this
    // is still correct: it belongs to the `gallery-detail` feature, and a feed
    // that also read one entry would be a second, unowned source of truth for
    // the same rows. The sitemap family is APP11-S04's, and no Admin gallery
    // operation belongs anywhere near an anonymous public surface.
    expect(galleryCode).not.toContain('publicGalleryEntryDetail');
    expect(galleryCode).not.toMatch(/publicSitemapEntry|adminGallery|adminAsset/);
  });

  it('streams no image bytes itself — covers are a path the server composed', () => {
    // `publicGalleryEntryAsset` returns a Blob. The browser reaches that route by
    // rendering `coverUrl`; application code never fetches it.
    expect(galleryCode).not.toContain('publicGalleryEntryAsset');
    // And the path is never composed locally from an id.
    expect(galleryCode).not.toMatch(/['"`]\/api\/public\/gallery-entries/);
    expect(galleryCode).not.toMatch(/thumbnail|catalog-preview/);
  });

  it('performs no linked-product lookup', () => {
    // `APP11-B03` deliberately omits the linked Product from the feed, so there
    // is no N+1 read to make and no price, cart or buy button to render.
    expect(galleryCode).not.toMatch(/publicProduct|buildStorefrontProductDetailPath/);
  });

  it('calls the API through the approved Axios client, never raw transport', () => {
    expect(galleryCode).not.toMatch(/\bfetch\(|XMLHttpRequest|axios\.(get|post)/);
  });

  it('sends only the two parameters the contract publishes', () => {
    expect(galleryCode).toMatch(/limit/);
    expect(galleryCode).toMatch(/cursor/);
    // No invented request shape: the contract has no status, search, category,
    // style, need, sort, offset or page selector to send.
    expect(galleryCode).not.toMatch(/\b(offset|pageNumber|categorySlug|sortBy|searchTerm)\b/);
  });

  it('keeps no server state in Zustand and does not poll', () => {
    expect(galleryCode).not.toMatch(/zustand|create\(\s*\(set/);
    expect(galleryCode).not.toMatch(/refetchInterval|setInterval/);
  });

  it('advances only on an explicit control — no viewport auto-load', () => {
    expect(galleryCode).not.toMatch(/IntersectionObserver|useContinuationSentinel|onScroll/);
  });
});

describe('gallery feed content boundary', () => {
  it('renders no internal identity, ordering or SEO fact', () => {
    // These are dropped by the projection, so they cannot be rendered even by
    // accident; this asserts the projection itself never re-admits them.
    const projection = readFileSync(join(FEATURE_DIR, 'model', 'gallery-feed.ts'), 'utf8');
    const shape = codeOnly(projection).slice(codeOnly(projection).indexOf('toGalleryFeedCard'));
    for (const dropped of [
      'galleryEntryId',
      'coverAssetId',
      'displayOrder',
      'isIndexable',
      'assetCount',
    ]) {
      expect(shape).not.toContain(dropped);
    }
  });

  it('carries no engineering commentary in its copy', () => {
    const copy = readFileSync(join(FEATURE_DIR, 'model', 'gallery-copy.ts'), 'utf8');
    // The catalog's own prose documents the rules and therefore names the
    // checkpoint; only the exported strings are user-facing.
    const strings = [...copy.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? '');
    for (const value of strings) {
      expect(value).not.toMatch(/APP11|S0\d|checkpoint|endpoint|cursor|API/i);
    }
  });

  it('takes its APP11-S04 SEO from the public helper and invents none', () => {
    // The rule this replaces was "S03 and S04 have not started". Both have:
    // the metadata routes exist and the feed requests its canonical and Open
    // Graph through the one public-only builder. What still holds is that the
    // feed composes no origin, no URL and no structured data itself — and, in
    // particular, promotes no entry's cover to og:image, because the leading
    // card changes whenever an operator reorders the feed.
    expect(existsSync(join(APP_DIR, 'sitemap.ts'))).toBe(true);
    expect(existsSync(join(APP_DIR, 'robots.ts'))).toBe(true);
    expect(galleryCode).toContain('publicPageMetadata');
    expect(galleryCode).not.toMatch(
      new RegExp('metadataBase|https?://|application/ld[+]json', 'i'),
    );
    expect(galleryCode).not.toMatch(/imagePath|og:image/i);
  });

  it('keeps the route segment thin — composition lives in the feature', () => {
    const statements = codeOnly(readFileSync(ROUTE_FILE, 'utf8'))
      .split('\n')
      .filter((line) => line.trim() !== '');
    // A bound, not an exact count: the segment may gain a metadata field
    // without this test becoming a chore, but it cannot quietly grow a page's
    // worth of composition back into the route file.
    expect(statements.length).toBeLessThanOrEqual(40);
    expect(codeOnly(readFileSync(ROUTE_FILE, 'utf8'))).toContain('<GalleryFeedScreen />');
  });
});

describe('navigation activation', () => {
  const shellCode = codeOnly(
    collect(SHELL_DIR, /\.(ts|tsx)$/)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n'),
  );
  const homepageCode = codeOnly(
    collect(HOMEPAGE_DIR, /\.(ts|tsx)$/)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n'),
  );

  it('routes the shell Bộ sưu tập item to the canonical constant', () => {
    expect(shellCode).toMatch(
      /\{ id: 'collections', label: 'Bộ sưu tập', route: STOREFRONT_GALLERY_ROUTE \}/,
    );
  });

  it('leaves the areas that are still unbuilt non-interactive', () => {
    // Studio has no landing page and Journal was deleted from the approved
    // Homepage; neither gains an href here.
    expect(shellCode).toMatch(/\{ id: 'studio', label: 'Studio', route: null \}/);
    expect(shellCode).toMatch(/\{ id: 'journal', label: 'Nhật ký', route: null \}/);
  });

  it('marks the section active for a descendant route, ready for S03', () => {
    // Behaviour, not a grep: exact equality alone would un-mark Bộ sưu tập the
    // moment /bo-suu-tap/[slug] lands, and a naive prefix would wrongly mark it
    // for an unrelated /bo-suu-tap-cu.
    expect(isStorefrontNavRouteActive('/bo-suu-tap', STOREFRONT_GALLERY_ROUTE)).toBe(true);
    expect(isStorefrontNavRouteActive('/bo-suu-tap/ky-niem', STOREFRONT_GALLERY_ROUTE)).toBe(true);
    expect(isStorefrontNavRouteActive('/bo-suu-tap-cu', STOREFRONT_GALLERY_ROUTE)).toBe(false);
    expect(isStorefrontNavRouteActive('/kham-pha', STOREFRONT_GALLERY_ROUTE)).toBe(false);
    // Home stays exact-only; every path descends from '/'.
    expect(isStorefrontNavRouteActive('/bo-suu-tap', '/')).toBe(false);
  });

  it('marks the active item through the shared matcher, not a local comparison', () => {
    const navLink = codeOnly(
      readFileSync(join(SHELL_DIR, 'components', 'storefront-nav-link.tsx'), 'utf8'),
    );
    expect(navLink).toContain('isStorefrontNavRouteActive(pathname, route)');
    expect(navLink).not.toContain('pathname === route');
  });

  it('points the Homepage Collections section at the same constant', () => {
    expect(homepageCode).toContain('HOMEPAGE_GALLERY_ROUTE');
    expect(homepageCode).toContain('STOREFRONT_GALLERY_ROUTE');
    // The Homepage links to the feed, never to one entry.
    expect(homepageCode).not.toMatch(/\/bo-suu-tap\//);
  });
});

describe('gallery feed stylesheet boundary', () => {
  it('splits its styles into partials, each inside the 400-line source limit', () => {
    const stylesheets = collect(join(FEATURE_DIR, 'styles'), /\.scss$/);
    expect(stylesheets.length).toBeGreaterThan(1);
    for (const sheet of stylesheets) {
      const lines = readFileSync(sheet, 'utf8').split('\n').length;
      // Paired with the path so a failure names the offending stylesheet.
      expect([relative(FEATURE_DIR, sheet), lines <= 400]).toEqual([
        relative(FEATURE_DIR, sheet),
        true,
      ]);
    }
  });

  it('is composed into the app entry point, so the compile gate covers it', () => {
    const main = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'main.scss'), 'utf8');
    expect(main).toContain("@use '../features/gallery-feed/styles/gallery-feed';");
  });

  it('uses UI05 density, not the UI02 product density', () => {
    const tokens = readFileSync(join(FEATURE_DIR, 'styles', '_gallery-tokens.scss'), 'utf8');
    expect(tokens).toMatch(/\$columns-mobile:\s*1;/);
    expect(tokens).toMatch(/\$columns-tablet:\s*2;/);
    expect(tokens).toMatch(/\$columns-desktop:\s*3;/);
  });

  it('never fixes a card to one ratio or reorders for visual balance', () => {
    const masonry = readFileSync(join(FEATURE_DIR, 'styles', '_gallery-masonry.scss'), 'utf8');
    // The card image keeps its natural height; only the placeholder — which
    // depicts no artwork — carries a ratio.
    expect(masonry).toMatch(/\.gallery-feed__card-image[\s\S]*?height: auto;/);
    expect(masonry).not.toMatch(/^\s*order:/m);
  });
});
