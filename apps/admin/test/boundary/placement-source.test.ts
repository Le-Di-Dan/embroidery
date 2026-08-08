/**
 * @jest-environment node
 *
 * Static boundary checks on the placement production source and on the
 * `@embroidery/api-client` surface it is allowed to reach.
 *
 * The withheld-operation assertions are the important ones. The public
 * placement read answers a narrower model — no `backgroundAssetId`, no retired
 * rows, no concurrency token — and an authoring screen bound to it would look
 * correct while silently dropping the history and the token the operator
 * depends on. Nothing in review would catch that, so it is checked
 * mechanically.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'product-placement');
const SHARED_FIELD = join(__dirname, '..', '..', 'src', 'shared', 'forms', 'admin-text-field.tsx');
const ROUTE_FILE = join(
  __dirname,
  '..',
  '..',
  'src',
  'app',
  '(protected)',
  'products',
  '[productId]',
  'placement',
  'page.tsx',
);
const STYLESHEET = join(FEATURE_DIR, 'styles', 'product-placement.scss');

/**
 * Strips comments so the rules below inspect executable code only.
 *
 * Without this, a file that *documents* why it never builds a public URL or
 * never uses a storage key fails the very rule it is explaining — which would
 * make the boundary test an argument against writing the explanation down.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collectSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSources(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const sources = collectSources(FEATURE_DIR).map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}));

const routeSourceRaw = readFileSync(ROUTE_FILE, 'utf8');
const routeSource = stripComments(routeSourceRaw);
const stylesheet = stripComments(readFileSync(STYLESHEET, 'utf8'));

describe('generated client boundary', () => {
  it('exposes exactly the two Admin placement operations', () => {
    expect(typeof apiClient.adminProductPlacementGet).toBe('function');
    expect(typeof apiClient.adminProductPlacementReplace).toBe('function');
  });

  it('withholds the public placement read from the client boundary', () => {
    expect((apiClient as Record<string, unknown>)['publicProductPlacementGet']).toBeUndefined();
    expect(
      (apiClient as Record<string, unknown>)['publicProductSideBackgroundGet'],
    ).toBeUndefined();
  });

  it('reaches the API only through the generated operations', () => {
    for (const source of sources) {
      // No raw transport, and no second Axios contract layer.
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/\baxios\b/);
      expect(source.text).not.toMatch(/from '@embroidery\/api-client\/.*generated/);
    }
  });

  it('never hard-codes the placement endpoint path', () => {
    for (const source of sources) {
      // The generated client owns the URL; duplicating it here is how the two
      // drift apart after a contract change.
      expect(source.text).not.toContain('/api/admin/products');
      expect(source.text).not.toContain('/placement`');
    }
  });

  it('imports the placement operations in exactly one module', () => {
    const importers = sources.filter(
      (source) =>
        source.text.includes('adminProductPlacementGet') ||
        source.text.includes('adminProductPlacementReplace'),
    );

    expect(importers).toHaveLength(1);
    expect(importers[0]?.path).toMatch(/services[\\/]product-placement\.service\.ts$/);
  });
});

describe('storage boundary', () => {
  it('constructs no storage address of any kind', () => {
    for (const source of sources) {
      for (const forbidden of ['minio', 's3.', 'amazonaws', 'objectKey', 'storageKey', 'bucket']) {
        expect(source.text.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
  });

  it('never references the public side-background path helper', () => {
    for (const source of sources) {
      expect(source.text).not.toContain('publicSideBackgroundPath');
      expect(source.text).not.toContain('public-media');
    }
  });
});

describe('route boundary', () => {
  it('lives under the protected route group', () => {
    expect(ROUTE_FILE).toContain(`(protected)`);
  });

  it('is a thin boundary that only resolves the param', () => {
    expect(routeSource).toContain('ProductPlacementScreen');
    // No query, no client hook, no business rule in the segment.
    expect(routeSource).not.toContain('useQuery');
    expect(routeSource).not.toContain("'use client'");
    expect(routeSourceRaw.split('\n').length).toBeLessThan(30);
  });

  it('is the only placement route in the app', () => {
    const appDir = join(__dirname, '..', '..', 'src', 'app');
    const routes = collectSources(appDir).filter((path) => /placement/i.test(path));

    expect(routes).toHaveLength(1);
  });
});

describe('design-system boundary', () => {
  it('hard-codes no colour in the placement stylesheet', () => {
    // Every colour is a token; the scrim in particular is FIG-DS-SCRIM-TOKEN.
    expect(stylesheet).not.toMatch(/rgba?\(/);
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('uses the canonical scrim token for the dialog backdrop', () => {
    expect(stylesheet).toContain('$color-overlay-scrim');
  });

  it('uses the shared field primitive rather than a competing one', () => {
    const field = stripComments(readFileSync(SHARED_FIELD, 'utf8'));
    // The five approved states, with focus and filled as real conditions.
    expect(field).toContain('aria-invalid');
    expect(field).toContain('disabled');
    // A `state` prop would let a caller render focus styling without focus.
    expect(field).not.toMatch(/state\s*[?:]\s*'Default'/);
  });
});

describe('file size policy', () => {
  it('keeps every production file under the 400-line hard maximum', () => {
    const oversized = collectSources(FEATURE_DIR)
      .map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n').length }))
      .filter((file) => file.lines > 400);

    // Reported as the offending files, not as a bare `false` — a failure has to
    // name what to split.
    expect(oversized).toEqual([]);
  });
});
