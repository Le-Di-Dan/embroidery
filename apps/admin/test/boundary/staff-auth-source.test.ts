/**
 * @jest-environment node
 *
 * Static boundary checks on the staff-auth production source. These guard the
 * rules the login feature must never break: no raw fetch, no client-side
 * cookie/token/storage handling, no inline styles or CSS Modules, and no deep
 * import into the generated api-client tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIRS = [
  join(__dirname, '..', '..', 'src', 'features', 'staff-auth'),
  join(__dirname, '..', '..', 'src', 'providers'),
  join(__dirname, '..', '..', 'src', 'config'),
];

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

const sources = FEATURE_DIRS.flatMap(collectSources).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));

describe('staff-auth production source boundaries', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it('never uses fetch for API calls', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never touches cookies, tokens or web storage in the browser', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /localStorage|sessionStorage|document\.cookie/.test(text) }).toEqual({
        path,
        hit: false,
      });
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

  it('does not import the test-only frontend-testing package', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: text.includes('@embroidery/frontend-testing') }).toEqual({
        path,
        hit: false,
      });
    }
  });
});
