/**
 * Regressions for the `APP3-S07` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working viewport**: a zoom multiplied by 1.25
 * instead of stepped, which behaves identically until the tenth click and never
 * returns to exactly 1; a scale folded into every element's transform, which
 * draws a correct-looking picture whose every coordinate has left the document;
 * a scene rebuilt on each zoom step, which is invisible on screen and costs the
 * whole adapter per click; a safe-area rectangle recomputed locally, which
 * agrees with the persisted one on every fixture and diverges on the rounded
 * ones nobody wrote; and a wheel handler, which restores in one line precisely
 * the continuous-scale path `ADR-APP0-001` measured at 41 ms p95 on WebKit.
 *
 * The last block rewinds the phase document to prove the **pre-S07** half still
 * bites: a design row approved before its checkpoint opened, and no runtime rule
 * ruling on a viewport that does not exist.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkApp3S07,
  checkCommandIndex,
  checkDesignApproval,
  checkImmutability,
  checkNonScope,
  checkPredecessorGate,
  checkPredecessors,
  checkSafeArea,
  checkSceneUntouched,
  checkViewportBoundary,
  checkViewportState,
  checkZoom,
} from './check-app3-s07.mjs';
import { FEATURE, read } from './check-app3-s07.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((entry) => entry.includes(needle));

function failuresOf(check, root) {
  const collected = [];
  check(root, (message) => collected.push(message));
  return collected;
}

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s07-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s07.mjs',
    'tools/check-app3-s07.sources.mjs',
    'tools/check-app3-s07-runtime.mjs',
    ...APP3_SURFACE_TOOL_FILES,
  ]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // A file the checker tolerates being absent.
    }
  }
  // The whole feature, so the whole-feature rules see every file rather than
  // only the ones this harness happened to name — which is exactly how a second
  // viewport, or a wheel handler, would arrive.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s07-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** The phase document with S07 rewound to the world before this checkpoint. */
function beforeS07() {
  return file('phase').replace(
    /\nAPP3-S07 = COMPLETE[^\n]*\n/,
    '\nAPP3-S07 = READY — NOT STARTED\n',
  );
}

describe('the gate passes the repository it rules on', () => {
  it('reports no failure against the delivered checkpoint', () => {
    assert.deepEqual(checkApp3S07(baseRoot()), []);
  });
});

describe('entry authority', () => {
  it('refuses a predecessor that is not review-accepted', () => {
    const root = rootWith({
      phase: file('phase').replace(
        '\nAPP3-S02 = COMPLETE — REVIEW_ACCEPTED\n',
        '\nAPP3-S02 = COMPLETE — REVIEW_DELIVERED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-S02'));
  });

  it('refuses a status block that does not record the mitigation it chose', () => {
    // The one fact a reader cannot recompute from the source: *which* of the
    // ADR's two mitigations was taken, and that the zoom limits are an
    // engineering ruling rather than something the design stated.
    const root = rootWith({
      phase: file('phase').replace(
        'APP3-S07 WEBKIT_MITIGATION = DISCRETE_STEPS_ON_ONE_CSS_WRAPPER',
        'APP3-S07 WEBKIT_MITIGATION = TRUST_ME',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'WEBKIT_MITIGATION'));
  });

  it('refuses a next checkpoint recorded complete inside this one', () => {
    // S11 only: it needs S03 *and* S07, so S03 shipping does not make it ready.
    for (const later of ['APP3-S11']) {
      const root = rootWith({
        phase: `${file('phase')}\n${later} = COMPLETE — REVIEW_DELIVERED\n`,
      });
      assert.ok(mentions(failuresOf(checkPredecessors, root), later));
    }
  });
});

describe('scoped design approval', () => {
  it('refuses an S07 row that stayed unapproved', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-ZOOM-DESKTOP-ZOOMED \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
        '$1REVIEW_REQUIRED',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-ZOOM-DESKTOP-ZOOMED'));
  });

  it('refuses an S07 row carrying the wrong node', () => {
    const root = rootWith({
      registry: file('registry').replace('| 609:99 |', '| 609:999 |'),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'does not carry node'));
  });

  it('refuses a blanket Studio approval', () => {
    const root = rootWith({
      // A row whose own checkpoint has *not* opened. Transform is no longer
      // one — `APP3-S03` shipped and approved it — which is exactly why the
      // assertion moves rather than the rule loosening.
      registry: file('registry').replace(
        /(\| FIG-STUDIO-LAYERS-DESKTOP-DEFAULT \|[^\n]*?)REVIEW_REQUIRED/,
        '$1APPROVED_FOR_IMPLEMENTATION',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-LAYERS-DESKTOP-DEFAULT'));
  });

  it('refuses the shared 1024 reference re-attributed to this checkpoint', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*?)\| APP3-D01-C1 \|/,
        '$1| APP3-S07 |',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'no longer belongs'));
  });
});

describe('the WebKit mitigation is the code, not the claim', () => {
  it('refuses a zoom multiplied instead of stepped', () => {
    // Behaves identically until the tenth click, and never returns to exactly 1.
    const root = rootWith({
      viewportModel: file('viewportModel').replace(
        'export function zoomAt(zoomStep: number): number {',
        'export function grow(zoom: number) { return zoom *= 1.25; }\nexport function zoomAt(zoomStep: number): number {',
      ),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'arbitrary continuous scale'));
  });

  it('refuses an exponential zoom', () => {
    const root = rootWith({
      viewportModel: `${file('viewportModel')}\nexport const grow = (n: number) => Math.pow(1.25, n);\n`,
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'arbitrary continuous scale'));
  });

  it('refuses a wheel handler, which is a continuous gesture by nature', () => {
    const root = rootWith({
      viewport: file('viewport').replace(
        'onPointerDown={handlePointerDown}',
        'onWheel={() => undefined}\n      onPointerDown={handlePointerDown}',
      ),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'continuous zoom the ADR measured'));
  });

  it('refuses a zoom set that is not frozen', () => {
    const root = rootWith({
      viewportModel: file('viewportModel').replace(
        'Object.freeze([1, 1.25, 1.5, 2, 3, 4])',
        '[1, 1.25, 1.5, 2, 3, 4]',
      ),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'not frozen'));
  });

  it('refuses an unbounded zoom', () => {
    const root = rootWith({
      viewportModel: file('viewportModel').replaceAll('canZoomIn', 'mayGrow'),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'unbounded'));
  });

  it('refuses an unbounded pan', () => {
    const root = rootWith({
      viewportModel: file('viewportModel').replaceAll('clampPan', 'adjustPan'),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'pan is unbounded'));
  });

  it('refuses a control the approved design does not draw', () => {
    const root = rootWith({
      controls: file('controls').replace(
        '<span className="studio-stage__zoom-value"',
        '<input type="range" min={0} max={5} />\n      <span className="studio-stage__zoom-value"',
      ),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'the approved design does not draw'));
  });

  it('refuses a disabled state that is never exposed', () => {
    const root = rootWith({
      controls: file('controls').replaceAll('disabled', 'inert'),
    });
    assert.ok(mentions(failuresOf(checkZoom, root), 'does not expose'));
  });
});

describe('the APP3-S02 scene is untouched by the viewport', () => {
  it('refuses a zoom reaching an element transform', () => {
    // Draws a correct-looking picture whose every coordinate has left the
    // document — the failure no screenshot review catches.
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'transform={renderable.transform}',
        'transform={`${renderable.transform} scale(${String(zoom)})`}',
      ),
    });
    assert.ok(mentions(failuresOf(checkSceneUntouched, root), 'knows about the viewport'));
  });

  it('refuses a zoom multiplied into the viewBox', () => {
    const root = rootWith({
      stage: file('stage').replace(
        'viewBox={`0 0 ${String(scene.canvasWidthPx)} ${String(scene.canvasHeightPx)}`}',
        'viewBox={`0 0 ${String(scene.canvasWidthPx * 2)} ${String(scene.canvasHeightPx)}`}',
      ),
    });
    assert.ok(mentions(failuresOf(checkSceneUntouched, root), 'placement canvas'));
  });

  it('refuses the adapter rebuilt for a viewport change', () => {
    // Invisible on screen, and costs the entire adapter per zoom click.
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'useMemo(() => buildRenderableScene(stageDocument), [stageDocument])',
        'useMemo(() => buildRenderableScene(stageDocument), [stageDocument, zoomStep])',
      ),
    });
    assert.ok(mentions(failuresOf(checkSceneUntouched, root), 'memoised on the document alone'));
  });

  it('refuses a viewport that composes geometry of its own', () => {
    const root = rootWith({
      viewportModel: `${file('viewportModel')}\nexport const spin = (d: number) => Math.cos(d);\n`,
    });
    assert.ok(mentions(failuresOf(checkSceneUntouched, root), 'composes geometry'));
  });

  it('refuses a second scene added behind the first', () => {
    const root = rootWith({
      viewport: file('viewport').replace('{children}', '{children}<svg aria-hidden="true" />'),
    });
    assert.ok(mentions(failuresOf(checkViewportBoundary, root), '<svg> roots'));
  });

  it('refuses the transform applied in more than one place', () => {
    const root = rootWith({
      controls: `${file('controls')}\nconst extra = viewportTransform({ zoomStep: 0, panXRatio: 0, panYRatio: 0 });\n`,
    });
    assert.ok(mentions(failuresOf(checkViewportBoundary, root), 'applies the viewport transform'));
  });

  it('refuses a rendering or pan-and-zoom engine in the source', () => {
    const root = rootWith({
      viewport: `import panzoom from 'panzoom';\n${file('viewport')}`,
    });
    assert.ok(mentions(failuresOf(checkViewportBoundary, root), 'engine'));
  });
});

describe('the viewport state stays runtime-only', () => {
  it('refuses a viewport written to browser storage', () => {
    const root = rootWith({
      viewportStore: `${file('viewportStore')}\nlocalStorage.setItem('zoom', '1');\n`,
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'persists viewport state'));
  });

  it('refuses persistence middleware', () => {
    const root = rootWith({
      viewportStore: file('viewportStore').replace(
        'create<StudioViewportState>()(',
        'create<StudioViewportState>()(persist(',
      ),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'persists viewport state'));
  });

  it('refuses a Session snapshot in the viewport store', () => {
    const root = rootWith({
      viewportStore: file('viewportStore').replace(
        'safeAreaVisible: boolean;',
        'safeAreaVisible: boolean;\n  readonly snapshot: unknown;',
      ),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'not serializable viewport state'));
  });

  it('refuses the selection store growing viewport state', () => {
    // The two stores exist apart precisely so S02's rule never had to bend.
    const root = rootWith({
      selectionStore: file('selectionStore').replace(
        'selectedElementId: null,',
        'selectedElementId: null,\n  zoom: 1,',
      ),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'grew viewport state'));
  });

  it('refuses a viewport that is not reset for a new Session', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replaceAll('resetViewport', 'noteViewport'),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'not reset for a new Session'));
  });

  it('refuses a reset that is not bound to the Session identity', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        '}, [resetViewport, snapshot.sessionId]);',
        '}, [resetViewport]);',
      ),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'not bound to the Session identity'));
  });

  it('refuses a history stack pre-built here', () => {
    const root = rootWith({
      viewportStore: file('viewportStore').replace(
        'safeAreaVisible: boolean;',
        'safeAreaVisible: boolean;\n  readonly history: number[];',
      ),
    });
    assert.ok(mentions(failuresOf(checkViewportState, root), 'a later checkpoint owns'));
  });
});

describe('the capabilities the viewport must not grow', () => {
  it('refuses the viewport reaching the network', () => {
    const root = rootWith({
      viewport: `import { useQuery } from '@tanstack/react-query';\n${file('viewport')}`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'reaches the network'));
  });

  it('refuses a background query key that can see the viewport', () => {
    const root = rootWith({
      queryKeys: file('queryKeys').replace(
        'sideBackground: (',
        'sideBackgroundZoomed: (zoom: number) => [zoom],\n  sideBackground: (',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'depends on the viewport'));
  });

  it('refuses autosave called from a viewport effect', () => {
    const root = rootWith({
      viewport: `${file('viewport')}\nvoid publicDesignSessionAutosave;\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'autosaves'));
  });

  it('refuses a touch gesture arriving before APP3-S11', () => {
    const root = rootWith({
      viewport: file('viewport').replace(
        'onPointerDown={handlePointerDown}',
        'onTouchStart={() => undefined}\n      onPointerDown={handlePointerDown}',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S11'));
  });

  it('refuses a pan that does not refuse a touch pointer', () => {
    const root = rootWith({
      viewport: file('viewport').replace("if (event.pointerType === 'touch') return;", ''),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'a touch pointer is not refused'));
  });

  it('refuses a transform handle arriving before APP3-S03', () => {
    const root = rootWith({
      // Anchored on real markup, not on the first `<button` in the file — that
      // one is inside the doc comment, and a mutation the prose stripper
      // removes proves the gate refuses nothing at all.
      controls: file('controls').replace(
        'data-testid="studio-zoom-out"',
        'data-testid="studio-zoom-out"\n        data-role="resizeHandle"',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S03'));
  });

  it('refuses a document mutation from anywhere in the feature', () => {
    const root = rootWith({
      viewport: `${file('viewport')}\nfunction nudge(el: { transform: { x: number } }) { el.transform.x = 1; }\n`,
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'mutates the Design Document'));
  });
});

describe('the safe area is the persisted rectangle, shown or withheld', () => {
  it('refuses a boundary that is recomputed rather than withheld', () => {
    // Agrees with the persisted rectangle on every fixture, and diverges on the
    // rounded ones nobody wrote.
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'area={safeAreaVisible ? area : null}',
        'area={safeAreaVisible ? shrink(area) : null}',
      ),
    });
    assert.ok(mentions(failuresOf(checkSafeArea, root), 'the persisted rectangle, withheld'));
  });

  it('refuses a locally derived second boundary', () => {
    const root = rootWith({
      stageScreen: `${file('stageScreen')}\nconst inset = 4;\n`,
    });
    assert.ok(mentions(failuresOf(checkSafeArea, root), 'second safe-area boundary'));
  });

  it('refuses a viewport that does not clip', () => {
    const root = rootWith({
      styles: file('styles').replace('  overflow: hidden;\n  min-width: 0;', '  min-width: 0;'),
    });
    assert.ok(mentions(failuresOf(checkSafeArea, root), 'does not clip'));
  });

  it('refuses a layer with no top-left transform origin', () => {
    const root = rootWith({
      styles: file('styles').replace('transform-origin: 0 0;', 'transform-origin: center;'),
    });
    assert.ok(mentions(failuresOf(checkSafeArea, root), 'top-left transform origin'));
  });
});

describe('the predecessor gate was narrowed, not deleted', () => {
  it('refuses an APP3-S02 rule that stopped ruling on the pointer', () => {
    const root = rootWith({
      s02Bans: file('s02Bans').replaceAll('onPointerDown', 'onSomething'),
    });
    assert.ok(mentions(failuresOf(checkPredecessorGate, root), 'no longer rules on'));
  });

  it('refuses an APP3-S02 rule that stopped ruling on the DOM measurement', () => {
    const root = rootWith({
      s02Bans: file('s02Bans').replaceAll('getBoundingClientRect', 'somethingElse'),
    });
    assert.ok(mentions(failuresOf(checkPredecessorGate, root), 'no longer rules on'));
  });

  it('refuses a narrowing that is not world-aware', () => {
    const root = rootWith({
      s02Runtime: file('s02Runtime').replaceAll('isS07Delivered', 'alwaysTrue'),
    });
    assert.ok(mentions(failuresOf(checkPredecessorGate, root), 'no longer rules on'));
  });
});

describe('the artifacts a frontend checkpoint must not move', () => {
  it('refuses a changed OpenAPI surface', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/api/public/design-sessions/{sessionId}/viewport'] = { get: {} };
    const root = rootWith({ openapi: JSON.stringify(document) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'expected 35/40'));
  });

  it('refuses an edited generated client', () => {
    const root = rootWith({ generatedClient: `// APP3-S07 edit\n${file('generatedClient')}` });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'carries an APP3-S07 edit'));
  });

  it('refuses a new root script', () => {
    const manifest = JSON.parse(file('rootPackage'));
    manifest.scripts['check:app3-s07'] = 'node tools/check-app3-s07.mjs';
    const root = rootWith({ rootPackage: JSON.stringify(manifest) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'root scripts'));
  });

  it('refuses an unregistered scoped command', () => {
    const root = rootWith({
      index: file('index').replaceAll('node tools/check-app3-s07.mjs', 'x'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'CMD-CHECK-APP3-S07'));
  });

  it('refuses a benchmark that measures only one browser', () => {
    // A Chromium-only measurement closes nothing this checkpoint was given.
    const root = rootWith({
      benchmark: file('benchmark').replaceAll('webkit', 'chromium'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'does not measure webkit'));
  });

  it('refuses a missing benchmark entirely', () => {
    const root = rootWith({ benchmark: '' });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'missing'));
  });
});

describe('the pre-S07 world', () => {
  it('refuses the S07 design rows approved before S07 opened', () => {
    const root = rootWith({ phase: beforeS07() });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-ZOOM-DESKTOP-FIT'));
  });

  it('applies no runtime rule in a world where the viewport has not shipped', () => {
    // The runtime rules read the viewport's own source, so running them before
    // the checkpoint ships would be ruling on a viewport that does not exist.
    // What the pre-S07 world *does* rule on is the governance half — and it
    // refuses, which is what stops "rewind the phase line" being a way past.
    const root = rootWith({ phase: beforeS07() });
    const failures = checkApp3S07(root);

    assert.ok(failures.length > 0);
    assert.ok(mentions(failures, 'FIG-STUDIO-ZOOM-DESKTOP-FIT'));
    for (const runtime of ['<svg> roots', 'continuous scale', 'persists viewport state']) {
      assert.ok(!mentions(failures, runtime), `runtime rule fired before S07: ${runtime}`);
    }
  });
});
