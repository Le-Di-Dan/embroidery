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
  routeFiles,
  s01Code,
  s02Code,
  s02Sources,
  s03Code,
  s07Code,
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

  it('reaches no Admin, autosave or public media operation', () => {
    // `publicDesignSessionAutosave` stays forbidden: persistence is `APP3-S10`'s
    // and an operation on this boundary is an invitation to call it before the
    // screen that owns it exists. The three session-asset operations were
    // forbidden here for exactly the same reason and stopped being so at
    // `APP3-S06`, which is the screen that owns them — see the rule below, which
    // is *narrower* than the ban it replaces.
    for (const forbidden of [
      'admin',
      'Admin',
      'publicDesignSessionAutosave',
      'publicProductMediaGet',
    ]) {
      expect(allCode).not.toContain(forbidden);
    }
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
    for (const later of [
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

  it('grows no touch gesture, which APP3-S11 owns', () => {
    for (const touch of ['onTouchStart', 'onTouchMove', 'touches', 'pinch', 'gesturestart']) {
      expect(allCode).not.toContain(touch);
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
    // `onClick=`, anchored on the `=`. A capture-phase filter (`onClickCapture`)
    // is deliberately still allowed: it removes a click rather than adding an
    // affordance, so it needs no role, no name and no tab stop.
    expect(allCode).not.toMatch(/<div[^>]*onClick=/);
    expect(allCode).not.toMatch(/<(span|li)[^>]*onClick=/);
  });
});
