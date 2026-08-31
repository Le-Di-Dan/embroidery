/**
 * @jest-environment node
 *
 * Static boundary checks on the Studio production source (`APP3-S01`, extended
 * by every Studio capability since).
 *
 * These guard rules no rendering test can reach: which operations the feature
 * may touch, that no storage address or raw transport creeps in beside the
 * approved client, that nothing writes a Session identity to browser storage or
 * the URL, that exactly one production renderer exists, and that the responsive
 * floor the approved frames require is in the stylesheet rather than only in a
 * document.
 *
 * The per-checkpoint file partitions live in `../support/design-studio-partitions`
 * so both boundary suites rule against one answer to "whose file is this".
 */
import { join } from 'node:path';

import {
  SRC,
  allCode,
  codeOnly,
  collect,
  interactionCode,
  nth,
  outsideS04Code,
  outsideS09Code,
  outsideS10Code,
  routeFiles,
  s01Code,
  s02Code,
  s02Sources,
  s03Code,
  S08_FILES,
  s04Code,
  s07Code,
  s08Code,
  s09Code,
  s10Code,
  scssCode,
  sources,
  staticCode,
} from '../support/design-studio-partitions';

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

  it('writes no route literal and, since APP11-S04, no URL at all', () => {
    // The route used to compose its own path for a self-canonical.
    // `APP11-S04` removed that canonical: a private working surface must not
    // ask to be indexed at its own address, and with `metadataBase` now set it
    // would have resolved to a real absolute URL for a per-Product design tool.
    // With no URL to build, the builder import went with it — so the rule this
    // replaces ("use the shell builder") has nothing left to apply to, while
    // the rule underneath it still does: the segment literal is written once,
    // in the shell navigation model, and never here.
    const route = nth(routeFiles, 0).text;
    expect(codeOnly(route)).not.toContain("'thiet-ke'");
    expect(codeOnly(route)).not.toMatch(/alternates|canonical|openGraph/i);
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

  it('reaches no Admin or public media operation', () => {
    // `publicDesignSessionAutosave` left this list at `APP3-S10`, on the exact
    // terms it was put on it: persistence was forbidden here until the screen
    // that owns saving existed. It now does, so the ban becomes the narrower
    // one-file rule below — the same evolution the three session-asset
    // operations went through at `APP3-S06`.
    for (const forbidden of ['admin', 'Admin', 'publicProductMediaGet']) {
      expect(allCode).not.toContain(forbidden);
    }
  });

  it('reaches autosave from one service file only', () => {
    // The one **write** in the feature. A capability that may save is not a
    // licence for every panel to save: one file addresses the operation, and a
    // component that acquired the ability to persist a document directly — with
    // a revision it chose for itself — would fail here rather than in review.
    const callers = [...sources, ...routeFiles].filter((file) =>
      /publicDesignSessionAutosave\(/.test(codeOnly(file.text)),
    );

    expect(callers.map((file) => file.path.replaceAll('\\', '/').split('/').at(-1))).toEqual([
      'studio-autosave.client.ts',
    ]);
  });

  it('reaches the three session-asset operations from one service file only', () => {
    // The same shape as the Side-background rule below, and for the same
    // reason: a capability that may call an operation is not a licence for the
    // whole feature to call it. One file addresses these, and a component that
    // acquired the ability to upload or to fetch private bytes directly would
    // fail here rather than in review.
    const callers = [...sources, ...routeFiles].filter((file) =>
      /publicDesignSessionAsset(Create|Get|Status)\(/.test(codeOnly(file.text)),
    );

    expect(callers.map((file) => file.path.replaceAll('\\', '/').split('/').at(-1))).toEqual([
      'studio-session-asset.client.ts',
    ]);
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
    // `derivativeId` left this list at `APP3-S06`, and its departure is not a
    // relaxation: it is a field of the `APP3-P01` image element — an opaque
    // identity that grants no access and addresses no object — and the server
    // re-proves the whole grant on every request. It was on the list only
    // because no Studio capability had a legitimate reason to name one yet.
    // Everything that really is a storage address stays.
    for (const leak of ['storageKey', 'bucket', 'presign', 'amazonaws', 'minio', 's3://']) {
      expect(allCode).not.toContain(leak);
    }
  });
});

describe('Session identity never reaches the browser', () => {
  it('writes no storage, cookie or URL outside the one resume handle', () => {
    // `localStorage` left the outright ban at `APP3-S10`, which is the
    // checkpoint `APP3-G03` allows to keep the **non-secret Session id** so a
    // design survives a reload. Everything else on this list stays banned
    // everywhere, `document.cookie` most of all: the Session secret is
    // `HttpOnly`, this code cannot read it, and it may not try.
    for (const persistence of [
      'localStorage',
      'sessionStorage',
      'document.cookie',
      'indexedDB',
      'history.pushState',
      'history.replaceState',
      'useSearchParams',
      'searchParams',
    ]) {
      expect(outsideS10Code).not.toContain(persistence);
    }
    // Narrower than the ban it replaces: only the handle module touches storage,
    // and `sessionStorage`, cookies and the URL stay forbidden even to it.
    for (const persistence of [
      'sessionStorage',
      'document.cookie',
      'indexedDB',
      'history.pushState',
      'history.replaceState',
      'searchParams',
    ]) {
      expect(s10Code).not.toContain(persistence);
    }
  });

  it('touches browser storage from the resume-handle module only', () => {
    const holders = sources.filter((file) => codeOnly(file.text).includes('localStorage'));

    expect(holders.map((file) => file.path.replaceAll('\\', '/').split('/').at(-1))).toEqual([
      'studio-resume-handle.ts',
    ]);
  });

  it('stores nothing but a Session id under a placement-namespaced key', () => {
    const handle = codeOnly(
      nth(
        sources.filter((file) => file.path.endsWith('studio-resume-handle.ts')),
        0,
      ).text,
    );

    // What is written: one value, and it is the id the caller passed.
    expect(handle).toContain('store.setItem(resumeHandleKey(scope), sessionId)');
    // The key carries the whole placement, so a handle cannot be found under a
    // Product, Side or Area it was not written for.
    expect(handle).toContain('scope.productSlug');
    expect(handle).toContain('scope.sideCode');
    expect(handle).toContain('scope.areaCode');
    // What is never written: the document, the revision, the expiry or a secret.
    for (const forbidden of ['document', 'revision', 'expiresAt', 'secret', 'cookie']) {
      expect(handle).not.toContain(forbidden);
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

/*
 * The history ban, kept and narrowed at `APP3-S08`.
 *
 * Every earlier checkpoint refused the words feature-wide, and that was right
 * while nothing owned a past. Deleting the rule now would let any file build a
 * second stack; scoping it to the construction keeps the ban exactly as strict
 * everywhere it was ever meaningful.
 *
 * The one working-document store is deliberately outside the S08 list and
 * deliberately allowed: `APP3-S08` §5 requires the past and future to live
 * *beside* the one current document rather than in a controller with a current
 * of its own, so the store is where they belong.
 */
describe('one bounded history, and only where APP3-S08 put it', () => {
  const DOCUMENT_STORE = join(
    SRC,
    'features',
    'design-studio',
    'store',
    'studio-document.store.ts',
  );
  const outside = codeOnly(
    sources
      .filter((file) => !S08_FILES.has(file.path) && file.path !== DOCUMENT_STORE)
      .map((file) => file.text)
      .join('\n'),
  );

  it('builds a history nowhere but the S08 files', () => {
    for (const construction of [
      'MAX_HISTORY_ENTRIES',
      'recordAction',
      'historyRowsOf',
      'undoStack',
      'redoStack',
      'historyStack',
      'pushHistory',
    ]) {
      expect(outside).not.toContain(construction);
    }
  });

  it('holds nothing but documents and bounded metadata in an entry', () => {
    // A history entry is two `APP3-P01` documents, a bounded label and a number.
    // Anything mutable in it would outlive the render that made it.
    for (const forbidden of ['Blob', 'createObjectURL', 'SVGElement', 'ElementGraph', 'DOMRect']) {
      expect(s08Code).not.toContain(forbidden);
    }
  });

  it('sends nothing when history moves', () => {
    for (const call of ['publicDesignSessionAutosave', 'axios', 'fetch(']) {
      expect(s08Code).not.toContain(call);
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
    // None of these has an owner and none ever becomes legal, anywhere.
    for (const measurement of [
      'getBoundingClientRect',
      'DOMRect',
      'DOMMatrix',
      'getBBox',
      'getScreenCTM',
      'offsetWidth',
      'getComputedStyle',
    ]) {
      expect(allCode).not.toContain(measurement);
    }
  });

  it('asks the DOM how big an element is only where an interaction needs it', () => {
    // Converting a pointer drag into a pan needs the size of the element the
    // drag happened on, and nothing else can supply it. It is read during the
    // gesture and never stored — so it converts an input, and cannot become
    // geometry. Everywhere else the original ban is untouched.
    for (const measurement of ['clientWidth', 'clientHeight']) {
      expect(staticCode).not.toContain(measurement);
    }
    expect(interactionCode).toContain('clientWidth');
  });

  it('grows no capability a later checkpoint owns', () => {
    for (const later of ['onWheel', 'onMouseMove', 'undoStack']) {
      expect(allCode).not.toContain(later);
    }
  });

  /*
   * The watermark moved into the world rather than out of the rule (`APP3-S09`).
   *
   * `watermark` was banned feature-wide while `APP3-S09` had not opened. It now
   * has, so the word is legitimate in its four files — and deleting the ban
   * would let the stage, the viewport or an inspector grow a second watermark,
   * which is the thing it was written to prevent.
   */
  it('builds a watermark only in the four files APP3-S09 owns', () => {
    // The composition may **mount** one; nothing outside may **build** one. So
    // the rule is on the markup and the mint, not on the word: a second
    // watermark would need its own class names or its own token.
    for (const construction of ['studio-watermark__', 'mintWatermarkToken', 'watermarkTiles(']) {
      expect(outsideS09Code).not.toContain(construction);
    }
    expect(s09Code).toContain('studio-watermark__');
    // And it is still one overlay, not a second renderer.
    expect(s09Code).not.toContain('<svg');
    expect(s09Code).not.toContain('<canvas');
  });

  /*
   * The drag moved into the world rather than out of the rule (`APP3-S04`).
   *
   * `608:68` draws drag-reorder with a drop indicator, so the layer panel has a
   * legitimate `onDragStart`. Deleting the ban would have let the next
   * checkpoint put a drag on the stage, the inspector or the viewport, which is
   * the thing it was written to prevent — so it is now scoped to the files that
   * own the gesture, and everything else is as forbidden as it was.
   */
  it('drags only in the layer panel, and only with native DOM events', () => {
    for (const gesture of ['onDragStart', 'onDrag', 'draggable']) {
      expect(outsideS04Code).not.toContain(gesture);
    }
    expect(s04Code).toContain('onDragStart');
    expect(s04Code).toContain('onDrop');
    // No interaction library behind it, here or anywhere.
    for (const library of [
      'react-dnd',
      'dnd-kit',
      'interact.js',
      'sortablejs',
      'react-beautiful',
    ]) {
      expect(allCode).not.toContain(library);
    }
  });

  it('follows a pointer only in the viewport and the transform chrome', () => {
    // The two checkpoints that own a gesture, and nowhere else. The drawn
    // element itself still never follows a pointer: `APP3-S03` puts the move
    // surface in the DOM overlay rather than on the SVG node.
    for (const gesture of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'setPointerCapture']) {
      expect(staticCode).not.toContain(gesture);
    }
    expect(interactionCode).toContain('onPointerMove');
  });

  it('keeps trigonometry out of everything but the rotation input', () => {
    // `Math.atan2` turns a pointer vector into an angle, which `APP3-P02`
    // publishes no helper for because a document never needs one. Every other
    // trigonometric function stays banned everywhere: a local sine or cosine is
    // a second matrix engine, and two engines disagree on the rotated cases.
    for (const trig of ['Math.cos', 'Math.sin', 'Math.tan(']) {
      expect(allCode).not.toContain(trig);
    }
    expect(staticCode).not.toContain('Math.atan2');
    expect(s03Code).toContain('Math.atan2');
  });
});

describe('the APP3-S07 viewport', () => {
  it('transforms one wrapper and never an element', () => {
    // The scene stays in document coordinates. If the zoom reached an element's
    // own transform, every one of `APP3-P02`'s answers would be multiplied by a
    // number the engine never saw.
    expect(s07Code).toContain('viewportTransform');
    // The *scene* may not see the viewport. The stage screen legitimately wires
    // a zoom through to the transform chrome, which has to counter-scale by it;
    // what must never see it is the adapter, the SVG, the element component and
    // the selection outline, because those are the things that would multiply
    // it into a document coordinate.
    const sceneCode = codeOnly(
      sources
        .filter((file) =>
          /studio-(scene|stage|stage-element|stage-selection)\.tsx?$/.test(file.path),
        )
        .map((file) => file.text)
        .join('\n'),
    );
    expect(sceneCode).not.toContain('zoom');
    expect(sceneCode).not.toContain('panXRatio');
  });

  it('never rebuilds the scene for a viewport change', () => {
    // `buildRenderableScene` is memoised on the document alone. A viewport in
    // that dependency list would make every zoom step re-run the adapter, which
    // is exactly the cost the discrete-step mitigation exists to avoid.
    const screen = codeOnly(
      sources.find((file) => file.path.endsWith('studio-stage-screen.tsx'))?.text ?? '',
    );
    // The dependency list is the rule, not the exact call text: `APP3-S03-C1`
    // added a second argument (the previous build, offered back for identity
    // reuse) and the memo is still keyed on the document alone.
    expect(screen).toMatch(
      /useMemo\(\s*\(\)\s*=>\s*buildRenderableScene\(stageDocument[^)]*\),\s*\[stageDocument\],?\s*\)/,
    );
    expect(screen).not.toMatch(/buildRenderableScene[\s\S]{0,200}zoom/);
  });

  it('keeps the zoom a finite list rather than a multiplier', () => {
    expect(s07Code).toContain('ZOOM_STEPS');
    for (const continuous of ['zoom *=', 'zoom * 1.', 'Math.pow(', '** zoom']) {
      expect(s07Code).not.toContain(continuous);
    }
  });

  it('persists no viewport state anywhere', () => {
    for (const persistence of ['localStorage', 'sessionStorage', 'persist(', 'document.cookie']) {
      expect(s07Code).not.toContain(persistence);
    }
  });

  it('reaches no API from the viewport', () => {
    for (const call of ['useQuery', 'useMutation', '@embroidery/api-client']) {
      expect(s07Code).not.toContain(call);
    }
  });

  // One input model, S11 included; where the touch ban narrowed is ruled there.
  it('grows no second input model, in any checkpoint', () => {
    for (const l of ['onTouchStart', 'onTouchMove', 'gesturestart', 'TouchList'])
      expect(allCode).not.toContain(l);
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
    // `onClick=`, anchored on the `=`. A capture-phase filter (`onClickCapture`)
    // is deliberately still allowed: it removes a click rather than adding an
    // affordance, so it needs no role, no name and no tab stop.
    expect(allCode).not.toMatch(/<div[^>]*onClick=/);
    expect(allCode).not.toMatch(/<(span|li)[^>]*onClick=/);
  });
});
