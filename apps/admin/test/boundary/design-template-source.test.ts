/**
 * @jest-environment node
 *
 * Static boundary checks on the Design Template production source and on the
 * `@embroidery/api-client` surface it is allowed to reach.
 *
 * The withheld-operation assertions carry the weight. `APP3-A02` is list
 * management: a detail read available here becomes an N+1 the first time
 * someone wants a version number in a row, and a lifecycle operation becomes a
 * publish button on a row the operator was only skimming. Neither is visible in
 * a rendered DOM, so both are checked mechanically.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as apiClient from '@embroidery/api-client';

const FEATURE_DIR = join(__dirname, '..', '..', 'src', 'features', 'design-templates');
const ROUTE_FILE = join(
  __dirname,
  '..',
  '..',
  'src',
  'app',
  '(protected)',
  'design-templates',
  'page.tsx',
);
const STYLESHEET = join(FEATURE_DIR, 'styles', 'design-templates.scss');

/**
 * Strips comments so the rules below inspect executable code only.
 *
 * Without this, a file that *documents* which operations it deliberately avoids
 * fails the very rule asserting it avoids them.
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

const routeSourceRaw = readFileSync(ROUTE_FILE, 'utf8');
const routeSource = stripComments(routeSourceRaw);
const stylesheet = stripComments(readFileSync(STYLESHEET, 'utf8'));

describe('generated client boundary', () => {
  it('exposes the two operations this screen consumes', () => {
    expect(typeof apiClient.adminDesignTemplateList).toBe('function');
    expect(typeof apiClient.adminDesignTemplateCreate).toBe('function');
  });

  it('withholds the detail read that would become an N+1', () => {
    expect((apiClient as Record<string, unknown>)['adminDesignTemplateDetail']).toBeUndefined();
  });

  it('withholds every lifecycle operation', () => {
    for (const operation of [
      'adminDesignTemplatePublish',
      'adminDesignTemplateUnpublish',
      'adminDesignTemplateArchive',
      'adminDesignTemplateRestore',
    ]) {
      expect((apiClient as Record<string, unknown>)[operation]).toBeUndefined();
    }
  });

  it('reaches the API only through the generated operations', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/\bfetch\s*\(/);
      expect(source.text).not.toMatch(/\baxios\b/);
      expect(source.text).not.toMatch(/from '@embroidery\/api-client\/.*generated/);
    }
  });

  it('never hard-codes the endpoint path', () => {
    for (const source of sources) {
      expect(source.text).not.toContain('/api/admin/design-templates');
    }
  });

  it('imports the template operations in exactly one module', () => {
    const importers = sources.filter(
      (source) =>
        source.text.includes('adminDesignTemplateList') ||
        source.text.includes('adminDesignTemplateCreate'),
    );

    expect(importers).toHaveLength(1);
    expect(importers[0]?.path).toMatch(/services[\\/]design-template\.service\.ts$/);
  });
});

describe('no unsupported capability', () => {
  it('builds no search, sort, offset or page-number request parameter', () => {
    // Matched as an **object key**, which is what a request parameter is, and
    // only the names `APP3-B03` would have to reject. A bare substring scan
    // flags `offsetParent` and `searchParams` — a DOM API used for focus
    // trapping and the URL API that holds the filters — and a key-shaped scan
    // still flags a TypeScript annotation such as `const query: UseQueryResult`,
    // so declarations are skipped too.
    const forbiddenParam = /\b(search|sortBy|orderBy|sort|offset|pageNumber|totalCount)\s*:/;
    const isDeclaration = /^\s*(const|let|var|function|export)\b/;

    for (const source of sources) {
      const offenders = source.text
        .split('\n')
        .filter((line) => forbiddenParam.test(line) && !isDeclaration.test(line));
      expect({ path: source.path, offenders }).toEqual({ path: source.path, offenders: [] });
    }
  });

  it('slices no page on the client', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/\.slice\(\s*\(?\s*page/);
      expect(source.text).not.toMatch(/\bpageIndex\b/);
    }
  });

  it('sends the cursor without parsing or rebuilding it', () => {
    const service = sources.find((source) => /design-template\.service\.ts$/.test(source.path));
    expect(service).toBeDefined();
    // An opaque cursor that gets decoded is a cursor the client has an opinion
    // about, which is how a keyset contract quietly becomes an offset one.
    expect(service?.text).not.toMatch(/atob|Buffer\.from|JSON\.parse\([^)]*cursor/);
    expect(service?.text).toMatch(/cursor/);
  });
});

describe('route boundary', () => {
  it('lives under the protected route group', () => {
    expect(ROUTE_FILE).toContain('(protected)');
  });

  it('is a thin boundary', () => {
    expect(routeSource).toContain('DesignTemplateListScreen');
    expect(routeSource).not.toContain('useQuery');
    expect(routeSource).not.toContain("'use client'");
    expect(routeSourceRaw.split('\n').length).toBeLessThan(30);
  });

  it('is the only design-template route in the app', () => {
    const appDir = join(__dirname, '..', '..', 'src', 'app');
    const routes = collectSources(appDir).filter((path) => /design-template/i.test(path));

    expect(routes).toHaveLength(1);
  });

  it('declares no editor route for a screen that does not exist', () => {
    for (const source of sources) {
      // APP3-A03 owns the editor. A constant naming it here is how a list ends
      // up linking into a 404.
      expect(source.text).not.toMatch(/design-templates\/\$\{/);
      expect(source.text).not.toMatch(/EDITOR_ROUTE/);
    }
  });
});

describe('design-system boundary', () => {
  it('hard-codes no colour', () => {
    expect(stylesheet).not.toMatch(/rgba?\(/);
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('uses the canonical scrim token for the dialog backdrop', () => {
    expect(stylesheet).toContain('$color-overlay-scrim');
  });

  it('uses the shared Admin field primitive rather than a competing one', () => {
    const dialog = sources.find((source) =>
      /create-design-template-dialog\.tsx$/.test(source.path),
    );
    expect(dialog?.text).toContain('AdminTextField');
  });

  it('introduces no inline style or CSS custom property', () => {
    for (const source of sources) {
      expect(source.text).not.toMatch(/style=\{/);
      expect(source.text).not.toMatch(/--design-template-/);
    }
  });
});

describe('file size policy', () => {
  it('keeps every production file within 400 lines', () => {
    const oversized = collectSources(FEATURE_DIR)
      .map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n').length }))
      .filter((file) => file.lines > 400);

    expect(oversized).toEqual([]);
  });
});
