/**
 * @jest-environment node
 *
 * Static boundary checks on the Homepage's production source (`APP11-S01`).
 *
 * These guard the rules a rendering test cannot reach: which API operations the
 * Homepage may touch, which routes it may claim, and that the CP0 placeholder is
 * gone from the shipped segment rather than merely hidden.
 *
 * Every route assertion below is **enumerated**, never a blanket "nothing else
 * may exist". A later canonical checkpoint adds its route to `ROUTES_AT_S05` and
 * deletes its own line from `ROUTES_OWNED_BY_LATER_CHECKPOINTS`; nothing here has
 * to be torn out to let APP11 finish.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'homepage');
const ROUTE_FILE = join(APP_DIR, 'page.tsx');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `/dich-vu` until S05"). Matching against them would make
 * every well-documented file fail its own rule, so the checks run on code only.
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
 * The Storefront's route set. `APP11-S01` left it at twelve (route delta zero);
 * `APP11-S02` added `/bo-suu-tap`. A checkpoint that legitimately adds a route
 * adds it here in the same change that builds it.
 */
const ROUTES_AT_S05 = [
  '/',
  // Added by `APP11-S02`, which also activated the Collections action below.
  // The route and its link landed together, exactly as S01 staged them.
  '/bo-suu-tap',
  // Added by `APP11-S03`, which did not extend this list — so this check had
  // been failing since that checkpoint. `APP11-S04` brings it current.
  '/bo-suu-tap/[slug]',
  '/cau-hoi-thuong-gap',
  '/chinh-sach/[slug]',
  '/cua-hang',
  '/dich-vu',
  '/kham-pha',
  // Added by `APP12-S02` — the Ready-Made checkout, the one route that
  // checkpoint adds. Wave 1, `noindex`, and absent from the sitemap.
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

const featureSources = collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path: relative(FEATURE_DIR, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

const homepageCode = codeOnly(
  [...featureSources.map((source) => source.text), readFileSync(ROUTE_FILE, 'utf8')].join('\n'),
);

describe('Homepage route boundary', () => {
  it('keeps `/` as the Homepage and adds no alias for it', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    expect(routeSegments()).toEqual(ROUTES_AT_S05);
  });

  it.each(ROUTES_DELIVERED_BY_S05)('does not link to /%s from the Homepage (%s)', (segment) => {
    // S05 built these routes, but the Homepage composition APP11-S01 delivered
    // staged no Service affordance and S05 invented none: `APP11-S05` §18 says
    // to activate only an affordance already present in approved authority.
    // The footer store-presentation block is the discovery path.
    expect(homepageCode).not.toContain(`/${segment}`);
  });

  it('builds Product Detail links through the shell builder, never from an id', () => {
    expect(homepageCode).toContain('buildStorefrontProductDetailPath');
    expect(homepageCode).not.toMatch(/['"`]\/san-pham\/\$\{/);
  });
});

describe('Homepage data-source boundary', () => {
  it('consumes no public gallery or sitemap operation', () => {
    expect(homepageCode).not.toMatch(/publicGalleryEntry|publicSitemapEntry|galleryEntry_/);
  });

  it('reuses the delivered APP2 product discovery operation and adds no other', () => {
    expect(homepageCode).toContain('publicProductList');
    expect(homepageCode).not.toMatch(/adminGallery|adminProduct/);
  });

  it('issues exactly one catalog read for the whole page', () => {
    const calls = homepageCode.match(/publicProductList\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('calls the API through the approved Axios client, never raw transport', () => {
    expect(homepageCode).not.toMatch(/\bfetch\(|XMLHttpRequest|axios\.(get|post)/);
  });

  it('has no load-more or infinite-scroll machinery', () => {
    expect(homepageCode).not.toMatch(/nextCursor|useInfiniteQuery|IntersectionObserver|loadMore/);
  });
});

describe('Homepage content boundary', () => {
  it('carries no CP0 scaffold copy anywhere in the shipped source', () => {
    expect(homepageCode).not.toMatch(/Embroidery Commerce Storefront|Ứng dụng storefront|CP0/i);
  });

  it('ships no Journal, blog or news feature', () => {
    expect(existsSync(join(APP_DIR, 'nhat-ky'))).toBe(false);
    expect(existsSync(join(__dirname, '..', '..', 'src', 'features', 'journal'))).toBe(false);
    expect(homepageCode).not.toMatch(/journal|blog/i);
  });

  it('takes its SEO infrastructure from the APP11-S04 helper, inventing none', () => {
    // The rule this replaces was "S04 has not started". It has: the metadata
    // routes exist, and the Homepage requests its canonical and Open Graph
    // through the one public-only builder. What still holds — and is the part
    // worth guarding — is that the page composes no URL, no origin and no
    // structured data of its own.
    expect(existsSync(join(APP_DIR, 'sitemap.ts'))).toBe(true);
    expect(existsSync(join(APP_DIR, 'robots.ts'))).toBe(true);
    expect(homepageCode).toContain('publicPageMetadata');
    expect(homepageCode).not.toMatch(
      new RegExp('metadataBase|https?://|application/ld[+]json', 'i'),
    );
    // No social image: the store has no canonical one, and a featured Product's
    // photo promoted here would silently become that policy.
    expect(homepageCode).not.toMatch(/imagePath|og:image/i);
  });

  it('keeps the route segment thin — composition lives in the feature', () => {
    const segment = readFileSync(ROUTE_FILE, 'utf8');
    const statements = codeOnly(segment)
      .split('\n')
      .filter((line) => line.trim() !== '');
    // A bound, not an exact count: the segment may gain a metadata field without
    // this test becoming a chore, but it cannot quietly grow a page's worth of
    // composition back into the route file.
    expect(statements.length).toBeLessThanOrEqual(15);
    expect(codeOnly(segment)).toContain('<HomepageScreen />');
  });
});

describe('Homepage stylesheet boundary', () => {
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
    expect(main).toContain("@use '../features/homepage/styles/homepage';");
  });
});
