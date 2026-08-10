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

/**
 * The files `APP3-S02` added, named exactly.
 *
 * Several rules below were written when the Studio had no stage, and they are
 * the rules that keep it having exactly one. Making them world-aware means
 * splitting the feature rather than loosening the rule: everything S01 owns
 * still may not reach a background operation, hold a store, import a document
 * authority or render an `<svg>`, and the stage may — once.
 *
 * The list is of the S02 files rather than the S01 ones on purpose. A file
 * added tomorrow is not on it, so it inherits the strict S01 rules by default;
 * a list of S01 files would have let a new file escape every one of them.
 */
const S02_FILES = new Set(
  [
    'components/studio-stage.tsx',
    'components/studio-stage-background-notice.tsx',
    'components/studio-stage-element.tsx',
    'components/studio-stage-screen.tsx',
    'components/studio-stage-selection.tsx',
    'components/studio-stage-unavailable.tsx',
    'hooks/use-side-background.ts',
    'model/studio-stage-copy.ts',
    'model/studio-stage-label.ts',
    'renderer/studio-paint.ts',
    'renderer/studio-scene.ts',
    'renderer/studio-svg-matrix.ts',
    'services/studio-background.client.ts',
    'store/studio-interaction.store.ts',
  ].map((path) => join(FEATURE_DIR, ...path.split('/'))),
);

const s01Sources = sources.filter((file) => !S02_FILES.has(file.path));
const s02Sources = sources.filter((file) => S02_FILES.has(file.path));
const s01Code = codeOnly([...s01Sources, ...routeFiles].map((file) => file.text).join('\n'));
const s02Code = codeOnly(s02Sources.map((file) => file.text).join('\n'));

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

  it('reaches no Admin, autosave, session-asset or media operation', () => {
    for (const forbidden of [
      'admin',
      'Admin',
      'publicDesignSessionAutosave',
      'publicDesignSessionAssetCreate',
      'publicProductMediaGet',
    ]) {
      expect(allCode).not.toContain(forbidden);
    }
  });

  it('keeps the Side background out of the bootstrap screen S01 owns', () => {
    // Unchanged from S01: the bootstrap chain renders no stage, so it needs no
    // background bytes and must not acquire the ability to ask for them.
    expect(s01Code).not.toContain('publicProductSideBackgroundGet');
  });

  it('reaches the Side background exactly once, from the S02 stage service', () => {
    const callers = s02Sources.filter((file) =>
      codeOnly(file.text).includes('publicProductSideBackgroundGet('),
    );
    expect(callers.map((file) => file.path.replaceAll('\\', '/').split('/').at(-1))).toEqual([
      'studio-background.client.ts',
    ]);
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

  it('holds no Zustand store in the bootstrap screen', () => {
    // Zustand is for editor and browser-only interaction state, which is
    // `APP3-S02`'s. S01's placement selection is a reducer and its server state
    // is TanStack Query's; duplicating either in a store is forbidden outright.
    expect(s01Code).not.toContain('zustand');
  });

  it('confines the interaction store to one file holding one id', () => {
    const holders = s02Sources.filter((file) => codeOnly(file.text).includes('zustand'));
    expect(holders.map((file) => file.path.replaceAll('\\', '/').split('/').at(-1))).toEqual([
      'studio-interaction.store.ts',
    ]);

    const store = codeOnly(nth(holders, 0).text);
    expect(store).toContain('selectedElementId');
    // No server state, no mutable runtime object, no session identity.
    for (const forbidden of [
      'document:',
      'snapshot',
      'sessionId',
      'Blob',
      'objectUrl',
      'SVGElement',
      'DOMRect',
      'DOMMatrix',
      'AbortController',
      'useRef',
      'persist(',
    ]) {
      expect(store).not.toContain(forbidden);
    }
  });

  it('never names a session secret', () => {
    for (const secret of ['secret', 'Secret', '__Host-']) {
      expect(allCode).not.toContain(secret);
    }
  });
});

describe('the S01 side of the S02 boundary', () => {
  it('still builds no renderer, stage or history stack of its own', () => {
    for (const s02 of [
      'renderer',
      'Renderer',
      'viewport',
      'undo',
      'redo',
      'historyStack',
      'selectionHandle',
      '<svg',
    ]) {
      expect(s01Code).not.toContain(s02);
    }
  });

  it('still does not validate, quantize or interpret a Design Document', () => {
    // S01 reads a document at the transport seam — an asset id for the preview
    // — and interprets nothing. `@embroidery/design-document` is now a
    // Storefront dependency, which makes this rule matter more, not less.
    for (const authority of [
      '@embroidery/design-document',
      '@embroidery/design-engine',
      'validateDesignDocumentStructure',
      'quantize',
    ]) {
      expect(s01Code).not.toContain(authority);
    }
  });
});

describe('exactly one production renderer (APP3-S02)', () => {
  it('renders SVG natively and never a canvas', () => {
    // `IMP-D026` / `ADR-APP0-001`: native SVG rendered by React, with no
    // rendering-engine or interaction-library dependency anywhere.
    expect(allCode).not.toContain('<canvas');
    for (const engine of ['konva', 'Konva', 'fabric', 'Fabric', 'pixi', 'PIXI', 'interact.js']) {
      expect(allCode).not.toContain(engine);
    }
  });

  it('opens exactly one <svg> in the whole feature', () => {
    // Two would be two renderers, whatever they were called.
    expect(allCode.split('<svg').length - 1).toBe(1);
  });

  it('keeps geometry in the engine and out of the renderer', () => {
    expect(s02Code).toContain('@embroidery/design-engine');
    for (const localGeometry of [
      'Math.cos',
      'Math.sin',
      'Math.atan2',
      'Math.PI',
      'multiplyMatrices(',
      'composeMatrices(',
      'pxPerMm *',
      '/ pxPerMm',
    ]) {
      expect(s02Code).not.toContain(localGeometry);
    }
  });

  it('measures nothing from the DOM', () => {
    // A selection outline drawn from a layout box drifts from the document the
    // moment the stage is resized. `APP3-P02`'s bounds are in document space.
    for (const measurement of [
      'getBoundingClientRect',
      'DOMRect',
      'DOMMatrix',
      'getBBox',
      'offsetWidth',
      'clientWidth',
    ]) {
      expect(allCode).not.toContain(measurement);
    }
  });

  it('grows no capability a later checkpoint owns', () => {
    for (const later of [
      'onPointerMove',
      'onDragStart',
      'onDrag',
      'onWheel',
      'watermark',
      'Watermark',
      'onMouseMove',
      'undoStack',
      'reorder',
    ]) {
      expect(allCode).not.toContain(later);
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
