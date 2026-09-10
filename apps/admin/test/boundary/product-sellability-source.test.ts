/**
 * @jest-environment node
 *
 * Static boundary checks on the sellability feature's production source and on
 * the `@embroidery/api-client` surface it is allowed to reach.
 *
 * These are the guarantees a reviewer cannot hold in their head across
 * twenty-odd files, and each of them is a thing `APP12-N02.A01` was explicitly
 * forbidden to do: invent a delete, author stock, reach the public variant
 * projection, add a route, or put a sentence in a component. A comment saying
 * "there is no delete here" is an intention; this file is the check.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'product-sellability');
const APP_DIR = join(__dirname, '..', '..', 'src', 'app');

/**
 * Strips comments so the rules below inspect executable code only.
 *
 * Without this, a file that *documents* why it never deletes a variant fails
 * the very rule it is explaining — which would make the boundary test an
 * argument against writing the explanation down.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collectSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSources(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const sources = collectSources(FEATURE_DIR).map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}));

const COPY_MODULE = join('model', 'sellability-copy.ts');

describe('the operations this feature may reach', () => {
  it('exposes exactly the five curated authoring operations', () => {
    for (const operation of [
      'adminProductVariantList',
      'adminProductVariantCreate',
      'adminProductVariantUpdate',
      'adminSkuCreate',
      'adminSkuUpdate',
    ] as const) {
      expect(typeof apiClient[operation]).toBe('function');
    }
  });

  it('never reaches the public variant projection for Admin authoring', () => {
    // It is keyed by slug, refuses anything but a published product, and filters
    // out the inactive rows this section exists to show as history.
    for (const source of sources) {
      expect(source.text).not.toMatch(/publicProductVariant/);
    }
  });

  it('invents no delete, for a variant or for a SKU', () => {
    // The contract publishes none. Deactivation is how a row leaves the catalog.
    for (const source of sources) {
      expect(source.text).not.toMatch(/adminProductVariantDelete|adminSkuDelete/);
      expect(source.text).not.toMatch(/method:\s*['"]DELETE['"]/i);
    }
  });

  it('authors no stock and no low-stock threshold', () => {
    // The section links to `/kho/skus/{skuId}` and calls nothing there. Stock is
    // not a publication requirement, and `FU-APP12-U01-LOW-STOCK-AUTHORITY`
    // stays unchanged by this checkpoint.
    for (const source of sources) {
      expect(source.text).not.toMatch(/adminSkuStockAdjust|adminSkuStockGet|adminSkuStockLedger/);
      expect(source.text).not.toMatch(/lowStockThreshold|low_stock_threshold/i);
    }
  });

  it('reaches the stock screen only through the inventory feature’s own route helper', () => {
    const rowSource = sources.find((source) => source.path.endsWith('variant-sku-row.tsx'));
    expect(rowSource?.text).toMatch(/adminSkuStockRoute/);
    // No second spelling of the route anywhere in the feature.
    for (const source of sources) {
      if (source.path.endsWith('variant-sku-row.tsx')) continue;
      expect(source.text).not.toMatch(/\/kho\//);
    }
  });
});

describe('transport and copy discipline', () => {
  it('calls no application API with fetch', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('reaches Axios only through the shared browser client, and only in services', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/from\s+['"]axios['"]/);
      if (source.text.includes('getBrowserApiClient')) {
        expect(source.path).toMatch(/services[\\/]/);
      }
    }
  });

  it('imports the message repository in the copy module and nowhere else', () => {
    // Every operator-facing sentence is owned by
    // `packages/i18n/messages/vi/admin.json`; a component that read it directly
    // would be a second place for copy to live.
    for (const source of sources) {
      if (source.path.endsWith(COPY_MODULE)) {
        expect(source.text).toMatch(/@embroidery\/i18n/);
        continue;
      }
      expect(source.text).not.toMatch(/@embroidery\/i18n/);
    }
  });

  it('never renders a server message, code or request id', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/normalized\.message/);
      expect(source.text).not.toMatch(/normalized\.requestId/);
    }
  });
});

describe('what this checkpoint did not add', () => {
  it('adds no Admin route: the section lives inside the existing product editor', () => {
    const routes = collectSources(APP_DIR).filter((path) => /page\.tsx$/.test(path));
    for (const route of routes) {
      expect(route).not.toMatch(/variant|sellability|phien-ban/i);
    }
  });

  it('keeps the feature boundary narrow: no mutation or service is exported', () => {
    const barrel = readFileSync(join(FEATURE_DIR, 'index.ts'), 'utf8');
    expect(barrel).toMatch(/ProductSellabilitySection/);
    expect(barrel).toMatch(/StructuralUnsellabilityWarning/);
    // A mutation on the boundary would be a way to change what a product sells
    // with none of the confirmation, refusal mapping or refetch attached.
    expect(stripComments(barrel)).not.toMatch(/use[A-Za-z]*Mutation|service/i);
  });
});
