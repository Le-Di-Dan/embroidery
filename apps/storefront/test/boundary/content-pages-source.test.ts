/**
 * @jest-environment node
 *
 * Static boundary checks on the `APP11-S05` content-page and footer source.
 *
 * S05's defining constraint is a negative one: APP11 has **no** content backend,
 * **no** Admin content CMS and **no** `content_pages` runtime API, and the whole
 * point of the checkpoint is that the Storefront content is typed static source
 * instead. A rendering test cannot see a forbidden import; this file can.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const CONTENT_DIR = join(__dirname, '..', '..', 'src', 'features', 'content-pages');
const FOOTER_DIR = join(__dirname, '..', '..', 'src', 'features', 'store-presentation');
const SEO_DIR = join(__dirname, '..', '..', 'src', 'features', 'storefront-seo');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `content_pages` API"). Matching against them would make
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

const S05_ROUTE_FILES = [
  join(APP_DIR, 'dich-vu', 'page.tsx'),
  join(APP_DIR, 'cau-hoi-thuong-gap', 'page.tsx'),
  join(APP_DIR, 'cua-hang', 'page.tsx'),
  join(APP_DIR, 'chinh-sach', '[slug]', 'page.tsx'),
];

const s05Code = codeOnly(
  [
    ...collect(CONTENT_DIR, /\.(ts|tsx)$/),
    ...collect(FOOTER_DIR, /\.(ts|tsx)$/),
    ...S05_ROUTE_FILES,
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n'),
);

describe('no content CMS is consumed', () => {
  it('touches no content-page persistence, repository or API operation', () => {
    expect(s05Code).not.toMatch(/content_pages|ContentPageRepository|contentPage_/);
    expect(s05Code).not.toMatch(/redirect_rules|redirectRule/);
  });

  it('imports no generated API client at all', () => {
    // The Service, FAQ, Local and policy pages are source. There is nothing to
    // fetch, so there is no client, no query hook and no server loader.
    expect(s05Code).not.toContain('@embroidery/api-client');
    expect(s05Code).not.toMatch(/useQuery|useInfiniteQuery|serverApiClient|browserApiClient/);
  });

  it('makes no HTTP call by any route', () => {
    // Matched as HTTP shapes, not as any `.get(`: the policy resolver's own
    // `Map.get` is a lookup over four literals, the opposite of a call out.
    expect(s05Code).not.toMatch(/\bfetch\(|axios|ApiClient|\.server['"`]/);
  });

  it('reads no environment variable — a store address is copy, not config', () => {
    expect(s05Code).not.toMatch(/process\.env/);
  });
});

describe('the routes S05 owns', () => {
  it.each(S05_ROUTE_FILES.map((path) => [relative(APP_DIR, path).split(sep).join('/'), path]))(
    'serves %s',
    (_label, path) => {
      expect(existsSync(path)).toBe(true);
    },
  );

  it('creates no policy parent index and no catch-all route', () => {
    expect(existsSync(join(APP_DIR, 'chinh-sach', 'page.tsx'))).toBe(false);
    expect(existsSync(join(APP_DIR, '[slug]'))).toBe(false);
    expect(existsSync(join(APP_DIR, '[...slug]'))).toBe(false);
  });

  it('never advertises the parameterised policy path or the bare parent', () => {
    const seoCode = codeOnly(
      collect(SEO_DIR, /\.ts$/)
        .map((path) => readFileSync(path, 'utf8'))
        .join('\n'),
    );

    expect(seoCode).not.toContain('/chinh-sach/[slug]');
    expect(seoCode).not.toMatch(/['"`]\/chinh-sach['"`]/);
  });
});

describe('S05 reuses the S04 SEO infrastructure rather than adding its own', () => {
  it('builds every canonical through the S04 public metadata helper', () => {
    expect(s05Code).toContain('publicPageMetadata');
  });

  it('hard-codes no origin and adds no metadata route or social image', () => {
    expect(s05Code).not.toMatch(/https?:\/\//);
    expect(existsSync(join(APP_DIR, 'dich-vu', 'opengraph-image.ts'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'cua-hang', 'opengraph-image.ts'))).toBe(false);
  });

  it('emits no structured data for a content page', () => {
    // S05 needs no Service, FAQPage, LocalBusiness or Organization schema, and
    // none was approved. `BreadcrumbList` stays with the two detail pages that
    // draw a real trail.
    expect(s05Code).not.toMatch(/application\/ld\+json|BreadcrumbJsonLd|schema\.org/);
  });
});

describe('the footer supplement stays separate from the dock and the DS footer', () => {
  const footerCode = codeOnly(
    collect(FOOTER_DIR, /\.(ts|tsx)$/)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n'),
  );

  it('renders no second contentinfo landmark', () => {
    expect(footerCode).not.toMatch(/<footer/);
  });

  it('duplicates no external contact channel', () => {
    expect(footerCode).not.toMatch(/zalo|messenger|ZALO_CONTACT_URL|MESSENGER_CONTACT_URL/i);
  });

  it('uses no CSS `order`, so source order stays visual order', () => {
    const footerCss = readFileSync(join(FOOTER_DIR, 'styles', 'store-presentation.scss'), 'utf8');

    expect(codeOnly(footerCss)).not.toMatch(/^\s*order:/m);
  });

  it('reserves the approved 100px mobile dock-safe area', () => {
    const footerCss = readFileSync(join(FOOTER_DIR, 'styles', 'store-presentation.scss'), 'utf8');

    expect(footerCss).toContain('100px');
  });
});
