/**
 * Regressions for the `APP3-S03` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working editor**: a resize that writes `width`,
 * which looks identical on a rectangle and silently fails to resize a freehand
 * element at all; a grouped-child move that adds the document delta straight to
 * `x`/`y`, which tracks the pointer exactly until the group is rotated;
 * containment measured before quantization, which passes by a ten-thousandth of
 * a pixel and commits outside the safe area; a clamp, which draws a design that
 * fits and is not the one the customer made; and a rotation about the
 * transformed-AABB centre, correct for a square and drifting for everything
 * else.
 *
 * The last block rewinds the phase document to prove the **pre-S03** half still
 * bites.
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
  checkApp3S03,
  checkChrome,
  checkCommandIndex,
  checkDesignApproval,
  checkFoundation,
  checkGeometryAuthority,
  checkImmutability,
  checkNonScope,
  checkPredecessorGates,
  checkPredecessors,
  checkValidation,
  checkWorkingDocument,
} from './check-app3-s03.mjs';
import { FEATURE, read } from './check-app3-s03.sources.mjs';

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
  base = mkdtempSync(join(tmpdir(), 'app3-s03-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s03.mjs',
    'tools/check-app3-s03.sources.mjs',
    'tools/check-app3-s03-runtime.mjs',
    'tools/check-app3-s02.mjs',
    'tools/check-app3-s02.sources.mjs',
    'tools/check-app3-s02-runtime.mjs',
    'tools/check-app3-s02-bans.mjs',
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
  // only the ones this harness happened to name.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s03-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** The phase document with S03 rewound to the world before this checkpoint. */
function beforeS03() {
  return file('phase').replace(
    /\nAPP3-S03 = COMPLETE[^\n]*\n/,
    '\nAPP3-S03 = READY — NOT STARTED\n',
  );
}

describe('the gate passes the repository it rules on', () => {
  it('reports no failure against the delivered checkpoint', () => {
    assert.deepEqual(checkApp3S03(baseRoot()), []);
  });
});

describe('entry authority', () => {
  it('refuses a predecessor that is not review-accepted', () => {
    for (const id of ['APP3-S02', 'APP3-S07', 'APP3-P02']) {
      const root = rootWith({
        phase: file('phase').replace(
          `\n${id} = COMPLETE — REVIEW_ACCEPTED\n`,
          `\n${id} = COMPLETE — REVIEW_DELIVERED\n`,
        ),
      });
      assert.ok(mentions(failuresOf(checkPredecessors, root), id));
    }
  });

  it('refuses a status block that does not record the resize model', () => {
    // The one fact a reader cannot recompute from the source: *which* v1
    // representation a resize persists, and on what authority.
    const root = rootWith({
      phase: file('phase').replace(
        'APP3-S03 RESIZE_PERSISTENCE = SCALE_ABOUT_THE_LOCAL_BOX_CENTRE',
        'APP3-S03 RESIZE_PERSISTENCE = WHATEVER_LOOKED_RIGHT',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'RESIZE_PERSISTENCE'));
  });

  it('refuses a status block that does not record the flip audit', () => {
    const root = rootWith({
      phase: file('phase').replace('APP3-S03 FLIP = NOT_AUTHORIZED_BY_CURRENT_S03_DESIGN', ''),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'FLIP'));
  });

  it('refuses S11 recorded complete, which needs S07 as well', () => {
    const root = rootWith({
      phase: `${file('phase')}\nAPP3-S11 = COMPLETE — REVIEW_DELIVERED\n`,
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-S11'));
  });
});

describe('scoped design approval', () => {
  it('refuses an S03 row that stayed unapproved', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE \|[^\n]*?)APPROVED_FOR_IMPLEMENTATION/,
        '$1REVIEW_REQUIRED',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-TRANSFORM-DESKTOP-RESIZE'),
    );
  });

  it('refuses an S03 row carrying the wrong node', () => {
    const root = rootWith({ registry: file('registry').replace('| 606:326 |', '| 606:999 |') });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'does not carry node'));
  });

  it('refuses a blanket Studio approval', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED \|[^\n]*?)REVIEW_REQUIRED/,
        '$1APPROVED_FOR_IMPLEMENTATION',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-AUTOSAVE-DESKTOP-SAVED'));
  });

  it('refuses the shared 1024 reference re-attributed to this checkpoint', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*?)\| APP3-D01-C1 \|/,
        '$1| APP3-S03 |',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'no longer belongs'));
  });
});

describe('the persisted fields, and whose frame they are in', () => {
  it('refuses a resize that rewrites width instead of scale', () => {
    // Identical on a rectangle; a freehand element would simply not resize,
    // because its envelope comes from its stored points.
    const root = rootWith({
      transform: file('transform').replace(
        'return { ...start, scaleX, scaleY };',
        'return { ...start, width: start.width + documentDelta.x };',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'resize does not persist scale'));
  });

  it('refuses a move that adds the document delta straight to x and y', () => {
    // Correct for a root element, wrong for every grouped child under a rotated
    // group, and indistinguishable until someone rotates one.
    const root = rootWith({
      transform: file('transform').replace(
        'const local = transformVector(inverse, documentDelta);',
        'const local = documentDelta;',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'parent frame'));
  });

  it('refuses a move that does not invert the parent frame', () => {
    const root = rootWith({
      transform: file('transform').replace(
        'safeInvert(frames.parent)',
        'safeInvert(frames.effective)',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'invert the parent frame'));
  });

  it('refuses a rotation that reaches for bounds instead of the centre', () => {
    const root = rootWith({
      transform: `${file('transform')}\nconst centre = getElementBounds(d, id);\n`,
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'reaches for bounds'));
  });

  it('refuses a rotation that does not build on the starting angle', () => {
    const root = rootWith({
      transform: file('transform').replace(
        'rotationDeg: start.rotationDeg + shortestTurn(swept)',
        'rotationDeg: shortestTurn(swept)',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'starting angle'));
  });

  it('refuses a second matrix builder anywhere in the feature', () => {
    for (const local of ['Math.cos(1)', 'multiplyMatrices(a, b)', 'new DOMMatrix()']) {
      const root = rootWith({ mapping: `${file('mapping')}\nconst m = ${local};\n` });
      assert.ok(
        mentions(failuresOf(checkGeometryAuthority, root), 'builds a matrix the engine owns'),
      );
    }
  });

  it('refuses angle conversion outside the transform model', () => {
    const root = rootWith({
      stageScreen: `${file('stageScreen')}\nconst a = Math.atan2(1, 2);\n`,
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'outside the transform model'));
  });

  it('refuses geometry taken from the DOM', () => {
    for (const measurement of ['getBoundingClientRect()', 'getScreenCTM()', 'getBBox()']) {
      const root = rootWith({ overlay: `${file('overlay')}\nconst r = node.${measurement};\n` });
      assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry from the DOM'));
    }
  });

  it('refuses the engine going unasked', () => {
    const root = rootWith({
      transform: file('transform').replaceAll('resolveEffectiveTransform', 'guessTransform'),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'does not ask the engine'));
  });
});

describe('a candidate is quantized, measured, then blocked or committed', () => {
  it('refuses containment measured before quantization', () => {
    // Passes by a ten-thousandth of a pixel on the raw number and fails on the
    // number that is actually stored — the overhang nobody sees.
    const authority = file('authority');
    const quantized = authority.replace(
      '  const document = quantizeDesignDocument(structure.value);',
      '  const document = structure.value;',
    );
    const root = rootWith({ authority: quantized });
    assert.ok(mentions(failuresOf(checkValidation, root), 'quantizeDesignDocument('));
  });

  it('refuses a candidate that skips containment or physical size', () => {
    for (const api of ['validateElementWithinEmbroideryArea', 'validateElementPhysicalSize']) {
      const root = rootWith({ authority: file('authority').replaceAll(`${api}(`, 'skip(') });
      assert.ok(mentions(failuresOf(checkValidation, root), api));
    }
  });

  it('refuses a repair of any kind', () => {
    for (const repair of [
      'const x = clampToArea(v);',
      'const y = snapToEdge(v);',
      'const z = scaleDown(v);',
    ]) {
      const root = rootWith({ transform: `${file('transform')}\n${repair}\n` });
      assert.ok(mentions(failuresOf(checkValidation, root), 'repairs an invalid candidate'));
    }
  });

  it('refuses a commit that is not gated on the outcome', () => {
    const root = rootWith({
      gesture: file('gesture').replace(
        'if (outcome.ok) {\n      liveCommit(outcome.document);',
        'if (true) {\n      liveCommit(outcome.document);',
      ),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'was not ruled valid'));
  });

  it('refuses a physical scale that is not the Product Side pxPerMm', () => {
    const root = rootWith({
      authority: file('authority').replace('pxPerMm: scope.pxPerMm', 'pxPerMm: 96 / 25.4'),
    });
    assert.ok(mentions(failuresOf(checkValidation, root), 'Product Side'));
  });
});

describe('one runtime-only working document', () => {
  it('refuses a re-initialize that discards local edits', () => {
    const root = rootWith({
      documentStore: file('documentStore').replace(
        'set((state) => (state.sessionKey === sessionKey ? state : { sessionKey, document }));',
        'set({ sessionKey, document });',
      ),
    });
    assert.ok(mentions(failuresOf(checkWorkingDocument, root), 'discards local edits'));
  });

  it('refuses a Session identity coming to rest in the store', () => {
    const root = rootWith({
      documentStore: `${file('documentStore')}\nexport const key = (sessionId) => sessionId;\n`,
    });
    assert.ok(mentions(failuresOf(checkWorkingDocument, root), 'a Session identity reaches'));
  });

  it('refuses a second store holding a document', () => {
    const root = rootWith({
      [`${FEATURE}/store/studio-draft.store.ts`]: 'import type { DesignDocument } from "x";\n',
    });
    assert.ok(mentions(failuresOf(checkWorkingDocument, root), 'stores hold a document'));
  });

  it('refuses the working document reaching browser storage', () => {
    const root = rootWith({
      gesture: `${file('gesture')}\nlocalStorage.setItem('doc', '1');\n`,
    });
    assert.ok(mentions(failuresOf(checkWorkingDocument, root), 'persists the working document'));
  });

  it('refuses a working document not keyed by Session and revision', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'sessionKeyOf(snapshot.sessionId, snapshot.revision)',
        "'one-key'",
      ),
    });
    assert.ok(mentions(failuresOf(checkWorkingDocument, root), 'keyed by Session and revision'));
  });
});

describe('the approved DOM chrome', () => {
  it('refuses a handle set that is not the eight the design draws', () => {
    const root = rootWith({ handles: file('handles').replace("  'sw',\n", '') });
    // The `ResizeHandleId` union still names `sw`, which is exactly why the
    // rule reads the rendered array rather than searching the file.
    assert.ok(mentions(failuresOf(checkChrome, root), 'missing sw'));
  });

  it('refuses chrome drawn into the scene instead of the DOM', () => {
    const root = rootWith({
      overlay: file('overlay').replace(
        '<div\n      className="studio-stage__overlay"',
        '<svg><div\n      className="studio-stage__overlay"',
      ),
    });
    assert.ok(mentions(failuresOf(checkChrome, root), 'draws chrome into the scene'));
  });

  it('refuses handles placed on anything but the engine matrix', () => {
    const root = rootWith({ overlay: file('overlay').replaceAll('frames.effective', 'guess') });
    assert.ok(mentions(failuresOf(checkChrome, root), 'effective matrix'));
  });

  it('refuses handles that are not counter-scaled against the viewport', () => {
    const root = rootWith({ overlay: file('overlay').replaceAll('handleCounterScale(', 'one(') });
    assert.ok(mentions(failuresOf(checkChrome, root), 'counter-scaled'));
  });

  it('refuses a hit target below the shared minimum', () => {
    const root = rootWith({
      styles: file('styles').replace(
        '  width: styles.$size-touch-target-min;\n  height: styles.$size-touch-target-min;',
        '  width: 16px;\n  height: 16px;',
      ),
    });
    assert.ok(mentions(failuresOf(checkChrome, root), '44 px minimum'));
  });

  it('refuses a pointer handler on the drawn element', () => {
    // The move surface is DOM chrome; the SVG node stays exactly as APP3-S02
    // left it, which is what keeps that scene byte-identical.
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'onKeyDown={(event) => {',
        'onPointerDown={() => undefined}\n      onKeyDown={(event) => {',
      ),
    });
    assert.ok(mentions(failuresOf(checkChrome, root), 'follows a pointer'));
  });
});

describe('the capabilities S03 must not grow', () => {
  it('refuses a touch transform, which APP3-S11 owns', () => {
    const root = rootWith({
      gesture: file('gesture').replace(
        "if (event.pointerType === 'touch' || event.button !== 0) return;",
        '',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'a touch pointer is not refused'));
  });

  it('refuses undo, layer, text or autosave capability arriving early', () => {
    for (const [marker, owner] of [
      ['undoStack', 'APP3-S08'],
      ['reorder', 'APP3-S04'],
      ['fontPicker', 'APP3-S05'],
      ['publicDesignSessionAutosave', 'APP3-S10'],
    ]) {
      const root = rootWith({ overlay: `${file('overlay')}\nconst x = '${marker}';\n` });
      assert.ok(mentions(failuresOf(checkNonScope, root), owner));
    }
  });

  it('refuses a locked or hidden element becoming transformable', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'selected.visible && !selected.element.locked',
        'true',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'locked or hidden'));
  });

  it('refuses the selection store growing transform state', () => {
    const root = rootWith({
      selectionStore: file('selectionStore').replace(
        'selectedElementId: null,',
        'selectedElementId: null,\n  transform: null,',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'grew transform state'));
  });
});

describe('the scene and the viewport are unchanged', () => {
  it('refuses a second SVG', () => {
    const root = rootWith({ overlay: `${file('overlay')}\nconst extra = <svg />;\n` });
    assert.ok(mentions(failuresOf(checkFoundation, root), '<svg> roots'));
  });

  it('refuses the scene memoised on anything but the working document', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'sceneMemo.current),\n    [stageDocument],',
        'sceneMemo.current),\n    [stageDocument, zoomStep],',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkFoundation, root), 'memoised on the working document alone'),
    );
  });

  it('refuses the viewport transform leaving the S07 wrapper', () => {
    const root = rootWith({
      viewport: file('viewport').replaceAll('viewportTransform(', 'other('),
    });
    assert.ok(mentions(failuresOf(checkFoundation, root), 'left the S07 wrapper'));
  });

  it('refuses an interaction library', () => {
    const root = rootWith({
      overlay: `import Moveable from 'react-moveable';\n${file('overlay')}`,
    });
    assert.ok(mentions(failuresOf(checkFoundation, root), 'engine'));
  });
});

describe('the predecessor gates were narrowed, not deleted', () => {
  it('refuses an APP3-S02 gate that stopped ruling on the pointer or the measurement', () => {
    for (const kept of ['onPointerDown', 'clientWidth']) {
      const root = rootWith({
        'tools/check-app3-s02-bans.mjs': file('tools/check-app3-s02-bans.mjs').replaceAll(
          kept,
          'somethingElse',
        ),
      });
      assert.ok(mentions(failuresOf(checkPredecessorGates, root), 'no longer rules on'));
    }
  });

  it('refuses a narrowing that is not world-aware', () => {
    // Both modules, because the rule reads the S02 gate as a **family**: the
    // ban lists live in one file and the design approval in another, and
    // mutating only one would leave the token present and prove nothing.
    const root = rootWith(
      Object.fromEntries(
        ['tools/check-app3-s02.mjs', 'tools/check-app3-s02-runtime.mjs'].map((path) => [
          path,
          file(path).replaceAll('isS03Delivered', 'alwaysTrue'),
        ]),
      ),
    );
    assert.ok(mentions(failuresOf(checkPredecessorGates, root), 'no longer rules on'));
  });
});

describe('the artifacts a frontend checkpoint must not move', () => {
  it('refuses a changed OpenAPI surface', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/api/public/design-sessions/{sessionId}/transform'] = { post: {} };
    const root = rootWith({ openapi: JSON.stringify(document) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'expected 35/40'));
  });

  it('refuses an edited generated client', () => {
    const root = rootWith({ generatedClient: `// APP3-S03 edit\n${file('generatedClient')}` });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'carries an APP3-S03 edit'));
  });

  it('refuses a new root script', () => {
    const manifest = JSON.parse(file('rootPackage'));
    manifest.scripts['check:app3-s03'] = 'node tools/check-app3-s03.mjs';
    const root = rootWith({ rootPackage: JSON.stringify(manifest) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'root scripts'));
  });

  it('refuses an unregistered scoped command', () => {
    const root = rootWith({
      index: file('index').replaceAll('node tools/check-app3-s03.mjs', 'x'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'CMD-CHECK-APP3-S03'));
  });

  it('refuses a benchmark that omits a browser or the M scene', () => {
    const withoutWebkit = rootWith({
      benchmark: file('benchmark').replaceAll('webkit', 'chromium'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, withoutWebkit), 'does not measure webkit'));

    // `M` is the size that shows whether cost scales with the scene at all.
    const withoutM = rootWith({
      benchmarkFixtures: file('benchmarkFixtures').replace('M: 50, ', ''),
      benchmark: file('benchmark').replaceAll('M: 50', ''),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, withoutM), 'the M scene at 50'));
  });

  it('refuses a benchmark that measures no gesture', () => {
    const root = rootWith({ benchmark: file('benchmark').replaceAll('rotate', 'spin') });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'does not measure rotate'));
  });
});

describe('the pre-S03 world', () => {
  it('refuses the S03 design rows approved before S03 opened', () => {
    const root = rootWith({ phase: beforeS03() });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-TRANSFORM-DESKTOP-MOVE'));
  });

  it('applies no runtime rule in a world where the transform has not shipped', () => {
    const root = rootWith({ phase: beforeS03() });
    const failures = checkApp3S03(root);

    assert.ok(failures.length > 0);
    assert.ok(mentions(failures, 'FIG-STUDIO-TRANSFORM-DESKTOP-MOVE'));
    for (const runtime of ['<svg> roots', 'parent frame', 'repairs an invalid candidate']) {
      assert.ok(!mentions(failures, runtime), `runtime rule fired before S03: ${runtime}`);
    }
  });
});
