/**
 * @jest-environment node
 *
 * Static boundary checks on the product capability's production source.
 *
 * These guard rules a rendering test cannot see: that both new routes sit
 * inside the authenticated segment, that the route files stay thin, and that
 * nothing in the feature reaches past the approved seams to a raw URL, the
 * generated tree, object storage or the withheld archive operation.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = join(__dirname, '..', '..', 'src', 'app', '(protected)', 'products');
const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'products');

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

/**
 * Comments are stripped before the code rules run. These files *document* the
 * boundaries they respect ("never reaches object storage", "archive is
 * withheld"), so matching raw text would fail on the very prose that explains
 * the rule.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const sources = collectSources(FEATURE_DIR).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
  code: stripComments(readFileSync(path, 'utf8')),
}));

describe('route placement', () => {
  it('puts create and detail inside the authenticated segment', () => {
    expect(existsSync(join(APP_DIR, 'new', 'page.tsx'))).toBe(true);
    expect(existsSync(join(APP_DIR, '[productId]', 'page.tsx'))).toBe(true);
  });

  it('defines no alias route for the same capability', () => {
    const appRoot = join(__dirname, '..', '..', 'src', 'app');
    for (const alias of ['catalog', 'san-pham', 'admin']) {
      expect(existsSync(join(appRoot, alias))).toBe(false);
      expect(existsSync(join(appRoot, '(protected)', alias))).toBe(false);
    }
  });

  it('keeps the route files thin — no business logic in a segment', () => {
    for (const file of ['new/page.tsx', '[productId]/page.tsx']) {
      const text = readFileSync(join(APP_DIR, ...file.split('/')), 'utf8');
      const lineCount = text.split('\n').filter((line) => line.trim() !== '').length;
      expect(lineCount).toBeLessThan(30);
      // A segment resolves params and renders; it never talks to the API.
      expect(stripComments(text)).not.toContain('adminProduct');
      expect(stripComments(text)).not.toContain('useState');
    }
  });
});

describe('product feature source boundaries', () => {
  it('discovers the feature source files', () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it('never calls fetch or names an API path', () => {
    for (const { code } of sources) {
      expect(code).not.toMatch(/\bfetch\s*\(/);
      expect(code).not.toContain('/api/admin');
      expect(code).not.toContain('axios');
    }
    expect(sources.length).toBeGreaterThan(0);
  });

  it('never deep-imports the generated client tree', () => {
    for (const { code } of sources) {
      expect(code).not.toContain('@embroidery/api-client/src');
      expect(code).not.toContain('generated/embroidery-api');
    }
  });

  it('never touches object storage or builds a media URL', () => {
    for (const { code } of sources) {
      expect(code).not.toMatch(/minio|s3\.|createObjectURL|blob:/i);
    }
  });

  it('never calls the withheld archive operation', () => {
    for (const { code } of sources) {
      expect(code).not.toContain('adminProductArchive');
    }
  });

  it('uses no dangerouslySetInnerHTML for product content', () => {
    for (const { code } of sources) {
      expect(code).not.toContain('dangerouslySetInnerHTML');
    }
  });

  it('writes no product data to browser storage or a cookie', () => {
    for (const { code } of sources) {
      expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    }
  });

  it('logs nothing from the feature', () => {
    for (const { code } of sources) {
      expect(code).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });

  it('carries no inline visual style', () => {
    for (const { code } of sources) {
      expect(code).not.toMatch(/style=\{\{/);
    }
  });
});

describe('withheld operations stay off the client boundary', () => {
  const boundary = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'packages', 'api-client', 'src', 'index.ts'),
    'utf8',
  );

  it('exports exactly the four operations A03 owns, plus the A02 list', () => {
    for (const operation of [
      'adminProductList',
      'adminProductCreate',
      'adminProductDetail',
      'adminProductUpdate',
      'adminAssetList',
    ]) {
      expect(boundary).toContain(operation);
    }
  });

  it('still withholds archive, so no screen can reach it', () => {
    // The name appears in the comment explaining *why* it is withheld, so the
    // assertion is on what the module actually exports.
    const exported = stripComments(boundary)
      .split(/export\s*\{/)
      .slice(1)
      .join(' ');
    expect(exported).not.toContain('adminProductArchive');
    expect(exported).toContain('adminProductUpdate');
  });
});
