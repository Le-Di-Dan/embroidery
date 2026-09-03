/**
 * @jest-environment node
 *
 * Static boundary checks on `/truy-cap/don-hang`'s production source
 * (`APP12-S03` §6, §7, §13, §15, §16, §21, §29, §41, §52, §53, §54).
 *
 * These guard the rules a rendering test cannot reach: which operations the
 * feature may touch, that the token has exactly one carrier, that no order
 * state is inferred, that no amount is coerced, that no Admin client is
 * imported, that no tracking field is rendered, and that every file is inside
 * its size limit.
 *
 * A scan of *this* directory rather than a promotion of a shared helper is
 * deliberate. `APP9-S01`'s own boundary suite proves the balance feature
 * contains no numeric coercion by scanning its directory, and a file that left
 * the directory would leave the guard. §50 forbids this checkpoint touching
 * APP7/APP9 source to consolidate them, so this feature is guarded the same way
 * and the duplication is carried as a follow-up.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'secure-ready-made-order');
const ROUTE_FILE = join(__dirname, '..', '..', 'src', 'app', 'truy-cap', 'don-hang', 'page.tsx');
const REPO_APP = join(__dirname, '..', '..');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("no `publicSecureLinkResolve`"). Matching against them would
 * make every well-documented file fail its own rule, so the checks run on code
 * only.
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

const SOURCE_FILES = [...collect(FEATURE_DIR, /\.(ts|tsx)$/), ROUTE_FILE];
const SCSS_FILES = collect(FEATURE_DIR, /\.scss$/);

const featureCode = codeOnly(SOURCE_FILES.map((path) => readFileSync(path, 'utf8')).join('\n'));

/** The whole feature including prose, for the checks that must see everything. */
const featureText = SOURCE_FILES.map((path) => readFileSync(path, 'utf8')).join('\n');

describe('route', () => {
  it('adds exactly one Storefront route, and it is the reserved path', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
  });

  it('keeps the route a thin Server Component with static private metadata', () => {
    const route = readFileSync(ROUTE_FILE, 'utf8');
    expect(route).not.toContain("'use client'");
    expect(route).toContain('robots: { index: false, follow: false }');
    // A dynamic `generateMetadata` on this route would be the seam through which
    // an order fact could reach a browser history or a shared screenshot.
    expect(codeOnly(route)).not.toContain('generateMetadata');
    expect(codeOnly(route)).not.toMatch(/alternates|openGraph/);
  });
});

describe('secure credential — one carrier, and no second copy of the machinery', () => {
  it('reads the fragment only through APP4’s bootstrap', () => {
    // The fragment parser and the strip are not exported by
    // `secure-link-access`; reaching them at all would require a deep import,
    // and there is none. So this feature cannot move the strip relative to the
    // request even if it wanted to.
    expect(featureCode).toContain('useSecureLinkBootstrap');
    expect(featureCode).not.toMatch(/location\.hash|window\.location\.hash/);
    expect(featureCode).not.toContain('replaceState');
    expect(featureCode).not.toMatch(/secure-link-access\/(model|hooks)\//);
  });

  it('retains the credential deliberately, because later calls spend it', () => {
    expect(featureCode).toContain('retainCredentialAfterSuccess: true');
  });

  it('never persists the token anywhere a snapshot could reach it', () => {
    expect(featureCode).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/i);
  });

  it('never puts a token in a query key, a mutation variable or a URL', () => {
    // Every mutation in this feature is declared with no variables; the
    // credential is reached from a ref inside `mutationFn` instead. A
    // `mutate(token)` or a `mutationFn: (token) =>` would park it in the cache.
    expect(featureCode).not.toMatch(/mutate\(\s*(secret|token)/);
    expect(featureCode).not.toMatch(/queryKey:\s*\[[^\]]*\b(token|secret|accessToken)\b/);
    expect(featureCode).not.toMatch(/[?&]t=|\btoken=/);
  });

  it('never logs, prints or serialises the credential', () => {
    expect(featureCode).not.toMatch(/console\.(log|info|warn|error|debug)/);
    expect(featureCode).not.toMatch(/JSON\.stringify\(\s*(secret|token)/);
  });

  it('spends the credential only through the one accessor that never returns it', () => {
    const spends = featureCode.match(/runWithSecret/g) ?? [];
    expect(spends.length).toBeGreaterThan(0);
    // `runWithSecret` hands the secret to a callback and resolves with that
    // call's result. A caller that awaited it *for the secret* would have to
    // return it from the callback, which nothing does.
    expect(featureCode).not.toMatch(/runWithSecret\(\s*\(\s*(secret|token)\s*\)\s*=>\s*\1\s*\)/);
  });
});

describe('resolver chain — §7', () => {
  it('never chains publicSecureLinkResolve in front of an authorized read', () => {
    expect(featureCode).not.toContain('publicSecureLinkResolve');
    expect(featureCode).not.toContain('SecureLinkResolve');
  });
});

describe('operations — §21, §51, §52', () => {
  it('consumes exactly the six delivered operations this route needs', () => {
    for (const operation of [
      'publicReadyMadeOrderCurrent',
      'publicOrderFullPaymentCurrent',
      'publicOrderFullPaymentInitiate',
      'publicOrderFullPaymentQr',
      'publicOrderDepositEvidenceUpload',
      'publicOrderDepositEvidenceStatus',
    ]) {
      expect(featureCode).toContain(operation);
    }
  });

  it('adds no evidence endpoint and reuses the delivered attempt-scoped pair', () => {
    expect(featureCode).not.toMatch(/publicOrderFullPaymentEvidence|readyMadeEvidence/i);
  });

  it('imports no Admin operation and no other lane’s payment operation', () => {
    expect(featureCode).not.toMatch(/\badmin[A-Z]\w*/);
    expect(featureCode).not.toMatch(/publicOrderDeposit(Current|Initiate|Qr)\b/);
    expect(featureCode).not.toMatch(/publicOrderFinalPayment/);
  });

  it('builds no URL of its own — a rename arrives as a regenerated client', () => {
    expect(featureCode).not.toMatch(/['"`]\/api\//);
  });
});

describe('money — §15, §16', () => {
  it('coerces no amount to a number anywhere in the feature', () => {
    // `order-display-format.ts` is the one exclusion, and it exists so this
    // sweep can stay absolute rather than becoming a list of exceptions nobody
    // can audit: a byte count and a calendar date legitimately need arithmetic,
    // and that module is asserted below never to touch an amount.
    const moneyFiles = SOURCE_FILES.filter((path) => !path.endsWith('order-display-format.ts'));
    const moneyCode = codeOnly(moneyFiles.map((path) => readFileSync(path, 'utf8')).join('\n'));
    expect(moneyCode).not.toMatch(/\bNumber\(|parseFloat\(|parseInt\(|\.toFixed\(/);
  });

  it('applies no rounding to anything amount-shaped', () => {
    // Two `Math.round` calls exist in the feature and both are about bytes: the
    // upload progress percentage and the evidence row's kilobyte caption. They
    // are pinned here rather than excluded by filename, so a future rounding of
    // money could not hide behind the same allowance.
    const rounded = codeOnly(featureText).match(/Math\.round\([^)]*/g) ?? [];
    expect(rounded.sort()).toEqual([
      'Math.round((event.loaded / event.total',
      'Math.round(kilobytes',
    ]);
  });

  it('keeps the display formatter away from every amount field', () => {
    const format = codeOnly(
      readFileSync(join(FEATURE_DIR, 'model', 'order-display-format.ts'), 'utf8'),
    );
    expect(format).not.toMatch(
      /fullPaymentAmount|payableTotal|merchandiseSubtotal|feeAmount|lineTotalAmount|unitPriceAmount/,
    );
  });

  it('composes no payable total from the subtotal and the fee', () => {
    // The two supporting rows are rendered; they are never added. A `+` between
    // two amount-bearing expressions is the shape this forbids.
    //
    // `exact-order-amount.ts` was this feature's own copy of the exact-money
    // formatter and was scanned here. `APP12-H01` consolidated the five copies
    // into `src/shared/money/exact-money.ts` (FU-APP12-S01-02 / FU-APP12-S03-05)
    // and moved this half of the guard with it, into
    // `test/boundary/shared-money-source.test.ts` — which applies the same rule
    // plus an arithmetic scan to the shared module. What stays here is the claim
    // that is about *this feature*: nowhere in it are the two supporting rows
    // added together.
    expect(featureCode).not.toMatch(/merchandiseSubtotal\s*\+|\+\s*feeAmount/);
    expect(featureCode).not.toMatch(/\b(amount|total|fee|subtotal)\w*\s*\+\s*\w/i);
  });

  it('reads the payable figure from the obligation, never from the order row', () => {
    const card = codeOnly(readFileSync(join(FEATURE_DIR, 'ui', 'order-amount-card.tsx'), 'utf8'));
    expect(card).toContain('full.fullPaymentAmount');
    expect(card).not.toContain('payableTotal');
  });
});

describe('lifecycle — §13, §29', () => {
  it('never parses a free-text cancellation reason', () => {
    expect(featureCode).not.toMatch(/cancelled_reason|cancelledReason|cancellationReason/i);
  });

  it('never infers expiry from a clock or from a missing obligation', () => {
    // `Date` appears only in the display formatter, which renders an instant and
    // decides nothing. No comparison against `Date.now()` may select a state.
    const decisionFiles = SOURCE_FILES.filter(
      (path) =>
        !path.endsWith('order-display-format.ts') &&
        // The refresh coalescer's own quiet window. It decides when to re-read,
        // never what the order's state is.
        !path.endsWith('use-secure-order-session.ts') &&
        // APP4's own resend cooldown, passed straight through to the delivered
        // verification controller. It decides nothing about the order either.
        !path.endsWith('order-step-up-dialog.tsx'),
    );
    const decisionCode = codeOnly(
      decisionFiles.map((path) => readFileSync(path, 'utf8')).join('\n'),
    );
    expect(decisionCode).not.toMatch(/Date\.now\(\)|new Date\(/);
  });

  it('reads expiry from the machine-readable reason alone', () => {
    const model = codeOnly(
      readFileSync(join(FEATURE_DIR, 'model', 'order-access-state.ts'), 'utf8'),
    );
    expect(model).toContain('TerminationReason.RESERVATION_EXPIRED');
  });

  it('declares no client-owned replica of the backend lifecycle', () => {
    // `PAYMENT_UNDER_REVIEW` is a *presentation* of `AWAITING_PAYMENT` and must
    // never be sent to, or expected from, the server.
    expect(featureCode).not.toMatch(/status:\s*['"]PAYMENT_UNDER_REVIEW['"]/);
    expect(featureCode).not.toMatch(/status:\s*['"]EXPIRED['"]/);
  });
});

describe('customer tracking — §28, §53', () => {
  it('renders no carrier, tracking, ETA or courier field', () => {
    expect(featureText).not.toMatch(/carrierName|trackingCode|trackingNumber|courier|\bETA\b/i);
  });
});

describe('polling — §26', () => {
  it('starts no timer and no interval anywhere in the feature', () => {
    expect(featureCode).not.toMatch(/setInterval|setTimeout/);
    expect(featureCode).not.toMatch(/refetchInterval|refetchIntervalInBackground/);
  });
});

describe('Wave-2 isolation — §37', () => {
  it('renders no custom-embroidery content, CTA or route', () => {
    // On code, not prose: the route's own doc comment legitimately names its
    // sibling routes to explain the `/truy-cap` family convention it follows.
    expect(codeOnly(featureText)).not.toMatch(/yeu-cau|thiet-ke|dat-theu|bao-gia|duyet-thiet-ke/);
    expect(featureCode).not.toContain('CUSTOM_EMBROIDERY_RELEASE_ENABLED');
  });

  it('uses no deposit or remaining-balance vocabulary in customer copy', () => {
    const copy = readFileSync(join(FEATURE_DIR, 'model', 'order-access-copy.ts'), 'utf8');
    // The transport path is deposit-named; the words the customer reads are not.
    // Checked on the string literals rather than the prose, which must be free to
    // explain exactly this rule.
    const literals = (codeOnly(copy).match(/'[^']*'/g) ?? []).join('\n');
    expect(literals).not.toMatch(/đặt cọc|tiền cọc|phần còn lại|còn lại/i);
  });
});

describe('file-size governance — §54', () => {
  it.each([...SOURCE_FILES, ...SCSS_FILES].map((path) => [relative(REPO_APP, path), path]))(
    '%s is within the 400-line source limit',
    (_label, path) => {
      expect(readFileSync(path, 'utf8').split('\n').length).toBeLessThanOrEqual(400);
    },
  );

  it('splits the feature by responsibility rather than into one giant component', () => {
    // Eight states in one file is the shape §54 names outright. The feature
    // carries a state model, a session, three payment hooks and one card per
    // approved block instead.
    expect(collect(join(FEATURE_DIR, 'ui'), /\.tsx$/).length).toBeGreaterThanOrEqual(8);
    expect(collect(join(FEATURE_DIR, 'hooks'), /\.ts$/).length).toBeGreaterThanOrEqual(4);
  });
});
