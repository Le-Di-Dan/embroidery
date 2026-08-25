/**
 * `APP8-A01` source boundaries.
 *
 * What a rendered test cannot prove: that the screen reaches the API only
 * through the three generated operations this checkpoint owns, that no
 * classifier branches on message text, that no availability arithmetic
 * substitutes for the server's figure, that the cache is never flushed
 * wholesale, and that the approved narrow viewport keeps every stock metric and
 * the adjustment action on screen.
 *
 * The viewport assertions are made against the stylesheet rather than through a
 * browser, which is the smallest method that can actually settle them: jsdom
 * applies no CSS, so a rendered test at 1280 would assert nothing about layout,
 * and standing up Playwright for one breakpoint would be a broad run with no
 * demonstrated impact (§16).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'sku-stock');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

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
  it('consumes exactly the three operations APP8-A01 owns', () => {
    for (const operation of ['adminSkuStockGet', 'adminSkuStockAdjust', 'adminSkuStockLedger']) {
      expect(typeof (apiClient as Record<string, unknown>)[operation]).toBe('function');
      expect(code.some((source) => source.text.includes(operation))).toBe(true);
    }
  });

  it('reaches the API through no other transport', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      // The copy module is exempt from the path rule and only it: `775:29`
      // prints the endpoint on screen as an operator-facing annotation, which
      // is display text, not a URL anything requests.
      if (source.path.endsWith('sku-stock-copy.ts')) continue;
      expect(source.text).not.toMatch(/\/api\/admin\/skus/);
    }
  });

  it('never deep-imports the generated tree', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/@embroidery\/api-client\/.*generated/);
    }
  });
});

describe('no unsupported capability', () => {
  it('invents no operation APP8-B01 does not publish', () => {
    // An all-SKU list, a threshold write, a manual hold or reservation action,
    // and a production transition are the four the scope boundary (`788:52`)
    // names for this surface. None has a contract behind it.
    for (const invented of [
      'adminSkuStockList',
      'adminSkuStockSet',
      'adminSkuStockThreshold',
      'adminInventoryReservation',
      'adminProductionJob',
    ]) {
      expect(code.some((source) => source.text.includes(invented))).toBe(false);
    }
  });

  it('sends no body field the server owns', () => {
    // The one request body in the feature is built in a single place and holds
    // exactly `delta` and `reason`.
    const form = code.find((source) => source.path.endsWith('stock-adjustment-form.ts'));
    expect(form).toBeDefined();
    expect(form?.text).toMatch(/body:\s*\{\s*delta:[^}]*reason:[^}]*\}/);
    for (const owned of ['quantityOnHand:', 'available:', 'heldQuantity:', 'reservedQuantity:']) {
      expect(form?.text.includes(owned)).toBe(false);
    }
  });

  it('offers no ledger pagination of any kind', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/\bcursor\b/i);
      expect(source.text).not.toMatch(/useInfiniteQuery/);
      expect(source.text).not.toMatch(/\bnextPage\b/);
    }
  });
});

describe('server truth', () => {
  it('never recomputes availability into a rendered metric', () => {
    // The one place a delta is added to a figure is the dialog's own labelled
    // preview; no metric card performs arithmetic.
    const metrics = code.find((source) => source.path.endsWith('sku-stock-metrics.tsx'));
    expect(metrics?.text).not.toMatch(/[-+]\s*stock\.(held|reserved)Quantity/);
    expect(metrics?.text).toMatch(/stock\.available/);
  });

  it('branches on status and code, never on the server message', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/normalized\.message/);
    }
  });

  it('never retries a refused or unanswered adjustment automatically', () => {
    const service = code.find((source) => source.path.endsWith('stock-adjustment.service.ts'));
    expect(service?.text).not.toMatch(/setTimeout|setInterval/);
    const hook = code.find((source) => source.path.endsWith('use-stock-adjustment.ts'));
    expect(hook?.text).toMatch(/retry:\s*false/);
  });
});

describe('the query cache', () => {
  it('invalidates only this SKU and never flushes the cache', () => {
    for (const source of code) {
      // `invalidateQueries()` with no key would re-fetch every Admin screen's
      // cached data for a change that concerns one SKU.
      expect(source.text).not.toMatch(/invalidateQueries\(\s*\)/);
      expect(source.text).not.toMatch(/queryClient\.clear\(/);
      expect(source.text).not.toMatch(/removeQueries\(/);
    }
  });

  it('keeps no duplicate local copy of a server metric', () => {
    for (const source of code) {
      expect(source.text).not.toMatch(/from\s+['"]zustand['"]/);
    }
  });
});

describe('the approved narrow viewport (789:3)', () => {
  it('lets the metric row wrap rather than hiding a metric', () => {
    // Four cards at their own basis; at 1280 they no longer fit the content
    // column and fall into the 2×2 grid the frame draws.
    expect(stylesheet).toMatch(/\.stock-metrics\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(stylesheet).toMatch(/\.stock-metric\s*\{[^}]*flex:\s*1\s+1\s+\$stock-metric-basis/);
  });

  it('hides no stock metric, banner or action at any width', () => {
    expect(stylesheet).not.toMatch(/display:\s*none/);
    expect(stylesheet).not.toMatch(/visibility:\s*hidden/);
  });

  it('keeps a wide table inside its own scroll container', () => {
    // The Admin body must never scroll horizontally, however narrow the window.
    expect(stylesheet).toMatch(/\.stock-table__scroll\s*\{[^}]*overflow-x:\s*auto/);
  });
});

describe('the design authority this checkpoint built against', () => {
  it('consumes only APP8-D01 rows the Product Owner approved', () => {
    const index = readFileSync(join(REPO_ROOT, 'docs', 'design', 'FIGMA_DESIGN_INDEX.md'), 'utf8');
    for (const registryId of [
      'FIG-APP8-A01-STOCK-DEFAULT-DESKTOP',
      'FIG-APP8-A01-STOCK-LOWSTOCK-DESKTOP',
      'FIG-APP8-A01-STOCK-NEWANCHOR-DESKTOP',
      'FIG-APP8-A01-STOCK-LOADING-DESKTOP',
      'FIG-APP8-A01-STOCK-ERROR-DESKTOP',
      'FIG-APP8-A01-ADJUST-DEFAULT',
      'FIG-APP8-A01-ADJUST-VALIDATION',
      'FIG-APP8-A01-ADJUST-SUBMITTING',
      'FIG-APP8-A01-ADJUST-SUCCESS',
      'FIG-APP8-A01-ADJUST-NEGATIVE-REFUSAL',
      'FIG-APP8-A01-LEDGER-TRUNCATED',
      'FIG-APP8-REFUSAL-INVENTORY',
      'FIG-APP8-A01-STOCK-NARROW',
    ]) {
      const row = index.split('\n').find((line) => line.startsWith(`| ${registryId} |`));
      expect(row).toBeDefined();
      expect(row).toContain('APPROVED_FOR_IMPLEMENTATION');
      expect(row).toContain('FIG-APPROVAL-APP8-D01-PO-001');
    }
  });
});
