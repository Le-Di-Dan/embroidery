/**
 * `APP8-A03` source boundaries.
 *
 * What a rendered test cannot prove: that the screen reaches the API only
 * through the two generated operations this checkpoint owns, that no classifier
 * branches on message text, that no second read is opened to enrich the frozen
 * specification, that the cache is never flushed wholesale, that no browser-side
 * eligibility gate is reconstructed from the reservation summary, and that the
 * approved narrow viewport reflows without dropping a fact.
 *
 * The viewport assertions are made against the stylesheet rather than through a
 * browser, which is the smallest method that can settle them: jsdom applies no
 * CSS, so a rendered test at 1280 would assert nothing about layout, and
 * standing up Playwright for one breakpoint would be a broad run with no
 * demonstrated impact.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'production-job');

function collectFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

const sources = collectFiles(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path: path.replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const code = sources.map((source) => ({ ...source, text: stripComments(source.text) }));

const stylesheet = collectFiles(join(FEATURE_DIR, 'styles'), /\.scss$/)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('the generated client boundary', () => {
  it('consumes exactly the two operations APP8-A03 owns', () => {
    const client = apiClient as Record<string, unknown>;
    expect(typeof client['adminProductionJobGet']).toBe('function');
    expect(typeof client['adminProductionJobTransition']).toBe('function');
    expect(code.some((source) => source.text.includes('adminProductionJobGet'))).toBe(true);
    expect(code.some((source) => source.text.includes('adminProductionJobTransition'))).toBe(true);
  });

  it('reaches the API through no other transport', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      expect(source.text).not.toMatch(/\/api\/admin/);
    }
  });

  it('never deep-imports the generated tree', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/@embroidery\/api-client\/.*generated/);
    }
  });

  it('opens no second read to enrich the frozen specification', () => {
    // The specification is a copy taken from the approval at creation. Reading a
    // live Catalog, Product, quotation, Design Session, payment or customer to
    // "improve" it would replace what is being produced with what is currently
    // sold — the enrichment `788:179` refuses by name.
    // Whole-word matches, so the *route* helper `adminOrderDetailRoute` — which
    // only builds a link — is not mistaken for the `adminOrderDetail` read.
    for (const source of code) {
      for (const operation of [
        'adminProductDetail',
        'adminProductList',
        'adminOrderDetail',
        'adminOrderList',
        'adminOrderPaymentRead',
        'adminSkuStockGet',
        'adminSkuStockAdjust',
        'adminSkuStockLedger',
        'adminQuotationVersionDetail',
        'adminDesignTemplateDetail',
        'publicProductDetail',
      ]) {
        expect(source.text).not.toMatch(new RegExp(`\\b${operation}\\b`));
      }
    }
  });
});

describe('no unsupported capability', () => {
  it('invents no production operation A03 does not own', () => {
    for (const source of code) {
      expect(source.text).not.toContain('adminProductionJobCreate');
    }
  });

  it('carries no vocabulary the production model does not have', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(
        /\b(priority|slaMinutes|operatorId|machineId|attemptCount|skuCode)\b/,
      );
      expect(source.text).not.toMatch(/'(QUEUED|RUNNING|BLOCKED|FAILED|CLAIMED|RETRYING)'/);
    }
  });

  it('names only the three destinations the transition contract accepts', () => {
    const actions = code.find((source) => source.path.endsWith('production-job-actions.ts'));
    expect(actions?.text).toMatch(/start:\s*'STARTED'/);
    expect(actions?.text).toMatch(/complete:\s*'COMPLETED'/);
    expect(actions?.text).toMatch(/cancel:\s*'CANCELLED'/);
    // `PLANNED` is the state a job is created in, never a destination.
    expect(actions?.text).not.toMatch(/to.*'PLANNED'/);
  });

  it('builds the two reasonless bodies with no field to put a reason in', () => {
    const service = code.find((source) => source.path.endsWith('production-transition.service.ts'));
    // Sending `reason` with STARTED or COMPLETED is a published 400, so the two
    // builders take no argument at all.
    expect(service?.text).toMatch(/function startProductionBody\(\)/);
    expect(service?.text).toMatch(/function completeProductionBody\(\)/);
    expect(service?.text).toMatch(/function cancelProductionBody\(reason: string\)/);
  });
});

describe('the server owns legality', () => {
  it('derives the action set from the job status and from nothing else', () => {
    const actions = code.find((source) => source.path.endsWith('production-job-actions.ts'));
    // A reservation, a count, a deposit or an order state read here would be
    // GRD-015 reconstructed in the browser from a figure taken without the stock
    // row lock.
    for (const forbidden of [
      'reservationSummary',
      'catalogItemCount',
      'customerOwnedItemCount',
      'required',
      'deposit',
      'orderStatus',
    ]) {
      expect(actions?.text).not.toContain(forbidden);
    }
  });

  it('never disables a transition control from the reservation summary', () => {
    const card = code.find((source) => source.path.endsWith('production-actions-card.tsx'));
    // The card reads the summary for one thing only: which *sentence* a
    // customer-owned-only order gets under the buttons. No `disabled` prop
    // anywhere on this card is derived from it — there is none at all.
    expect(card?.text).not.toMatch(/disabled=/);
  });
});

describe('failure classification', () => {
  it('never branches on a server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/\.message\.(includes|match|startsWith|toLowerCase)/);
    }
  });

  it('classifies every refusal on the published code, not on prose', () => {
    const failure = code.find((source) => source.path.endsWith('production-job-failure.ts'));
    for (const published of [
      'PRODUCTION_JOB_NOT_FOUND',
      'PRODUCTION_DEPOSIT_NOT_SATISFIED',
      'PRODUCTION_ORDER_ON_HOLD',
      'PRODUCTION_BLOCKED',
      'PRODUCTION_APPROVAL_MISMATCH',
      'PRODUCTION_RESERVATION_NOT_ACTIVE',
      'PRODUCTION_RESERVATION_INSUFFICIENT',
      'PRODUCTION_INVALID_TRANSITION',
      'PRODUCTION_CANCELLATION_REASON_REQUIRED',
    ]) {
      expect(failure?.text).toContain(published);
    }
    expect(failure?.text).toContain('httpStatus');
  });

  it('retries nothing automatically', () => {
    // `787:184` forbids an automatic retry of a refused command outright, and an
    // Admin read must not loop against a private endpoint either.
    const query = code.find((source) => source.path.endsWith('use-production-job-query.ts'));
    const transition = code.find((source) => source.path.endsWith('use-production-transition.ts'));
    expect(query?.text).toContain('retry: false');
    expect(transition?.text).toContain('retry: false');
    for (const source of code) {
      expect(source.text).not.toMatch(/setInterval|refetchInterval:\s*\d/);
    }
  });

  it('never flushes the cache wholesale', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\.clear\(\)/);
      expect(source.text).not.toMatch(/invalidateQueries\(\s*\)/);
      expect(source.text).not.toMatch(/resetQueries\(/);
    }
    // The two invalidations that exist are both keyed, and the queue key comes
    // from `APP8-A02`'s own factory rather than a literal spelled here.
    const query = code.find((source) => source.path.endsWith('use-production-job-query.ts'));
    expect(query?.text).toMatch(
      /invalidateQueries\(\{ queryKey: productionJobKeys\.detail\(jobId\) \}\)/,
    );
    expect(query?.text).toMatch(
      /invalidateQueries\(\{ queryKey: productionJobKeys\.queue\(\) \}\)/,
    );
    const keys = code.find((source) => source.path.endsWith('production-job-keys.ts'));
    expect(keys?.text).toContain('productionQueueKeys');
  });

  it('duplicates no server state into a browser store', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/from\s+['"]zustand['"]/);
    }
  });
});

describe('the approved narrow viewport (`789:160`)', () => {
  it('reflows rather than hiding: nothing on this screen is dropped at 1280', () => {
    // Every `display: none` in the feature must belong to an `:empty` rule —
    // the two live regions collapse when they carry no announcement. A card,
    // field or column quietly hidden at a breakpoint fails here rather than in
    // a review, because the approved narrow frame drops nothing at all.
    const chunks = stylesheet.split(/display:\s*none/);
    for (const preceding of chunks.slice(0, -1)) {
      expect(preceding.slice(-80)).toMatch(/:empty\s*\{/);
    }
    // No section is parked behind an overflow menu either, and nothing scrolls
    // sideways.
    expect(stylesheet).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it('collapses the two columns and lifts the action card above the fold', () => {
    expect(stylesheet).toContain('.job-columns__aside');
    expect(stylesheet).toMatch(/order:\s*-1/);
    // The specification grid narrows from three tracks to two, keeping every
    // field (`789:217`).
    expect(stylesheet).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(stylesheet).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });

  it('states reservation and lifecycle meaning in words, never in colour alone', () => {
    // Every reservation state renders its label; the tone only tints it.
    expect(stylesheet).toContain('.job-reservation__status');
    for (const tone of ['--success', '--info', '--neutral']) {
      expect(stylesheet).toContain(`.job-reservation__status`);
      expect(stylesheet).toContain(tone);
    }
    const card = code.find((source) => source.path.endsWith('production-reservation-card.tsx'));
    expect(card?.text).toContain('row.status.label');
  });
});
