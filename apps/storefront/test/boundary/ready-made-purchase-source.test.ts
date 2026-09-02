/**
 * Static boundaries of the `APP12-S01` purchase feature.
 *
 * The rules below are properties of the *source*, not of a render: a behaviour
 * test proves the panel does the right thing today, and these prove it has not
 * been given the means to do the wrong thing tomorrow. They are the reason this
 * checkpoint can promise "no order creation", "no second release flag" and "no
 * hard-coded variant" without re-reading every file each time one changes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(process.cwd(), 'src', 'features', 'ready-made-purchase');
const PRODUCT_DETAIL_DIR = join(process.cwd(), 'src', 'features', 'product-detail');

function walk(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(FEATURE_DIR);
const sources = files
  .filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

/** Source with comments removed, so prose about a rule cannot satisfy it. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const allCode = sources.map((source) => codeOnly(source.text)).join('\n');

describe('purchase data authority', () => {
  it('reads the purchase state only through the generated operation', () => {
    expect(allCode).toContain('publicProductVariantList');
    // Never a raw URL, never `fetch`, never a second HTTP client.
    expect(allCode).not.toMatch(/fetch\(|axios\.(get|post)|['"`]\/api\//);
  });

  it('declares no handwritten duplicate of a contract DTO', () => {
    // The contract types are imported, not restated. An `interface` naming a
    // wire field would be a second definition of the same shape.
    expect(allCode).toContain("from '@embroidery/api-client'");
    expect(allCode).not.toMatch(/interface\s+\w*(Sku|Price)\w*Response\b/);
  });

  it('never treats the operator display flag as stock', () => {
    expect(allCode).not.toContain('isDisplayOutOfStock');
  });

  it('takes availability only from the published quantity', () => {
    expect(allCode).toContain('availableQuantity');
    expect(allCode).not.toMatch(/quantityOnHand|quantity_on_hand|lowStock|reorder/i);
  });
});

describe('money', () => {
  it('never converts an amount to a number anywhere in the feature', () => {
    // A VND amount through an IEEE-754 double is precision loss no later
    // formatting can undo, so the whole feature is kept clear of the operations
    // that would cause it. `parseInt` is permitted in exactly one place — the
    // quantity, which is a count and not money.
    expect(allCode).not.toMatch(/Number\(|parseFloat|Math\.(round|floor|ceil)\s*\(/);
    const quantityParses = allCode.match(/parseInt/g) ?? [];
    expect(quantityParses).toHaveLength(1);
    expect(
      codeOnly(readFileSync(join(FEATURE_DIR, 'model', 'purchase-selection.ts'), 'utf8')),
    ).toContain('parseInt');
  });

  it('states no currency of its own', () => {
    // The currency is read from the response, so the panel is already correct
    // the day a second one is allowed.
    for (const source of sources) {
      expect(codeOnly(source.text)).not.toMatch(/['"`]VND['"`]/);
    }
  });
});

describe('no hard-coded catalog', () => {
  it('names no colour, size, category or product', () => {
    // Every option value is derived from the response. A literal here would be a
    // taxonomy compiled into the Storefront, which is exactly what
    // `IMP-D062` and the category source-of-truth gate forbid.
    expect(allCode).not.toMatch(/Trắng|Xanh rêu|['"`](S|M|L|XL)['"`]/);
    expect(allCode).not.toMatch(/thu-bong|khan|quan-ao|ao-thun/);
  });

  it('builds both routes from the one navigation authority', () => {
    expect(allCode).toContain('buildStorefrontCheckoutPath');
    // No path literal of its own, in either direction.
    expect(allCode).not.toMatch(/['"`]\/mua-hang|['"`]\/san-pham/);
  });
});

describe('read-only by construction', () => {
  it('creates no order, reservation, grant or payment', () => {
    expect(allCode).not.toMatch(
      /publicOrder|publicPayment|orderCreate|Idempotency-Key|reservation|ORDER_ACCESS/i,
    );
    // The only outbound affordance is an href; nothing here submits anything.
    expect(allCode).not.toMatch(/<form|onSubmit|method=['"`]post/i);
  });

  it('does not implement the checkout route it links to', () => {
    // `APP12-S02` owns `/mua-hang/[slug]`. S01 composes the address and stops.
    const routes = walk(join(process.cwd(), 'src', 'app'));
    expect(routes.filter((path) => path.includes('mua-hang'))).toEqual([]);
    expect(routes.filter((path) => path.includes('don-hang'))).toEqual([]);
  });

  it('adds no second release flag', () => {
    // Wave-2 isolation has exactly one switch, and it is not read here: the
    // Ready-Made purchase panel is a released Wave-1 surface and must not be
    // gated by the custom-embroidery flag either.
    expect(allCode).not.toContain('CUSTOM_EMBROIDERY_RELEASE_ENABLED');
    expect(allCode).not.toMatch(/READY_MADE_.*_ENABLED|process\.env\./);
  });

  it('advertises no Wave-2 custom path', () => {
    expect(allCode).not.toMatch(/thiet-ke|yeu-cau|truy-cap|Đặt thêu|studio/i);
  });
});

describe('composition', () => {
  it('keeps the server read out of the barrel a client island imports', () => {
    // Comments stripped: the barrel documents *why* the server module is absent,
    // and that prose must not be what satisfies the rule.
    const barrel = codeOnly(readFileSync(join(FEATURE_DIR, 'index.ts'), 'utf8'));
    expect(barrel).not.toContain('ready-made-purchase.server');
  });

  it('marks exactly the interactive components as client components', () => {
    const clients = sources.filter((source) => source.text.startsWith("'use client'"));
    expect(clients.map((source) => source.path.split(/[\\/]/).pop()).sort()).toEqual([
      'purchase-option-fieldset.tsx',
      'purchase-quantity-stepper.tsx',
      'ready-made-purchase-panel.tsx',
    ]);
    // The Product Detail screen itself stays a Server Component: the island is
    // bounded to the selection, not spread to the page.
    const screen = readFileSync(
      join(PRODUCT_DETAIL_DIR, 'components', 'product-detail-screen.tsx'),
      'utf8',
    );
    expect(screen).not.toContain("'use client'");
  });

  it('issues no browser request and holds no query cache', () => {
    // The projection arrives as a prop from the route's server read, which is
    // what makes "one variant-list fetch per render" structural rather than a
    // rule someone has to keep. A hook here would be a second read per view.
    expect(allCode).not.toMatch(/useQuery|useEffect|getBrowserApiClient|QueryClient/);
  });
});

describe('freshness', () => {
  it('leaves the inventory-sensitive segment dynamic', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'san-pham', '[slug]', 'page.tsx'),
      'utf8',
    );
    expect(page).toContain("export const dynamic = 'force-dynamic'");
    expect(page).not.toContain('generateStaticParams');
    expect(page).not.toMatch(/export const revalidate/);
  });
});

describe('design fidelity', () => {
  it('measures the panel against the delivered story column', () => {
    // Every approved frame draws the panel and the Story at the same width
    // (640 / 560 / 342). The stylesheet restates that one measure rather than
    // three viewport numbers, and this asserts it has not drifted from the
    // value `APP2-S02-G01-C1` locked.
    const panel = readFileSync(
      join(FEATURE_DIR, 'styles', '_ready-made-purchase-tokens.scss'),
      'utf8',
    );
    const detail = readFileSync(join(PRODUCT_DETAIL_DIR, 'styles', 'product-detail.scss'), 'utf8');
    const measure = /\$story-measure-max:\s*(\d+px)/.exec(detail)?.[1];
    expect(measure).toBe('640px');
    expect(panel).toContain(`$panel-measure-max: ${String(measure)}`);
  });

  it('adds no global token and hard-codes no colour', () => {
    // Both stylesheets — the tokens partial and the rule set that reads it — so
    // a literal cannot hide in whichever one this rule does not scan.
    const code = readdirSync(join(FEATURE_DIR, 'styles'))
      .map((entry) => readFileSync(join(FEATURE_DIR, 'styles', entry), 'utf8'))
      .join('\n')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/rgba?\(/);
  });

  it('keeps every interactive target at the approved 44px', () => {
    const panel = readFileSync(
      join(FEATURE_DIR, 'styles', '_ready-made-purchase-tokens.scss'),
      'utf8',
    );
    expect(panel).toContain('$control-min-target: 44px');
    // And never behind a media query, so the target is 44 at 1440 as well as 390.
    expect(panel).not.toMatch(/@media[^{]*\{[^}]*\$control-min-target/);
  });
});
