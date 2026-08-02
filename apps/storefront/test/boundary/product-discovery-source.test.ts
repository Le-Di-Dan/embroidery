/**
 * @jest-environment node
 *
 * Static boundary checks on the Discover feed's production source.
 *
 * These guard rules a rendering test cannot reach: which API operations the
 * feature is allowed to touch, that no raw transport creeps in beside the
 * approved client, that the masonry stays CSS rather than a JavaScript column
 * split, and that the route is never spelled as one of the rejected aliases.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'product-discovery');
const ROUTE_FILE = join(__dirname, '..', '..', 'src', 'app', 'kham-pha', 'page.tsx');
const STYLESHEET = join(FEATURE_DIR, 'styles', 'product-discovery.scss');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `href`", "a fixed aspect-ratio would…"). Matching against
 * them would make every well-documented file fail its own rule, so the checks
 * run on code only.
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
const allCode = codeOnly(
  [...sources.map((source) => source.text), readFileSync(ROUTE_FILE, 'utf8')].join('\n'),
);
const scss = readFileSync(STYLESHEET, 'utf8');
const scssCode = codeOnly(scss);

describe('product-discovery API boundary', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('consumes only the anonymous list operation', () => {
    expect(allCode).toContain('publicProductList');
    // The Product Detail route is unresolved, so nothing may consume its
    // operation; media bytes are fetched by the browser, never by this code.
    expect(allCode).not.toContain('publicProductDetail');
    expect(allCode).not.toContain('publicProductMediaGet');
    expect(allCode).not.toMatch(/\badminProduct[A-Z]/);
  });

  it('never opens its own transport', () => {
    expect(allCode).not.toMatch(/\bfetch\s*\(/);
    expect(allCode).not.toMatch(/\baxios\b/);
    expect(allCode).not.toMatch(/\bXMLHttpRequest\b/);
    // No hand-built API paths: the generated operation owns the URL.
    expect(allCode).not.toMatch(/['"`]\/api\/public\/products/);
  });

  it('never reaches storage, a database or a vendor endpoint', () => {
    expect(allCode).not.toMatch(/minio|s3\.|amazonaws|getObjectStream|drizzle/i);
    expect(allCode).not.toMatch(/https?:\/\//);
  });

  it('keeps browser state out of the feed', () => {
    expect(allCode).not.toMatch(/localStorage|sessionStorage|zustand|document\.cookie/);
  });

  it('never renders raw error detail or the cursor payload', () => {
    // The cursor is passed through as an opaque value; it is never decoded,
    // parsed or rendered.
    expect(allCode).not.toMatch(/atob\(|Buffer\.from\(.*cursor|JSON\.parse\(.*cursor/i);
    expect(allCode).not.toMatch(/error\.message|requestId|\.stack\b/);
  });

  it('spells the route once, and never as a rejected alias', () => {
    for (const rejected of ['/discover', '/catalog', '/san-pham']) {
      expect(allCode).not.toContain(`'${rejected}`);
    }
    // The literal lives in the shell's navigation model; the feature re-exports it.
    const literals = allCode.match(/'\/kham-pha'/g) ?? [];
    expect(literals).toHaveLength(0);
  });
});

describe('product-discovery rendering boundary', () => {
  it('keeps the client boundary narrow', () => {
    const clientFiles = sources
      .filter((source) => source.text.startsWith("'use client'"))
      .map((source) => source.path);
    // Client code is the feed island, the continuation control, the query
    // provider and the two hooks they use — five files. The route segment, the
    // intro, the chips, the masonry, the cards and every state stay server.
    expect(clientFiles).toHaveLength(5);
    for (const path of clientFiles) {
      expect(path).toMatch(/discover-(feed-screen|continuation|query-provider)|hooks/);
    }
    expect(readFileSync(ROUTE_FILE, 'utf8')).not.toContain("'use client'");
  });

  it('adds no second shell landmark', () => {
    expect(allCode).not.toMatch(/<main\b|<header\b|<footer\b|main-content/);
  });

  it('renders exactly one h1, in one file', () => {
    const withHeading = sources.filter((source) => /<h1[\s>]/.test(codeOnly(source.text)));
    expect(withHeading).toHaveLength(1);
    expect(withHeading[0]?.path).toContain('discover-intro');
    expect((allCode.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  /**
   * Superseded by `APP2-S02`. Until IMP-D039 this asserted the card built **no**
   * destination at all, which was correct while no detail route existed. The
   * route exists now, so the rule becomes the narrower one that still matters:
   * exactly one link, built by the shared helper, with no second control nested
   * inside it and no hand-written path.
   */
  it('gives the card exactly one destination, from the shared helper', () => {
    const card = codeOnly(
      readFileSync(join(FEATURE_DIR, 'components', 'product-card.tsx'), 'utf8'),
    );
    expect((card.match(/<Link\b/g) ?? []).length).toBe(1);
    expect((card.match(/href=/g) ?? []).length).toBe(1);
    expect(card).toContain('buildStorefrontProductDetailPath');
    // The path is never spelled here — one literal, in the shell's route model.
    expect(card).not.toContain('/san-pham');
    // No nested control, and no click handler competing with the link.
    expect(card).not.toMatch(/onClick=|role="button"|<button\b/);
  });

  it('uses no inline visual styles, CSS Modules or CSS-in-JS', () => {
    expect(allCode).not.toMatch(/style=\{\{|styled\.|\.module\.(s?css)|css`/);
    expect(allCode).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('masonry contract', () => {
  it('declares 5 / 3 / 2 columns', () => {
    expect(scss).toMatch(/\$columns-desktop:\s*5;/);
    expect(scss).toMatch(/\$columns-tablet:\s*3;/);
    expect(scss).toMatch(/\$columns-mobile:\s*2;/);
  });

  it('produces the columns in CSS, never by redistributing the DOM', () => {
    expect(scss).toContain('columns:');
    expect(scss).toContain('break-inside: avoid');
    // No JavaScript column split: that would reorder the DOM to match the visual
    // layout and break the linear reading order.
    expect(allCode).not.toMatch(/column(Index|Count)|chunk|distributeInto|% *columns/i);
    expect(allCode).not.toMatch(/masonry.*(library|package)/i);
  });

  it('lets images keep their natural ratio', () => {
    expect(scssCode).toContain('height: auto');
    // A fixed ratio on the artwork itself would crop every piece into an equal
    // box; only the placeholder — which describes nothing about a product —
    // declares one.
    const imageRule = scssCode.slice(scssCode.indexOf('.discover__card-image'));
    expect(imageRule.slice(0, imageRule.indexOf('}'))).not.toContain('aspect-ratio');
    expect(scssCode).toContain('.discover__card-placeholder');
  });

  it('meets the minimum touch target on every control', () => {
    expect((scssCode.match(/min-height: styles\.\$size-touch-target-min;/g) ?? []).length).toBe(2);
  });

  it('uses only shared tokens for colour, type, radius and spacing', () => {
    // No raw hex, rgb() or off-scale px font sizes in the feature stylesheet.
    expect(scss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(scss).not.toMatch(/\brgba?\(/);
    expect(scss).not.toMatch(/font-size:\s*\d/);
  });
});
