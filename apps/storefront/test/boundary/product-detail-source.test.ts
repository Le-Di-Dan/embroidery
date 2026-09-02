/**
 * @jest-environment node
 *
 * Static boundary checks on the Product Detail production source.
 *
 * These guard rules a rendering test cannot reach: which API operation the
 * feature may touch, that no raw transport creeps in beside the approved
 * client, that the route is spelled exactly once and never as a rejected alias,
 * that commerce fields cannot reach a component, and that the corrected 640px
 * story measure lives in the stylesheet rather than only in a document.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const FEATURE_DIR = join(SRC, 'features', 'product-detail');
const ROUTE_DIR = join(SRC, 'app', 'san-pham', '[slug]');
const STYLESHEET = join(FEATURE_DIR, 'styles', 'product-detail.scss');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no price", "never `location.href`"). Matching against them
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

const sources = collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));
/**
 * The Product Detail segment's **own** files, not its children's.
 *
 * `collect` recurses, and since `APP3-S01` the segment has a child route
 * (`thiet-ke`) owned by another checkpoint with its own boundary test. Scanning
 * into it would make every rule here — the single operation, the absent
 * commerce fields — a rule about the Studio as well, and this file has no
 * authority over that.
 */
const routeFiles = collect(ROUTE_DIR, /\.tsx$/)
  .filter((path) => dirname(path) === ROUTE_DIR)
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const allCode = codeOnly([...sources, ...routeFiles].map((file) => file.text).join('\n'));
const scss = readFileSync(STYLESHEET, 'utf8');
const scssCode = codeOnly(scss);

describe('product-detail API boundary', () => {
  it('discovers the feature and route source files', () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(routeFiles).toHaveLength(3);
  });

  it('consumes only the anonymous detail operation', () => {
    expect(allCode).toContain('publicProductDetail');
    // No list request: "continue exploring" is two links, not a related feed,
    // because no related-Product operation exists.
    expect(allCode).not.toContain('publicProductList');
    // Media bytes are fetched by the browser rendering a relative URL, never
    // streamed by application code.
    expect(allCode).not.toContain('publicProductMediaGet');
    expect(allCode).not.toMatch(/\badminProduct[A-Z]/);
  });

  it('never opens its own transport', () => {
    expect(allCode).not.toMatch(/\bfetch\s*\(/);
    expect(allCode).not.toMatch(/\bXMLHttpRequest\b/);
    // `isAxiosError` is the approved way to classify the safe 404; a raw axios
    // instance or a hand-built API path is not.
    expect(allCode).not.toMatch(/axios\.(get|post|create)/);
    expect(allCode).not.toMatch(/['"`]\/api\/public\/products/);
  });

  it('never reaches storage, a database or a vendor endpoint', () => {
    expect(allCode).not.toMatch(/minio|s3\.|amazonaws|getObjectStream|drizzle/i);
    expect(allCode).not.toMatch(/https?:\/\//);
  });

  it('keeps persistent browser state out of the page', () => {
    expect(allCode).not.toMatch(/localStorage|sessionStorage|zustand|document\.cookie/);
  });

  it('never renders raw error detail', () => {
    expect(allCode).not.toMatch(/error\.message|requestId|\.stack\b|error\.digest/);
    // The error boundary receives `error` and deliberately uses only `reset`.
    const boundary = codeOnly(readFileSync(join(ROUTE_DIR, 'error.tsx'), 'utf8'));
    expect(boundary).not.toMatch(/\{\s*error\s*\}|error\./);
  });
});

describe('route authority', () => {
  it('never spells the detail path in the feature or route source', () => {
    // One literal only, in the shell's navigation model.
    expect(allCode).not.toContain("'/san-pham");
    expect(allCode).toContain('buildStorefrontProductDetailPath');
  });

  it('never introduces a rejected alias', () => {
    for (const alias of ['/product/', '/products/', '/catalog/', '/tac-pham', '/kham-pha/']) {
      expect(allCode).not.toContain(`'${alias}`);
    }
  });

  it('validates the slug with the shared contract predicate', () => {
    expect(allCode).toContain('isPublicProductSlug');
    // No second regex describing what a slug is.
    expect(allCode).not.toMatch(/\[a-z0-9\]\+\(\?:-/);
  });

  it('renders the segment dynamically so an unpublish cannot be cached', () => {
    const page = readFileSync(join(ROUTE_DIR, 'page.tsx'), 'utf8');
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).not.toContain('revalidate');
    expect(page).not.toContain('generateStaticParams');
  });
});

describe('contract projection', () => {
  // `APP12-S01` releases `price` through this boundary — the approved purchase
  // panel states an amount before a SKU resolves — and tightens the other half:
  // the operator display flag must never become stock truth (`APP12-S01` §19).
  it('keeps the operator stock flag out of the projection boundary', () => {
    const view = codeOnly(
      readFileSync(join(FEATURE_DIR, 'model', 'product-detail-view.ts'), 'utf8'),
    );
    expect(view).not.toContain('isDisplayOutOfStock');
  });

  it('lets no Product Detail component read the stock flag or compute money', () => {
    const components = sources.filter((source) => source.path.includes('components'));
    for (const component of components) {
      const code = codeOnly(component.text);
      expect(code).not.toContain('isDisplayOutOfStock');
      // The price crosses this screen as an opaque value handed to the purchase
      // feature; no Product Detail component may parse or arithmetic one.
      expect(code).not.toMatch(/Number\(|parseFloat|parseInt|Math\.round/);
    }
  });

  it('delegates every purchase decision to the ready-made-purchase feature', () => {
    // The screen composes one panel and passes it the server projection. It owns
    // no SKU, availability or quantity logic of its own, so a purchase rule can
    // never end up stated twice with the two copies disagreeing.
    const screen = codeOnly(
      readFileSync(join(FEATURE_DIR, 'components', 'product-detail-screen.tsx'), 'utf8'),
    );
    expect(screen).toContain('ReadyMadePurchasePanel');
    expect(screen).not.toMatch(/availableQuantity|skuId|unitPrice|quantity/);
  });

  it('invents no deferred section', () => {
    expect(allCode).not.toMatch(/Cảm hứng|Ý tưởng|Ý nghĩa/);
    expect(allCode).not.toMatch(
      /materials|technique|process|relatedProducts|favourite|commission/i,
    );
  });

  it('invents no structured data or social image', () => {
    expect(allCode).not.toMatch(/schema\.org|application\/ld\+json|openGraph|og:image/i);
  });
});

describe('rendering boundary', () => {
  it('keeps the client boundary narrow', () => {
    const clientFiles = sources
      .filter((source) => source.text.startsWith("'use client'"))
      .map((source) => source.path);
    // Six components — the gallery island, the media stage, the thumbnail strip,
    // the lightbox, the share button and the error surface — plus the three
    // hooks they use. Everything else, including the whole page composition,
    // stays server-side. The stage is a client component only so it can notice
    // an image that failed *before* hydration; its markup is still server-rendered.
    expect(clientFiles).toHaveLength(9);
    expect(readFileSync(join(ROUTE_DIR, 'page.tsx'), 'utf8')).not.toContain("'use client'");
  });

  it('adds no second shell landmark', () => {
    expect(allCode).not.toMatch(/<main\b|<header\b|<footer\b|main-content/);
  });

  it('renders exactly one h1, in one file', () => {
    const withHeading = sources.filter((source) => /<h1[\s>]/.test(codeOnly(source.text)));
    // The screen's Product title, plus the route-local error surface — which
    // replaces the whole page, so the two never render together.
    expect(withHeading).toHaveLength(2);
    expect(withHeading.map((file) => file.path).join()).toMatch(/product-detail-screen/);
  });

  it('opens the lightbox from a real button, never a bare div', () => {
    const gallery = codeOnly(
      readFileSync(join(FEATURE_DIR, 'components', 'detail-gallery.tsx'), 'utf8'),
    );
    expect(gallery).toMatch(/<button[\s\S]*aria-label=\{openLightboxLabel/);
    expect(gallery).not.toMatch(/<div[^>]*onClick/);
  });

  it('shares the route helper path, never location.href', () => {
    const share = codeOnly(readFileSync(join(FEATURE_DIR, 'hooks', 'use-share.ts'), 'utf8'));
    expect(share).toContain('window.location.origin');
    expect(share).not.toContain('location.href');
    expect(share).not.toMatch(/gtag|analytics|dataLayer|facebook|twitter/i);
  });

  it('uses no inline visual styles, CSS Modules or CSS-in-JS', () => {
    expect(allCode).not.toMatch(/style=\{\{|styled\.|\.module\.(s?css)|css`/);
    expect(allCode).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('style contract', () => {
  it('caps the story measure at the corrected 640px', () => {
    expect(scss).toMatch(/\$story-measure-max:\s*640px;/);
    expect(scssCode).toMatch(/max-width:\s*\$story-measure-max;/);
    // Not the foundation's 720px reading width: the approved measure is 640.
    expect(scssCode).not.toContain('layout-reading-max');
  });

  it('never clamps or fixes the height of the story', () => {
    const story = scssCode.slice(scssCode.indexOf('.product-detail__story-body'));
    const rule = story.slice(0, story.indexOf('}'));
    expect(rule).not.toMatch(/line-clamp|max-height|height:\s*\d/);
  });

  it('lets the artwork keep its natural ratio', () => {
    const stage = scssCode.slice(scssCode.indexOf('.product-detail__stage-image'));
    const rule = stage.slice(0, stage.indexOf('}'));
    expect(rule).toContain('object-fit: contain');
    expect(rule).not.toContain('aspect-ratio');
  });

  it('meets the minimum touch target on every interactive control', () => {
    const controls = scssCode.match(/min-height: styles\.\$size-touch-target-min;/g) ?? [];
    expect(controls.length).toBeGreaterThanOrEqual(5);
  });

  it('scrolls the thumbnail strip instead of widening the page', () => {
    // The selector appears twice since `APP2-S02-C1` — the base rule and the
    // mobile override that gives the scroll viewport the whole content band —
    // so every block is checked rather than whichever happens to come first.
    const blocks = [...scssCode.matchAll(/\.product-detail__thumbnails\s*\{([^}]*)\}/g)].map(
      (match) => match[1] ?? '',
    );
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks.some((block) => block.includes('overflow-x: auto'))).toBe(true);
    expect(blocks.some((block) => block.includes('width: 100%'))).toBe(true);
  });

  it('honours reduced motion', () => {
    expect(scss).toContain('prefers-reduced-motion: reduce');
  });

  it('uses shared tokens for colour, type, radius and spacing', () => {
    // The only raw colours are the documented GAP-D02 scrim locals, declared
    // once as variables rather than sprinkled through the rules.
    const rawColours = scssCode.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? [];
    expect(rawColours.length).toBeLessThanOrEqual(4);
    expect(scss).toContain('$scrim-color');
    expect(scssCode).not.toMatch(/font-size:\s*\d/);
  });
});
