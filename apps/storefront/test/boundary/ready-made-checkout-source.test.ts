/**
 * Static boundaries of the `APP12-S02` checkout feature, plus the route's own
 * release and SEO position.
 *
 * The rules below are properties of the *source*, not of a render: the component
 * suite proves the screen does the right thing today, and these prove it has not
 * been given the means to do the wrong thing tomorrow. They are the reason this
 * checkpoint can promise "no raw token", "no trusted price", "no second release
 * flag" and "no handwritten DTO" without re-reading every file each time one
 * changes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { READY_MADE_CHECKOUT_COPY } from '../../src/features/ready-made-checkout/model/ready-made-checkout-copy';
import { isWithheldWave2Route } from '../../src/features/release-isolation';
import { PUBLIC_STATIC_ROUTES } from '../../src/features/storefront-seo/model/public-static-routes';
import { ROBOTS_DISALLOW } from '../../src/features/storefront-seo/model/robots-policy';
import {
  STOREFRONT_CHECKOUT_ROUTE_BASE,
  buildStorefrontCheckoutPath,
} from '../../src/features/storefront-shell';

const FEATURE_DIR = join(process.cwd(), 'src', 'features', 'ready-made-checkout');
const ROUTE_FILE = join(process.cwd(), 'src', 'app', 'mua-hang', '[slug]', 'page.tsx');

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
const routeCode = codeOnly(readFileSync(ROUTE_FILE, 'utf8'));

describe('the feature exists as one bounded thing', () => {
  it('splits by responsibility rather than by file size', () => {
    // A checkout is not one giant component (§52): the projection, the
    // verification reuse, the delivery form, the submission and the confirmation
    // are separate modules, and the directory shape is what says so.
    const dirs = new Set(files.map((path) => path.slice(FEATURE_DIR.length + 1).split(/[\\/]/)[0]));
    expect([...dirs].sort()).toEqual(['api', 'hooks', 'index.ts', 'model', 'styles', 'ui']);
  });

  it('has no catch-all module', () => {
    // `CLAUDE.md` §5 — a file named for nothing collects everything.
    expect(files.some((path) => /(helpers|common|misc|utils)\.tsx?$/.test(path))).toBe(false);
  });
});

describe('the order-creation command', () => {
  it('goes through the generated operation and nothing else', () => {
    expect(allCode).toContain('publicReadyMadeOrderCreate');
    // Never a raw URL, never `fetch`, never a second HTTP client.
    expect(allCode).not.toMatch(/fetch\(|axios\.(get|post)|['"`]\/api\//);
    expect(allCode).not.toContain('ready-made-orders');
  });

  it('declares no handwritten duplicate of a contract DTO', () => {
    expect(allCode).toContain("from '@embroidery/api-client'");
    // The wire shapes are imported, not restated. An `interface` naming one
    // would be a second definition that could drift from the contract.
    expect(allCode).not.toMatch(
      /interface\s+\w*(CreateReadyMadeOrder|ReadyMadeOrderCreated|ReadyMadeOrderDelivery)\w*/,
    );
  });

  it('mints no idempotency key of its own', () => {
    // `APP12-B02` scopes idempotency by the verified challenge and publishes no
    // `Idempotency-Key` parameter. A key minted here would be a second, weaker
    // authority the server never reads (§20).
    expect(allCode).not.toMatch(/Idempotency-Key/i);
    expect(allCode).not.toMatch(/randomUUID|crypto\.|Date\.now\(\)\s*\.toString/);
  });
});

describe('money', () => {
  it('never converts an amount to a number anywhere in the feature', () => {
    // The one arithmetic module works on `BigInt` over scaled integers; nothing
    // else may parse an amount at all.
    expect(allCode).not.toMatch(/parseFloat|Number\.parseFloat/);
    expect(allCode).not.toMatch(/Number\(\s*\w*[Aa]mount/);
    expect(allCode).not.toMatch(/[Aa]mount\s*[*/+]\s/);
  });

  it('sends no amount, subtotal or total to the server', () => {
    const client = sources.find((source) => source.path.endsWith('ready-made-order.client.ts'));
    expect(client).toBeDefined();
    expect(codeOnly(client?.text ?? '')).not.toMatch(/amount|subtotal|unitPrice|total/i);
  });

  it('states the shipping fee as pending rather than as a zero', () => {
    // `BR-027`: no fabricated fee and no fabricated payable total, ever.
    expect(allCode).not.toMatch(/shippingFee\s*[:=]\s*['"`]?0/);
    expect(allCode).not.toMatch(/payableTotal|grandTotal|finalTotal/);
  });
});

describe('the ORDER_ACCESS token is never reachable from here', () => {
  it('reads no token, grant or outbox value', () => {
    // The create response has no token field — `ReadyMadeOrderAccessBootstrapResponse`
    // publishes `delivered`, `expiresAt` and `scopeKind` and nothing else — so
    // this is a check that nobody has reached for one anyway, by that name or
    // through the grant and outbox tables `APP12-S02` §23 forbids touching.
    expect(allCode).not.toMatch(/\btokens?\b|accessToken|grantId|\boutbox\b|envelope[Kk]ey/i);
    // `secureLink*` is deliberately not in that pattern: the confirmation names
    // three *copy* keys about the message the customer will receive, which is
    // the opposite of holding the link. That they are only ever strings is what
    // the next assertion checks.
    expect(allCode).not.toMatch(/access\.(token|link|url)|order\.(token|link)/);
  });

  it('persists nothing in the browser', () => {
    // §19 and §23: no delivery fact, contact, challenge or order reference is
    // written anywhere a later page or another tab could read it.
    expect(allCode).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it('offers no route into the secure order surface', () => {
    // `/truy-cap/don-hang` is `APP12-S03`'s, opened by a link this route does
    // not hold. Nothing here may navigate there (§25).
    expect(allCode).not.toContain('/truy-cap');
    expect(allCode).not.toMatch(/don-hang/);
    expect(allCode).not.toMatch(/router\.(push|replace)|redirect\(/);
  });
});

describe('customer-facing copy', () => {
  it('lives in the canonical message repository and nowhere else', () => {
    // This used to name the two modules allowed to hold a Vietnamese literal.
    // `APP12-V02` §5A removed the exception rather than moving it: every
    // sentence on this route now lives in
    // `packages/i18n/messages/vi/checkout.json`, and the assertion is
    // correspondingly stronger — **no** file in the feature holds prose.
    const withLiterals = sources
      .filter((source) =>
        /['"`][^'"`]*[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(
          codeOnly(source.text),
        ),
      )
      .map((source) => source.path.split(/[\\/]/).pop());
    expect(withLiterals).toEqual([]);
  });

  it('reads that repository through the checkout catalog', () => {
    // The counterpart of the assertion above: proving the literals are gone is
    // only half of it, because deleting them would satisfy that too. The copy
    // has to still arrive, and it arrives by key.
    expect(READY_MADE_CHECKOUT_COPY.pageTitle.length).toBeGreaterThan(0);
    expect(allCode).toContain("messageView(VI_MESSAGES.checkout, 'readyMade')");
  });

  it('never renders an internal state token or an internal identifier', () => {
    expect(allCode).not.toMatch(/AWAITING_SHIPPING_FEE|ORDER_ACCESS|READY_MADE\b/);
  });
});

describe('release and discovery position of the route', () => {
  it('is a Wave-1 route the custom-release gate never withholds', () => {
    expect(isWithheldWave2Route(buildStorefrontCheckoutPath('ao-thun'))).toBe(false);
    expect(isWithheldWave2Route(`${STOREFRONT_CHECKOUT_ROUTE_BASE}/ao-thun/`)).toBe(false);
    expect(isWithheldWave2Route(STOREFRONT_CHECKOUT_ROUTE_BASE)).toBe(false);
  });

  it('introduces no second release flag', () => {
    expect(allCode).not.toMatch(/RELEASE_ENABLED|isCustomEmbroideryReleased|FEATURE_FLAG/);
    expect(routeCode).not.toMatch(/RELEASE_ENABLED|isCustomEmbroideryReleased/);
  });

  it('is absent from the sitemap by construction', () => {
    // Nothing had to be removed: the sitemap is the static route list plus the
    // API's live indexable entity inventory, and a checkout is in neither.
    expect(PUBLIC_STATIC_ROUTES.some((route) => route.path.startsWith('/mua-hang'))).toBe(false);
  });

  it('declares noindex on the page rather than relying on robots.txt', () => {
    // `robots.txt` asks a crawler not to fetch; it cannot remove a known address
    // from an index, and a page that is never fetched never has its `noindex`
    // read. The directive is the fence; a `Disallow` would be a second one.
    expect(routeCode).toContain('robots: { index: false, follow: false }');
    expect(routeCode).not.toContain('alternates');
    expect(routeCode).not.toContain('openGraph');
    expect(routeCode).not.toContain('publicPageMetadata');
    // And the family is not disallowed, so the directive is actually readable.
    expect(ROBOTS_DISALLOW).not.toContain('/mua-hang');
  });
});

describe('the server / client boundary', () => {
  it('keeps both reads and the hint resolution on the server', () => {
    expect(routeCode).toContain('loadProductDetail');
    expect(routeCode).toContain('loadReadyMadePurchase');
    expect(routeCode).toContain('resolveCheckoutSelection');
    expect(routeCode).toContain("export const dynamic = 'force-dynamic'");
    // The route file itself is a Server Component.
    expect(routeCode).not.toContain("'use client'");
  });

  it('gives the island no catalog client to re-read with', () => {
    // The selection the customer sees is the one this request produced. A second
    // read in the browser would let the summary and the submitted SKU disagree.
    expect(allCode).not.toContain('publicProductVariantList');
    expect(allCode).not.toContain('publicProductDetail');
  });

  it('marks every interactive module as a client island and no more', () => {
    const clientModules = sources
      .filter((source) => source.text.startsWith("'use client'"))
      .map((source) => source.path.slice(FEATURE_DIR.length + 1).replace(/\\/g, '/'));
    expect(clientModules.sort()).toEqual([
      'hooks/use-checkout-submission.ts',
      'hooks/use-verified-contact.ts',
      'ui/checkout-contact-card.tsx',
      'ui/checkout-delivery-card.tsx',
      'ui/checkout-field.tsx',
      'ui/checkout-query-provider.tsx',
      'ui/checkout-refusal-card.tsx',
      'ui/checkout-screen.tsx',
      'ui/checkout-success-panel.tsx',
      'ui/checkout-summary-card.tsx',
      'ui/pre-hydration-guard.tsx',
    ]);
  });
});

describe('the pre-hydration guard is markup, not script (APP12-S02-C1)', () => {
  const guard = sources.find((source) => source.path.endsWith('pre-hydration-guard.tsx'));
  const guardCode = codeOnly(guard?.text ?? '');

  it('exists and disables a real fieldset', () => {
    expect(guard).toBeDefined();
    // The safety is an attribute the server emits, so it protects the HTML on
    // the wire rather than a DOM that JavaScript has already reached.
    expect(guardCode).toMatch(/<fieldset[\s\S]*disabled=\{!interactive\}/);
  });

  it('is composed as the checkout band itself', () => {
    const screen = sources.find((source) => source.path.endsWith('checkout-screen.tsx'));
    const screenCode = codeOnly(screen?.text ?? '');
    expect(screenCode).toContain('<PreHydrationGuard className="ready-made-checkout__columns">');
    // The `<div>` it replaced is gone, so no box was added to a grid measured
    // from the approved frames.
    expect(screenCode).not.toContain('<div className="ready-made-checkout__columns">');
  });

  it('does not rely on any of the mechanisms that cannot work before hydration', () => {
    // `preventDefault` is precisely what is missing before hydration; pointer
    // events, an overlay and a timer are styling and hope. None of them may be
    // the guard (`APP12-S02-C1` §6).
    expect(guardCode).not.toMatch(/preventDefault|pointerEvents|setTimeout|requestAnimationFrame/);
    expect(guardCode).not.toMatch(/onSubmit|onClick|onKeyDown/);
  });

  it('preserves no state through a native GET, and none through storage', () => {
    // `APP12-S02-C1` §7: the correct pre-hydration behaviour is to not submit.
    // A hidden `sku`/`quantity` input would make the destructive navigation
    // survivable instead of impossible, and is forbidden.
    expect(allCode).not.toMatch(/type=['"]hidden['"]/);
    expect(allCode).not.toMatch(/\bname=\{?['"]?(sku|quantity)/);
    expect(allCode).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});

describe('verification is reused, not rebuilt', () => {
  it('drives the delivered APP4 flow', () => {
    expect(allCode).toContain('useContactVerification');
    expect(allCode).toContain("from '../../contact-verification'");
  });

  it('creates no second verification system', () => {
    expect(allCode).not.toMatch(/\bOTP\b|password|login|signIn|signUp|account/i);
    // And never holds the code: `APP4` owns it, in its own ref.
    expect(allCode).not.toMatch(/verificationCode|codeRef|submitCode\s*\(/);
  });

  it('binds the retained authorization to the contact it was earned for', () => {
    const hook = sources.find((source) => source.path.endsWith('use-verified-contact.ts'));
    expect(hook).toBeDefined();
    const code = codeOnly(hook?.text ?? '');
    // The §16 comparison, present as code rather than as a promise.
    expect(code).toContain('verified.contact === contact');
    // And the half that is gone: `APP12-N01.S01` locked verification to email
    // and removed `contactKind` from the flow's state, so the binding compares
    // the value alone. A comparison against a one-member constant would assert
    // nothing, and leaving the field behind would suggest a choice still exists.
    expect(code).not.toContain('contactKind');
  });
});
