/**
 * @jest-environment node
 *
 * Static boundary checks on the gallery entry detail's production source
 * (`APP11-S03`).
 *
 * These guard the rules a rendering test cannot reach: which routes exist,
 * which API operations the feature may touch, that no alias or nested model was
 * created, that the flat gallery model was not quietly re-nested, and that the
 * SEO infrastructure `APP11-S04` owns has not been started early.
 *
 * Every route assertion is **enumerated**, never a blanket "nothing else may
 * exist". `APP11-S04` and `APP11-S05` add their own lines and delete their own
 * entries from `ROUTES_OWNED_BY_LATER_CHECKPOINTS`; nothing here has to be torn
 * out to let APP11 finish.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'gallery-detail');
const FEED_DIR = join(__dirname, '..', '..', 'src', 'features', 'gallery-feed');
const SHELL_DIR = join(__dirname, '..', '..', 'src', 'features', 'storefront-shell');
const ROUTE_DIR = join(APP_DIR, 'bo-suu-tap', '[slug]');
const ROUTE_FILE = join(ROUTE_DIR, 'page.tsx');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `/works/[slug]`"). Matching against them would make every
 * well-documented file fail its own rule, so the checks run on code only.
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

/** The Storefront's route set as `APP11-S03` leaves it: 13 -> 14. */
const ROUTES_AT_S05 = [
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
].sort();

/** Routes drawn by the approved APP11 design but owned by a later checkpoint. */
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

/** Rejected spellings of a gallery **entry** address. No alias, no redirect. */
const REJECTED_DETAIL_ALIASES = ['works', 'work', 'collections', 'gallery', 'thu-vien'] as const;

const detailCode = codeOnly(
  [
    ...collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => readFileSync(path, 'utf8')),
    ...collect(ROUTE_DIR, /\.tsx$/).map((path) => readFileSync(path, 'utf8')),
  ].join('\n'),
);

describe('gallery detail route boundary', () => {
  it('keeps its own route, and the Storefront now serves eighteen', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    expect(routeSegments()).toEqual(ROUTES_AT_S05);
    expect(routeSegments()).toHaveLength(18);
  });

  it.each(REJECTED_DETAIL_ALIASES)('creates no /%s detail alias or redirect', (alias) => {
    expect(existsSync(join(APP_DIR, alias))).toBe(false);
    // Matched as a whole path literal, not as a substring: the feature
    // directory is `features/gallery-detail`, so a bare "contains /gallery"
    // would fail on its own import paths while catching no alias at all.
    expect(detailCode).not.toMatch(new RegExp(`['"\`]/${alias}(?![-\\w])`));
  });

  it('creates no redirect or rewrite anywhere in the segment', () => {
    expect(detailCode).not.toMatch(/\bredirect\(|permanentRedirect\(|\brewrites\b/);
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

  it('composes the entry path from the one builder, never from a literal', () => {
    // The shell owns both the route constant and the builder, and the builder
    // composes from the constant rather than spelling the path a second time.
    // So the correct expectation is that NO production module — the shell
    // included — writes a `/bo-suu-tap/<something>` string at all. The App
    // Router directory is the only other occurrence of the path, and that is a
    // folder rather than a string. (`APP11-S02`'s own boundary suite already
    // pins the bare `'/bo-suu-tap'` constant to `storefront-navigation.ts`.)
    const production = collect(join(__dirname, '..', '..', 'src'), /\.(ts|tsx)$/)
      .map((path) => ({ path, text: codeOnly(readFileSync(path, 'utf8')) }))
      .filter((source) => /['"`]\/bo-suu-tap\//.test(source.text));

    expect(production.map((source) => relative(join(__dirname, '..', '..'), source.path))).toEqual(
      [],
    );

    const navigation = codeOnly(
      readFileSync(join(SHELL_DIR, 'model', 'storefront-navigation.ts'), 'utf8'),
    );
    expect(navigation).toContain('${STOREFRONT_GALLERY_ROUTE}/${encodeURIComponent(slug)}');
  });
});

describe('gallery detail data-source boundary', () => {
  it('consumes the delivered public detail operation', () => {
    expect(detailCode).toContain('publicGalleryEntryDetail');
  });

  it('consumes no Admin operation and nothing a later checkpoint owns', () => {
    expect(detailCode).not.toMatch(/adminGallery|adminAsset|adminProduct/);
    expect(detailCode).not.toMatch(/publicSitemapEntry/);
  });

  it('streams no image bytes itself — media are paths the server composed', () => {
    // `publicGalleryEntryAsset` returns a Blob. The browser reaches that route
    // by rendering `assets[].url`; application code never fetches it.
    expect(detailCode).not.toContain('publicGalleryEntryAsset');
    // And no media path is ever composed or rewritten locally.
    expect(detailCode).not.toMatch(/['"`]\/api\/public\/gallery-entries/);
    // Rendition *names* as string literals — the page must never build, name or
    // rewrite one. `thumbnailUrl` is deliberately not caught by this: it is a
    // field the linked-product projection carries, not a rendition this page
    // composes.
    expect(detailCode).not.toMatch(
      /['"`](catalog-preview|thumbnail|original|normalized|watermarked)['"`]/,
    );
    expect(detailCode).not.toMatch(/\.replace\(\s*['"`]catalog-preview/);
  });

  it('invents no second read to decorate the page with', () => {
    // No related-gallery query, no feed call to relabel as "related", and no
    // product lookup: the linked product arrives inside the detail response.
    expect(detailCode).not.toContain('publicGalleryEntryList');
    expect(detailCode).not.toMatch(/publicProductDetail|publicProductList/);
  });

  it('calls the API through the approved Axios client, never raw transport', () => {
    expect(detailCode).not.toMatch(/\bfetch\(|XMLHttpRequest|axios\.(get|post)/);
  });

  it('keeps no server state in Zustand and does not poll or refetch', () => {
    expect(detailCode).not.toMatch(/zustand|create\(\s*\(set/);
    expect(detailCode).not.toMatch(/refetchInterval|setInterval|useQuery|useInfiniteQuery/);
  });

  it('shares one request-scoped read between metadata and the page', () => {
    const service = codeOnly(
      readFileSync(join(FEATURE_DIR, 'services', 'gallery-detail.server.ts'), 'utf8'),
    );
    expect(service).toContain("import { cache } from 'react'");
    expect(service).toMatch(/export const loadGalleryDetail = cache\(/);

    // Both call sites go through that one loader, and neither calls the
    // generated operation directly.
    const route = codeOnly(readFileSync(ROUTE_FILE, 'utf8'));
    expect(route.match(/loadGalleryDetail\(slug\)/g)).toHaveLength(2);
    expect(route).not.toContain('publicGalleryEntryDetail(');
  });
});

describe('the flat gallery model', () => {
  it('names no parent collection, member work or nested aggregate', () => {
    expect(detailCode).not.toMatch(/memberWork|MemberWork|parentCollection|collectionMember/);
    expect(detailCode).not.toMatch(/\bworkCount\b|\bmemberCount\b/);
  });

  it('renders no per-image alt field or control', () => {
    // ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED: there is no column, no contract
    // field and nothing for an operator to author.
    expect(detailCode).not.toMatch(/\baltText\b|\bcaption\b/);
  });

  it('renders no internal identity or ordering fact', () => {
    const projection = codeOnly(
      readFileSync(join(FEATURE_DIR, 'model', 'gallery-detail-view.ts'), 'utf8'),
    );
    const shape = projection.slice(projection.indexOf('export function toGalleryDetailView'));
    for (const dropped of ['galleryEntryId', 'displayOrder', 'assetId', 'position', 'seo']) {
      expect(shape).not.toContain(dropped);
    }
  });

  it('carries no engineering commentary in its copy', () => {
    // The catalog's own prose documents the rules and therefore names the
    // checkpoint — and its English prose contains apostrophes that a naive
    // scan would read as string delimiters, so the comments are stripped before
    // the exported strings are collected. Only those are user-facing.
    const copy = codeOnly(
      readFileSync(join(FEATURE_DIR, 'model', 'gallery-detail-copy.ts'), 'utf8'),
    );
    const strings = [...copy.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? '');
    for (const value of strings) {
      expect(value).not.toMatch(/APP11|S0\d|checkpoint|endpoint|cursor|API/i);
    }
  });

  it('offers no shop affordance', () => {
    expect(detailCode).not.toMatch(/\bprice\b|\bcart\b|addToCart|checkout|inStock|outOfStock/i);
  });
});

describe('the SEO boundary APP11-S04 owns', () => {
  it('hard-codes no public origin anywhere', () => {
    expect(detailCode).not.toMatch(/https?:\/\//);
    expect(detailCode).not.toMatch(/localhost|embroidery\.local|\.vercel\.|\.com['"`]/);
  });

  it('declares no metadataBase of its own and generates no OG image route', () => {
    // `metadataBase` is root-layout infrastructure, declared once. Open Graph
    // now exists here, but composed by the shared public-only helper rather
    // than assembled locally — and there is still no `opengraph-image` route,
    // which would generate a picture rather than reference a published one.
    expect(detailCode).not.toMatch(/metadataBase|twitter:/i);
    expect(detailCode).toContain('publicPageMetadata');
    expect(existsSync(join(ROUTE_DIR, 'opengraph-image.ts'))).toBe(false);
    expect(existsSync(join(ROUTE_DIR, 'opengraph-image.tsx'))).toBe(false);
  });

  it('consumes the site-wide SEO infrastructure APP11-S04 delivered', () => {
    // These two files are the checkpoint. The assertion is inverted rather
    // than deleted so the boundary keeps naming what owns them.
    expect(existsSync(join(APP_DIR, 'sitemap.ts'))).toBe(true);
    expect(existsSync(join(APP_DIR, 'robots.ts'))).toBe(true);
  });

  it('emits its canonical through the one route builder, from contract facts', () => {
    // The path still comes from the single builder — `APP11-S04` changed only
    // what it resolves against — and the robots directive is still the
    // operator's own `isIndexable`, applied after the public block so the
    // block can never overwrite it.
    const route = codeOnly(readFileSync(ROUTE_FILE, 'utf8'));
    expect(route).toContain('path: buildStorefrontGalleryDetailPath(entry.slug)');
    expect(route).toContain('robots: { index: entry.seo.isIndexable, follow: true }');
  });

  it('adds no revalidation or static generation to a publication-gated page', () => {
    const route = codeOnly(readFileSync(ROUTE_FILE, 'utf8'));
    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).not.toMatch(/\brevalidate\b|generateStaticParams/);
  });
});

describe('feed activation and shell navigation', () => {
  const feedCode = codeOnly(
    collect(FEED_DIR, /\.(ts|tsx)$/)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n'),
  );

  it('activates the card action through the canonical route builder', () => {
    expect(feedCode).toContain('buildStorefrontGalleryDetailPath(card.slug)');
    // Never a locally composed address.
    expect(feedCode).not.toMatch(/`\/bo-suu-tap\/\$\{/);
  });

  it('keeps the card itself an article rather than a clickable tile', () => {
    const card = codeOnly(readFileSync(join(FEED_DIR, 'components', 'gallery-card.tsx'), 'utf8'));
    expect(card).toContain('<article className="gallery-feed__card">');
    expect(card).not.toMatch(/onClick|role="link"|tabIndex/);
  });

  it('reuses the shell section matcher, so the nav stays active on a detail path', () => {
    const navLink = codeOnly(
      readFileSync(join(SHELL_DIR, 'components', 'storefront-nav-link.tsx'), 'utf8'),
    );
    expect(navLink).toContain('isStorefrontNavRouteActive(pathname, route)');
    expect(navLink).not.toContain('pathname === route');
  });
});

describe('gallery detail stylesheet boundary', () => {
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
    expect(main).toContain("@use '../features/gallery-detail/styles/gallery-detail';");
  });

  it('crops the thumbnail but never the stage', () => {
    const media = readFileSync(join(FEATURE_DIR, 'styles', '_gallery-detail-media.scss'), 'utf8');
    // The stage keeps the natural ratio the approved authority requires; only
    // the navigation control is allowed to crop.
    expect(media).toMatch(/\.gallery-detail__stage-image[\s\S]*?object-fit: contain;/);
    expect(media).toMatch(/\.gallery-detail__thumbnail-image[\s\S]*?object-fit: cover;/);
    expect(media).not.toMatch(/\.gallery-detail__stage-image[\s\S]*?aspect-ratio:/);
  });

  it('honours reduced motion', () => {
    const lightbox = readFileSync(
      join(FEATURE_DIR, 'styles', '_gallery-detail-lightbox.scss'),
      'utf8',
    );
    expect(lightbox).toContain('prefers-reduced-motion: reduce');
  });
});
