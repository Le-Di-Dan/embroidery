/**
 * @jest-environment node
 *
 * Static boundary checks on the publication production source and on the
 * `@embroidery/api-client` surface it is allowed to reach.
 *
 * The archive assertions are the important ones. Unpublish and archive are
 * different lifecycle transitions that a reader could easily conflate, and
 * `FU-APP2-PRODUCT-ARCHIVE-UI-01` has no approved surface — so the guarantee
 * that this checkpoint cannot reach archive has to be checked mechanically, not
 * left to review.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'products');
const ROUTE_FILE = join(
  __dirname,
  '..',
  '..',
  'src',
  'app',
  '(protected)',
  'products',
  '[productId]',
  'publication',
  'page.tsx',
);

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

const publicationSources = collectSources(FEATURE_DIR)
  .filter((path) => /publication/i.test(path))
  .map((path) => ({ path, text: stripComments(readFileSync(path, 'utf8')) }));

const routeSource = stripComments(readFileSync(ROUTE_FILE, 'utf8'));
/** Kept unstripped for the "thin route" size assertion. */
const routeSourceRaw = readFileSync(ROUTE_FILE, 'utf8');

describe('generated client boundary', () => {
  it('exposes exactly the three publication operations', () => {
    expect(typeof apiClient.adminProductPublicationReadiness).toBe('function');
    expect(typeof apiClient.adminProductPublish).toBe('function');
    expect(typeof apiClient.adminProductUnpublish).toBe('function');
  });

  it('still withholds the archive operation', () => {
    expect('adminProductArchive' in apiClient).toBe(false);
  });

  it('exports the requirement codes as a value so the screen cannot invent them', () => {
    expect(Object.values(apiClient.AdminProductRequirementResponseCode)).toHaveLength(7);
  });
});

describe('publication production source boundaries', () => {
  it('discovers the publication source files', () => {
    expect(publicationSources.length).toBeGreaterThan(5);
  });

  it('never calls or names the archive operation', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /adminProductArchive|\barchive\(/i.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('never uses fetch for API calls', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never handwrites an API path (generated operations own URLs)', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /['"`]\/api\//.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never constructs the public product path', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /\/san-pham/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('renders no image element and fabricates no media URL', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /<img\b|createObjectURL|storageKey|checksum/i.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('imports the api-client only through its public boundary', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /generated\/embroidery-api/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never touches cookies, tokens or web storage', () => {
    for (const { path, text } of publicationSources) {
      expect({
        path,
        hit: /localStorage|sessionStorage|document\.cookie|Authorization/i.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('uses no inline styles, CSS Modules or dangerous HTML', () => {
    for (const { path, text } of publicationSources) {
      expect({
        path,
        hit: /style=\{\{|\.module\.(css|scss)|dangerouslySetInnerHTML/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('creates no second QueryClient, Axios instance or store', () => {
    for (const { path, text } of publicationSources) {
      expect({
        path,
        hit: /new QueryClient|axios\.create|from ['"]zustand/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('never polls', () => {
    for (const { path, text } of publicationSources) {
      expect({
        path,
        hit: /refetchInterval:\s*\d|setInterval\s*\(/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('logs no payload, error or token', () => {
    for (const { path, text } of publicationSources) {
      expect({ path, hit: /console\.(log|error|warn|info)/.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });
});

describe('publication route segment', () => {
  it('is a thin boundary that only resolves the param', () => {
    expect(routeSource).toContain('ProductPublicationScreen');
    expect(routeSourceRaw.split('\n').length).toBeLessThan(30);
  });

  it('lives inside the protected shell', () => {
    expect(ROUTE_FILE).toContain('(protected)');
  });

  it('prefetches nothing — the token must not be dehydrated on the server', () => {
    expect(/prefetch|dehydrate|HydrationBoundary/.test(routeSource)).toBe(false);
  });
});
