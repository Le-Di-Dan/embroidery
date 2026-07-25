/**
 * @jest-environment node
 *
 * Static boundary checks on the admin-shell production source. These guard the
 * architectural rules the shell must never break: no raw fetch, no client-side
 * cookie/token/storage handling, no second QueryClient or global staff store, no
 * polling, no bearer auth, no handwritten API path, no inline styles/CSS
 * Modules, and no deep import into the generated api-client tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'admin-shell');

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

describe('admin-shell production source boundaries', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('never uses fetch for API calls', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
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

  it('never bearer-authenticates or sets an Authorization header', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /Bearer\s|Authorization/i.test(text) }).toEqual({ path, hit: false });
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

  it('imports the api-client only through its public boundary, never the generated tree', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /generated\/embroidery-api/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never handwrites an API path (generated operations own URLs)', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /['"`]\/api\//.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('creates no second QueryClient and no external staff store', () => {
    for (const { path, text } of sources) {
      expect({
        path,
        hit: /new QueryClient|from ['"]zustand|createStore/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('creates no ad-hoc Axios instance', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /axios\.create|new Axios/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never polls: no numeric refetchInterval and no setInterval', () => {
    for (const { path, text } of sources) {
      expect({
        path,
        hit: /refetchInterval:\s*\d/.test(text) || /setInterval\s*\(/.test(text),
      }).toEqual({ path, hit: false });
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
