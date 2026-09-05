/**
 * @jest-environment node
 *
 * Static boundary checks on the assets production source. These guard the rules
 * a runtime test cannot see: no raw transport, no storage internals, no web
 * storage, no fabricated media URL, no second poll, no inline styles, and no
 * deep import into the generated client tree.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'assets');
const ROUTE_FILE = join(__dirname, '..', '..', 'src', 'app', '(protected)', 'assets', 'page.tsx');

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

/**
 * Comments state what the code deliberately does not do, so they would trip the
 * content rules below. The whole-feature scans run against code only.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

const allText = sources.map((source) => stripComments(source.text)).join('\n');

describe('assets production source boundaries', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('never uses fetch for API calls', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /\bfetch\s*\(/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('never handwrites an API path — generated operations own every URL', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /['"`]\/api\//.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('imports the api-client only through its public boundary', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /generated\/embroidery-api/.test(text) }).toEqual({ path, hit: false });
    }
  });

  it('creates no ad-hoc Axios instance and no second QueryClient', () => {
    for (const { path, text } of sources) {
      expect({
        path,
        hit: /axios\.create|new Axios|new QueryClient/.test(text),
      }).toEqual({ path, hit: false });
    }
  });

  it('never names object storage, a bucket, a key or a presigned URL', () => {
    expect(allText).not.toMatch(/minio|s3\.|presign|bucket|storageKey|storage_key|objectKey/i);
  });

  /**
   * The rule this replaces banned `<img>` outright, and was right to while it
   * held: before `APP12-V02-C2` there was no Admin delivery contract, so any
   * `src` the feature could have produced would have been fabricated.
   * `adminAsset_preview` is that contract, so an `<img>` is now legitimate —
   * but only pointing at the application's own route.
   *
   * What has not changed is the part that was always the point: the browser
   * never manufactures an address out of bytes it holds. No `createObjectURL`,
   * no `blob:`, no data URI.
   */
  it('never builds an object URL, a blob URL or a data URI', () => {
    expect(allText).not.toMatch(/createObjectURL|URL\.create|blob:|data:image/);
  });

  it('renders an image only from the application preview route', () => {
    const previewBuilder = sources.find(({ path }) => path.endsWith('asset-preview-url.ts'));
    expect(previewBuilder).toBeDefined();
    // The one place a media path is composed, and it composes the app's own.
    expect(previewBuilder?.text).toMatch(/\/api\/admin\/assets\/\$\{/);

    for (const { path, text } of sources) {
      if (!/<img/.test(stripComments(text))) {
        continue;
      }
      // Every `<img>` takes its `src` from the shared builder — never an
      // interpolated path assembled at the point of rendering.
      expect({ path, usesBuilder: /src=\{buildAssetPreviewUrl\(/.test(text) }).toEqual({
        path,
        usesBuilder: true,
      });
    }
  });

  it('never reads file bytes: no decode, no base64, no duplicate buffer', () => {
    expect(allText).not.toMatch(/readAsDataURL|FileReader|arrayBuffer|toDataURL|btoa|base64/i);
    expect(allText).not.toMatch(/new Image\(|decode\(\)/);
  });

  it('never persists anything to the browser, the URL or a store', () => {
    expect(allText).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(allText).not.toMatch(
      /from ['"]zustand|createStore|history\.pushState|searchParams\.set/,
    );
  });

  it('never logs, and so can never log a key, a cookie or a file', () => {
    expect(allText).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  it('polls with exactly one interval constant and no timer of its own', () => {
    const numericIntervals = allText.match(/refetchInterval:\s*\d/g) ?? [];
    expect(numericIntervals).toHaveLength(0);
    expect(allText).not.toMatch(/setInterval\s*\(|WebSocket|EventSource/);

    const declarations = allText.match(/ASSET_PROCESSING_POLL_INTERVAL_MS = \d+/g) ?? [];
    expect(declarations).toEqual(['ASSET_PROCESSING_POLL_INTERVAL_MS = 3000']);
  });

  it('never uses inline styles or CSS Modules', () => {
    for (const { path, text } of sources) {
      expect({ path, hit: /style=\{\{|\.module\.(css|scss)/.test(text) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('does not import the test-only frontend-testing package', () => {
    expect(allText).not.toContain('@embroidery/frontend-testing');
  });

  it('keeps the server-only prefetch off the feature public surface', () => {
    const index = readFileSync(join(FEATURE_DIR, 'index.ts'), 'utf8');
    expect(index).not.toContain('asset-catalog.server');
    const serverModules = sources.filter((source) => /from 'next\/headers'/.test(source.text));
    expect(serverModules.map((source) => source.path.split(/[\\/]/).pop())).toEqual([
      'asset-catalog.server.ts',
    ]);
  });

  it('keeps the route segment a thin prefetch boundary with no business logic', () => {
    const route = readFileSync(ROUTE_FILE, 'utf8');
    expect(route).toContain('HydrationBoundary');
    expect(route).not.toMatch(/useState|adminAsset|axios|validate|Idempotency/);
  });
});
