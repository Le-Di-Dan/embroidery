/**
 * @jest-environment node
 *
 * Static boundary checks on the Studio bootstrap production source
 * (`APP3-S01`).
 *
 * These guard rules no rendering test can reach: which operations the feature
 * may touch, that no storage address or raw transport creeps in beside the
 * approved client, that nothing writes a Session identity to browser storage or
 * the URL, that no `APP3-S02` editor state container was created early, and
 * that the responsive floor the approved frames require is in the stylesheet
 * rather than only in a document.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Indexed access that fails loudly when the entry is absent.
 *
 * `noUncheckedIndexedAccess` is on, and an assertion made against a silently
 * `undefined` element would be asserting nothing at all.
 */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry at index ${String(index)}`);
  return item;
}

const SRC = join(__dirname, '..', '..', 'src');
const FEATURE_DIR = join(SRC, 'features', 'design-studio');
const ROUTE_DIR = join(SRC, 'app', 'san-pham', '[slug]', 'thiet-ke');
const STYLESHEET = join(FEATURE_DIR, 'styles', 'design-studio.scss');

/**
 * Comments explain why a rule exists and therefore quote the very things these
 * checks forbid ("never `localStorage`", "no storage key"). Matching against
 * them would make every well-documented file fail its own rule, so the checks
 * run on code only.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

function collect(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

const sources = collect(FEATURE_DIR, /\.(ts|tsx)$/).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));
const routeFiles = collect(ROUTE_DIR, /\.tsx$/).map((path) => ({
  path,
  text: readFileSync(path, 'utf8'),
}));
const allCode = codeOnly([...sources, ...routeFiles].map((file) => file.text).join('\n'));
const scssCode = codeOnly(readFileSync(STYLESHEET, 'utf8'));

describe('the Studio route', () => {
  it('discovers the feature and the single route file', () => {
    expect(sources.length).toBeGreaterThan(10);
    expect(routeFiles).toHaveLength(1);
  });

  it('exists at exactly /san-pham/[slug]/thiet-ke and nowhere else', () => {
    const appRoutes = collect(join(SRC, 'app'), /^page\.tsx$/).map((path) =>
      path.slice(join(SRC, 'app').length).replaceAll('\\', '/'),
    );

    expect(appRoutes).toContain('/san-pham/[slug]/thiet-ke/page.tsx');
    for (const rejected of ['/studio/', '/editor/', '/thiet-ke/', '/design-session/']) {
      expect(appRoutes.filter((route) => route.startsWith(rejected))).toEqual([]);
    }
  });

  it('builds the path from the shell route authority', () => {
    const route = nth(routeFiles, 0).text;
    expect(route).toContain('buildStorefrontStudioPath');
    // The literal segment is written once, in the shell navigation model.
    expect(codeOnly(route)).not.toContain("'thiet-ke'");
  });

  it('keeps the route file thin and server-rendered', () => {
    const route = nth(routeFiles, 0).text;
    expect(route).not.toContain("'use client'");
    expect(route.split('\n').length).toBeLessThan(80);
  });

  it('renders no second application shell', () => {
    // `StorefrontShell` already owns `<main>` and the landmarks for every route.
    expect(allCode).not.toContain('<main');
    expect(allCode).not.toContain('StorefrontHeader');
    expect(allCode).not.toContain('StorefrontFooter');
  });
});

describe('the API boundary', () => {
  const ALLOWED = [
    'publicProductPlacementGet',
    'publicDesignTemplateList',
    'publicDesignTemplateDetail',
    'publicDesignTemplateAssetGet',
    'publicDesignSessionCreate',
    'publicDesignSessionResume',
  ];

  it('calls only the six operations S01 owns', () => {
    for (const operation of ALLOWED) {
      expect(allCode).toContain(operation);
    }
  });

  it('reaches no Admin, autosave, session-asset or side-background operation', () => {
    for (const forbidden of [
      'admin',
      'Admin',
      'publicDesignSessionAutosave',
      'publicDesignSessionAssetCreate',
      'publicProductSideBackgroundGet',
      'publicProductMediaGet',
    ]) {
      expect(allCode).not.toContain(forbidden);
    }
  });

  it('uses the approved Axios client and never raw transport', () => {
    expect(allCode).toContain('getBrowserApiClient');
    // Anchored on a word boundary: TanStack's own `refetch()` ends in `fetch(`
    // and a substring match would forbid the retry affordance it powers.
    for (const raw of [/\bfetch\(/, /\bXMLHttpRequest\b/, /\baxios\./, /from 'axios'/]) {
      expect(allCode).not.toMatch(raw);
    }
  });

  it('hard-codes no API path', () => {
    // Every address comes from a generated operation. A literal `/api/...`
    // here would be a second, unversioned copy of the contract.
    expect(allCode).not.toContain('/api/');
  });

  it('names no storage address, bucket, key or presign', () => {
    for (const leak of [
      'storageKey',
      'bucket',
      'presign',
      'amazonaws',
      'minio',
      's3://',
      'derivativeId',
    ]) {
      expect(allCode).not.toContain(leak);
    }
  });
});

describe('Session identity never reaches the browser', () => {
  it('writes no storage, cookie or URL', () => {
    for (const persistence of [
      'localStorage',
      'sessionStorage',
      'document.cookie',
      'history.pushState',
      'history.replaceState',
      'useSearchParams',
      'searchParams',
    ]) {
      expect(allCode).not.toContain(persistence);
    }
  });

  it('holds no Zustand store', () => {
    // Zustand is for editor and browser-only interaction state, which is
    // `APP3-S02`'s. S01's selection is a reducer and its server state is
    // TanStack Query's; duplicating either in a store is forbidden outright.
    expect(allCode).not.toContain('zustand');
    expect(allCode).not.toContain('create(');
  });

  it('never names a session secret', () => {
    for (const secret of ['secret', 'Secret', '__Host-']) {
      expect(allCode).not.toContain(secret);
    }
  });
});

describe('the S02 handoff boundary', () => {
  it('creates no editor state container, renderer or history stack', () => {
    for (const s02 of [
      'renderer',
      'Renderer',
      'viewport',
      'undo',
      'redo',
      'historyStack',
      'selectionHandle',
      '<svg',
      '<canvas',
    ]) {
      expect(allCode).not.toContain(s02);
    }
  });

  it('does not validate or quantize a Design Document', () => {
    // `@embroidery/design-document` is the single authority and is deliberately
    // not a Storefront dependency: S01 reads a document at the transport seam
    // and interprets nothing.
    for (const authority of [
      '@embroidery/design-document',
      'validateDesignDocumentStructure',
      'quantize',
    ]) {
      expect(allCode).not.toContain(authority);
    }
  });
});

describe('the approved responsive and accessibility floor', () => {
  it('carries the shared touch-target minimum on every control', () => {
    const controls = scssCode.match(/\.studio-(placement__select|templates__row|button)\b/g) ?? [];
    expect(controls.length).toBeGreaterThanOrEqual(3);
    expect(scssCode.split('$size-touch-target-min').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('constrains both grid tracks so the x-axis cannot scroll', () => {
    expect(scssCode).toContain('minmax(0,');
    expect(scssCode).toContain('max-width: 100%');
  });

  it('introduces no colour literal', () => {
    // The design package binds every fill to a semantic variable, so a hex or
    // rgb() here would be a token invented at implementation time.
    expect(scssCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(scssCode).not.toMatch(/\brgba?\(/);
  });

  it('renders no clickable div', () => {
    expect(allCode).not.toMatch(/<div[^>]*onClick/);
    expect(allCode).not.toMatch(/<(span|li)[^>]*onClick/);
  });
});
