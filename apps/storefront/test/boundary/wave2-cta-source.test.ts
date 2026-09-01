/**
 * @jest-environment node
 *
 * Static census of where a Wave-2 customer route may be named, and where the
 * release decision must be consulted (`APP12-G02-C1`).
 *
 * ## Why a source census, on top of the rendered sweep
 *
 * `wave2-cta-suppression.test.tsx` renders every released composition with the
 * capability withheld and asserts no anchor resolves to a withheld route. That
 * is the real proof — but it can only prove it about the compositions it lists.
 * A checkpoint that adds a **new** component with a new `/yeu-cau/moi` button
 * would ship a page that suite never renders, and the correction would silently
 * regress on a surface nobody thought to add.
 *
 * So this file asks the question the render sweep cannot: *did the set of
 * places that know about a Wave-2 route change?* Both directions matter.
 *
 * - `A` fails when a new Wave-1 source names a Wave-2 route. The author then
 *   either routes it through a release-aware renderer and adds the line here, or
 *   discovers that they were about to advertise a deliberate `404`.
 * - `B` fails when a release-aware renderer stops consulting the release, which
 *   is what a well-meaning "simplify this component" refactor looks like from
 *   the outside.
 *
 * Neither is the gate. `src/proxy.ts` is, and `release-isolation-gate.test.ts`
 * proves it. These two lists are about what a released shop *offers*.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

/**
 * The Wave-2 customer surfaces themselves. Every file beneath these is a screen
 * the gate withholds whole, so naming a Wave-2 route inside one is not a defect
 * — it is the screen's own address. They are enumerated rather than pattern-
 * matched so that adding a directory here is a visible decision.
 */
const WITHHELD_WAVE2_SOURCE_DIRS = [
  'features/custom-request', // APP5-S01 — `/yeu-cau/moi`
  'features/custom-request-confirmation', // APP5-S02 — `/yeu-cau/da-gui`
  'features/secure-quotation', // APP6-S01 — `/truy-cap/bao-gia`
  'features/secure-design-review', // APP6-S01 — `/truy-cap/duyet-thiet-ke`
  'features/secure-deposit-payment', // APP7-S01 — `/truy-cap/thanh-toan`
  'features/secure-final-payment', // APP9-S01 — `/truy-cap/thanh-toan-con-lai`
  'app/yeu-cau',
  'app/truy-cap/bao-gia',
  'app/truy-cap/duyet-thiet-ke',
  'app/truy-cap/thanh-toan',
  'app/truy-cap/thanh-toan-con-lai',
  'app/san-pham/[slug]/thiet-ke',
];

/**
 * Wave-1 sources that legitimately name a Wave-2 route, each with what makes it
 * legitimate. A file is on this list because it *declares* an address, not
 * because it offers one: every declaration below is consumed by a renderer in
 * `RELEASE_AWARE_RENDERERS`, which is where the release is actually consulted.
 *
 * Keeping the two lists apart is the point. The address of the custom-request
 * flow is one fact and belongs in one place; whether it may be offered today is
 * a different fact, and duplicating the second one into fifteen definition files
 * is exactly the scattering `APP12-G02-C1` §10 forbids.
 */
const WAVE1_SOURCES_THAT_MAY_NAME_A_WAVE2_ROUTE = [
  // The declaration home for every Storefront route, and its barrel.
  'features/storefront-shell/model/storefront-navigation.ts',
  'features/storefront-shell/index.ts',
  // `noindex` / `Disallow` patterns. Crawler instructions, never anchors — and
  // they must keep naming these routes precisely while the routes exist.
  'features/storefront-seo/model/robots-policy.ts',
  // The Homepage's route model; both Homepage renderers below read it.
  'features/homepage/model/homepage-routes.ts',
  // The two Homepage renderers, which hold the release check themselves.
  'features/homepage/components/homepage-hero.tsx',
  'features/homepage/components/homepage-commission-cta.tsx',
  // The gallery-entry closing block, likewise.
  'features/gallery-detail/components/gallery-detail-commission.tsx',
  // Content-page definitions. Their `Gửi yêu cầu thêu` related link is filtered
  // by the shared `ContentLinksBlock`, so the definitions stay release-blind.
  'features/content-pages/model/service-page.ts',
  'features/content-pages/model/faq-page.ts',
  'features/content-pages/model/local-page.ts',
  'features/content-pages/model/policies/payment-policy.ts',
  'features/content-pages/model/policies/shipping-policy.ts',
  // The footer copy; `StorePresentationBlock` holds the check.
  'features/store-presentation/model/store-presentation-copy.ts',
].sort();

/**
 * Every file that consults `isCustomerRouteWithheld`. Six presentation sites,
 * one per surface family — the header navigation (`APP12-G02`) and the five
 * this correction added.
 */
const RELEASE_AWARE_RENDERERS = [
  'features/storefront-shell/components/storefront-primary-nav.tsx',
  'features/homepage/components/homepage-hero.tsx',
  'features/homepage/components/homepage-commission-cta.tsx',
  'features/gallery-detail/components/gallery-detail-commission.tsx',
  'features/content-pages/components/content-links-block.tsx',
  'features/store-presentation/components/store-presentation-block.tsx',
].sort();

/**
 * Comments explain the rules and therefore quote the very routes these checks
 * look for. Matching against prose would put every well-documented file on the
 * list, so both censuses run on code only.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * The release-isolation module and the gate that uses it. Both are excluded
 * from every census below: they are the *authority* on which routes are
 * withheld and on what the answer means, so of course they name the routes and
 * of course they read the policy. Including them would make each census assert
 * that its own subject exists.
 */
const RELEASE_AUTHORITY = ['features/release-isolation/', 'proxy.ts'];

/** Every production source file that is neither a withheld surface nor the authority. */
const WAVE1_SOURCES = collect(SRC)
  .map((path) => relative(SRC, path).split(sep).join('/'))
  .filter((path) => !WITHHELD_WAVE2_SOURCE_DIRS.some((dir) => path.startsWith(`${dir}/`)))
  .filter((path) => !RELEASE_AUTHORITY.some((owned) => path === owned || path.startsWith(owned)))
  .sort();

/**
 * Naming a Wave-2 route: the three exported route constants and the two path
 * literals. The literals are included because a constant is a convention, not a
 * guarantee — the defect this guards against is most likely to arrive as a
 * hand-typed `href="/yeu-cau/moi"`.
 */
const NAMES_A_WAVE2_ROUTE =
  /STOREFRONT_CUSTOM_REQUEST_ROUTE|STOREFRONT_STUDIO_ROUTE_SEGMENT|HOMEPAGE_COMMISSION_ROUTE|['"`]\/yeu-cau|['"`]\/truy-cap\/(?:bao-gia|duyet-thiet-ke|thanh-toan)/;

const CONSULTS_THE_RELEASE = /isCustomerRouteWithheld/;

function bodyOf(path: string): string {
  return codeOnly(readFileSync(join(SRC, path), 'utf8'));
}

describe('A — which Wave-1 sources may name a Wave-2 customer route', () => {
  it('is exactly the enumerated set, and a new one is a correction defect', () => {
    const found = WAVE1_SOURCES.filter((path) => NAMES_A_WAVE2_ROUTE.test(bodyOf(path)));
    expect(found).toEqual(WAVE1_SOURCES_THAT_MAY_NAME_A_WAVE2_ROUTE);
  });

  it('lists no file that has since stopped naming one', () => {
    for (const path of WAVE1_SOURCES_THAT_MAY_NAME_A_WAVE2_ROUTE) {
      expect(WAVE1_SOURCES).toContain(path);
    }
  });
});

describe('B — which sources consult the release before offering a route', () => {
  it('is exactly the six release-aware renderers', () => {
    const found = WAVE1_SOURCES.filter((path) => CONSULTS_THE_RELEASE.test(bodyOf(path)));
    expect(found).toEqual(RELEASE_AWARE_RENDERERS);
  });

  it('reads the release only through the shared policy, never a second flag', () => {
    for (const path of RELEASE_AWARE_RENDERERS) {
      const body = bodyOf(path);
      // No component reaches for the variable itself. One authority, consulted
      // through one function — `APP12-G02-C1` §10 and §11.
      expect(body).not.toMatch(/CUSTOM_EMBROIDERY_RELEASE_ENABLED/);
      expect(body).not.toMatch(/process\.env/);
      // And nothing leaks the decision to the browser.
      expect(body).not.toMatch(/NEXT_PUBLIC_/);
      expect(body).not.toMatch(/^'use client'/m);
    }
  });
});
