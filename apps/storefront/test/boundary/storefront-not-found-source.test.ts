/**
 * @jest-environment node
 *
 * Static boundary checks on the storefront-not-found production source and the
 * App Router not-found route file (APP1-S01B). These guard the architectural
 * rules the boundary must never break: no raw fetch or API client, no client-side
 * cookie/token/storage, no second QueryClient or global store, no inline styles /
 * CSS Modules, no dead anchors or invented routes, no `window.location` status
 * hacks, no Figma runtime dependency — and it must stay a Server Component wired
 * through a thin route file that renders no shell landmark of its own.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'storefront-not-found');
const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const ROUTE_FILE = join(APP_DIR, 'not-found.tsx');

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

const sources = [...collectSources(FEATURE_DIR), ROUTE_FILE].map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));

describe('storefront-not-found production source boundaries', () => {
  it('discovers the feature and route source files', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4);
  });

  it('never uses fetch or an API client (the boundary calls no API)', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
      expect({ path, hit: /@embroidery\/api-client/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never touches cookies, tokens or web storage', () => {
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

  it('renders no dead anchors and assigns no window.location (no client status hack)', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /href=["'`]#["'`]/.test(text) }).toEqual({ path, hit: false });
      expect({ path, hit: /window\.location|location\.(href|assign|replace)/.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('imports no test-only or Figma runtime dependency', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: text.includes('@embroidery/frontend-testing') }).toEqual({
        path,
        hit: false,
      });
      expect({ path, hit: /from ['"][^'"]*figma/i.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('stays a Server Component (no "use client" directive)', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /['"]use client['"]/.test(text) }).toEqual({ path, hit: false });
    }
  });
});

describe('App Router not-found wiring', () => {
  it('has exactly the canonical not-found route file (no global-not-found)', () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    expect(existsSync(join(APP_DIR, 'global-not-found.tsx'))).toBe(false);
  });

  it('keeps the route file thin — delegates to the feature, renders no landmark', () => {
    const route = readFileSync(ROUTE_FILE, 'utf8');
    expect(route).toMatch(/StorefrontNotFound/);
    expect(route).toMatch(/from '\.\.\/features\/storefront-not-found'/);
    // The route must not hand-render shell landmarks (ignore doc comments, which
    // legitimately describe the shell composition in prose).
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/<(header|footer|main|nav)\b/.test(code)).toBe(false);
  });
});
