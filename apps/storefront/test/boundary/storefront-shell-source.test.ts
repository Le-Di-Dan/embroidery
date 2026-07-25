/**
 * @jest-environment node
 *
 * Static boundary checks on the storefront-shell production source and the
 * Storefront app-router tree. These guard the architectural rules the shell must
 * never break: no raw fetch or API client, no client-side cookie/token/storage
 * handling, no second QueryClient or global store, no inline styles / CSS Modules,
 * and — the S01A scope boundary — no not-found implementation (that belongs to
 * APP1-S01B).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'storefront-shell');
const APP_DIR = join(__dirname, '..', '..', 'src', 'app');

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
  text: readFileSync(path, 'utf8'),
}));

describe('storefront-shell production source boundaries', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it('never uses fetch or an API client (the shell calls no API)', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
      expect({ path, hit: /@embroidery\/api-client/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never touches cookies, tokens or web storage in the browser', () => {
    for (const { path, text } of sources) {
      expect({
        path,
        hit: /localStorage|sessionStorage|document\.cookie/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('never uses inline styles or CSS Modules', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /style=\{\{|\.module\.(css|scss)/.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('creates no QueryClient, store, or ad-hoc Axios instance (no new provider)', () => {
    for (const { path, text } of sources) {
      expect({
        path,
        hit: /new QueryClient|QueryClientProvider|from ['"]zustand|createStore|axios\.create|new Axios/.test(
          text,
        ),
      }).toEqual({ path, hit: false });
    }
  });

  it('renders no dead anchors (href="#")', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /href=["'`]#["'`]/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('does not import the test-only frontend-testing package', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: text.includes('@embroidery/frontend-testing') }).toEqual({
        path,
        hit: false,
      });
    }
  });
});

describe('APP1-S01A scope boundary — no not-found implementation', () => {
  it('adds no not-found route file (owned by APP1-S01B)', () => {
    expect(existsSync(join(APP_DIR, 'not-found.tsx'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'not-found.ts'))).toBe(false);
    expect(existsSync(join(APP_DIR, 'global-not-found.tsx'))).toBe(false);
  });

  it('references no not-found node in the shell source', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /not-?found|notFound\s*\(/i.test(text) }).toEqual({ path, hit: false });
    }
  });
});
