/**
 * Regressions for the `APP3-S02` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice
 * are the mutations that leave a **working stage**: a second `<svg>` renderer
 * that draws perfectly well; a matrix composed in the component instead of
 * asked of the engine, which agrees with `APP3-P02` on every fixture anyone
 * wrote and diverges on the rotated ones nobody did; a reversed paint order,
 * invisible until two elements overlap; a selection outline measured with
 * `getBoundingClientRect`, correct at one zoom level and wrong at every other;
 * an object URL never revoked; `placeholderData` restored over a `no-store`
 * background; and the published-Template asset route used as a Session media
 * shortcut, which shows the right picture through the wrong authority.
 *
 * The last block rewinds the phase document to prove the **pre-S02** half still
 * bites: a renderer, and a design row approved before its checkpoint opened.
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
  checkApp3S02,
  checkCommandIndex,
  checkDependencies,
  checkDesignApproval,
  checkGeometryAuthority,
  checkImmutability,
  checkMedia,
  checkNonScope,
  checkPredecessors,
  checkRenderer,
  checkSelection,
} from './check-app3-s02.mjs';
import { FEATURE, read } from './check-app3-s02.sources.mjs';

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
  base = mkdtempSync(join(tmpdir(), 'app3-s02-'));
  temporaries.push(base);

  for (const relative of [
    ...Object.values(CANONICAL_FILES),
    'tools/check-app3-s02.mjs',
    'tools/check-app3-s02.sources.mjs',
    'tools/check-app3-s02-runtime.mjs',
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
  // renderer would arrive.
  cpSync(join(REPO_ROOT, FEATURE), join(base, FEATURE), { recursive: true });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s02-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

/** The phase document with S03 rewound to the world before that checkpoint. */
function beforeS03() {
  return file('phase').replace(
    /\nAPP3-S03 = COMPLETE[^\n]*\n/,
    '\nAPP3-S03 = READY — NOT STARTED\n',
  );
}

/** The phase document with S07 rewound to the world before that checkpoint. */
function beforeS07() {
  return file('phase').replace(
    /\nAPP3-S07 = COMPLETE[^\n]*\n/,
    '\nAPP3-S07 = READY — NOT STARTED\n',
  );
}

/** The phase document with S02 rewound to the world before this checkpoint. */
function beforeS02() {
  return file('phase').replace(
    /\nAPP3-S02 = COMPLETE[^\n]*\n/,
    '\nAPP3-S02 = READY — NOT STARTED\n',
  );
}

describe('the gate passes the repository it rules on', () => {
  it('reports no failure against the delivered checkpoint', () => {
    assert.deepEqual(checkApp3S02(baseRoot()), []);
  });
});

describe('entry authority', () => {
  it('refuses a predecessor that is not review-accepted', () => {
    const root = rootWith({
      phase: file('phase').replace(
        '\nAPP3-P02 = COMPLETE — REVIEW_ACCEPTED\n',
        '\nAPP3-P02 = COMPLETE — REVIEW_DELIVERED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-P02'));
  });

  it('refuses an S01 correction that was never accepted', () => {
    const root = rootWith({
      phase: file('phase').replace(
        '\nAPP3-S01-C1 = COMPLETE — REVIEW_ACCEPTED\n',
        '\nAPP3-S01-C1 = COMPLETE — REVIEW_DELIVERED\n',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'APP3-S01-C1'));
  });

  it('refuses a status block that does not record the deferred image mode', () => {
    // The one fact a reader cannot recompute from the source, and the one a
    // later checkpoint has to know: S02 did not deliver Session image bytes.
    const root = rootWith({
      phase: file('phase').replace(
        'APP3-S02 IMAGE_MEDIA_MODE = DEFERRED_TO_S06_B06C',
        'APP3-S02 IMAGE_MEDIA_MODE = DONE',
      ),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'IMAGE_MEDIA_MODE'));
  });

  it('refuses a checkpoint that claims a migration or a backend change', () => {
    const root = rootWith({
      phase: file('phase').replace('APP3-S02 MIGRATION = NONE', 'APP3-S02 MIGRATION = 0035'),
    });
    assert.ok(mentions(failuresOf(checkPredecessors, root), 'MIGRATION = NONE'));
  });

  it('refuses B06C recorded complete inside this checkpoint', () => {
    // S03 has since shipped legitimately, so its status line stops being
    // evidence about S02; what still proves S02 built no transform is its own
    // runtime half, exercised below.
    for (const later of ['APP3-B06C']) {
      const root = rootWith({
        phase: `${file('phase')}\n${later} = COMPLETE — REVIEW_DELIVERED\n`,
      });
      assert.ok(mentions(failuresOf(checkPredecessors, root), later));
    }
  });
});

describe('scoped design approval', () => {
  it('refuses an S02 row that stayed unapproved', () => {
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-STAGE-DESKTOP-EMPTY \|[^\n]*)APPROVED_FOR_IMPLEMENTATION/,
        '$1REVIEW_REQUIRED',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-STAGE-DESKTOP-EMPTY'));
  });

  it('refuses an approval that carries no evidence', () => {
    const root = rootWith({
      registry: file('registry').replaceAll('APP3-S02 §5 operator review', '—'),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'approval evidence'));
  });

  it('refuses a blanket Studio approval', () => {
    // The mutation that unblocks every later Studio checkpoint at once, and the
    // reason approval is asserted in both directions.
    const root = rootWith({
      registry: file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION'),
    });
    // A row whose own checkpoint has *not* opened. Transform is no longer one:
    // `APP3-S03` shipped and approved it, which is precisely why the assertion
    // has to move to a row that is still closed rather than stay where it was.
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-APP3-HANDOFF-DEPENDENCY'));
  });

  it('refuses a row whose node id moved', () => {
    const root = rootWith({ registry: file('registry').replaceAll('| 606:3 |', '| 606:9999 |') });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), '606:3'));
  });

  it('refuses the shared 1024 reference re-attributed to this checkpoint', () => {
    // A responsive reference across S02–S11. Owning it here would quietly turn
    // it into a licence for every capability drawn on it.
    const root = rootWith({
      registry: file('registry').replace(
        /(\| FIG-STUDIO-EDITING-TABLET-1024 \|[^\n]*)APP3-D01-C1/,
        '$1APP3-S02',
      ),
    });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-EDITING-TABLET-1024'));
  });
});

describe('one native-SVG renderer', () => {
  it('refuses a second renderer anywhere in the feature', () => {
    const root = rootWith({
      [`${FEATURE}/components/studio-second-stage.tsx`]: 'export const S = () => <svg />;',
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'opens 2 <svg> roots'));
  });

  it('refuses a canvas', () => {
    const root = rootWith({
      [`${FEATURE}/components/studio-raster.tsx`]: 'export const S = () => <canvas />;',
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'renders a canvas'));
  });

  it('refuses a rendering engine imported into the feature', () => {
    const root = rootWith({
      stage: `import Konva from 'konva';\n${file('stage')}`,
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'konva'));
  });

  it('refuses a rendering engine added to the Storefront manifest', () => {
    const manifest = JSON.parse(file('storefrontPackage'));
    manifest.dependencies['react-konva'] = '19.2.5';
    const root = rootWith({ storefrontPackage: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failuresOf(checkDependencies, root), 'react-konva'));
  });

  it('refuses a Storefront that dropped an engine package it interprets documents with', () => {
    const manifest = JSON.parse(file('storefrontPackage'));
    delete manifest.dependencies['@embroidery/design-engine'];
    const root = rootWith({ storefrontPackage: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failuresOf(checkDependencies, root), '@embroidery/design-engine'));
  });

  it('refuses a new shared package invented by this checkpoint', () => {
    const manifest = JSON.parse(file('storefrontPackage'));
    manifest.dependencies['@embroidery/design-renderer'] = 'workspace:*';
    const root = rootWith({ storefrontPackage: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failuresOf(checkDependencies, root), 'design-renderer'));
  });

  it('refuses a stage that resolves geometry instead of consuming the adapter', () => {
    // The mutation that leaves a working picture: the component builds the
    // graph itself, and the adapter boundary quietly stops being one.
    const root = rootWith({
      stage: file('stage').replace(
        'const selectedBounds =',
        'const graph = buildElementGraph(document);\n  const selectedBounds =',
      ),
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'resolves geometry itself'));
  });

  it('refuses a Storefront that imports the isolated APP0 spike', () => {
    const root = rootWith({
      stageScreen: `import { x } from '../../../../../../spikes/app0-r01-design-studio/src/x';\n${file('stageScreen')}`,
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'spikes/'));
  });

  it('refuses a Storefront that imports the Admin editor feature', () => {
    const root = rootWith({
      stageScreen: `import { EditorStage } from 'apps/admin/src/features/design-template-editor';\n${file('stageScreen')}`,
    });
    assert.ok(mentions(failuresOf(checkRenderer, root), 'apps/admin'));
  });
});

describe('geometry stays with APP3-P02', () => {
  it('refuses an adapter that stops asking the engine for the effective transform', () => {
    const root = rootWith({
      scene: file('scene').replaceAll('resolveEffectiveTransform', 'localTransform'),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'resolveEffectiveTransform'));
  });

  it('refuses an adapter that skips the APP3-P01 document boundary', () => {
    // The mutation that renders a document nobody validated: everything looks
    // right until a payload this build cannot read arrives.
    const root = rootWith({
      scene: file('scene').replace(
        'const validated = validateDesignDocumentStructure(payload);',
        'const validated = { ok: true, value: payload };',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'APP3-P01'));
  });

  it('refuses an adapter that resolves a font outside the controlled registry', () => {
    const root = rootWith({
      scene: file('scene').replaceAll('findControlledFont', 'anyFontFamily'),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'controlled registry'));
  });

  it('refuses local trigonometry anywhere in the feature', () => {
    const root = rootWith({
      [`${FEATURE}/renderer/studio-rotate.ts`]:
        'export const r = (d) => Math.cos((d * 180) / Math.PI);',
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry the engine owns'));
  });

  it('refuses a local px to mm conversion', () => {
    const root = rootWith({
      [`${FEATURE}/renderer/studio-units.ts`]: 'export const mm = (px, pxPerMm) => px / pxPerMm;',
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry the engine owns'));
  });

  it('refuses a selection outline measured from the DOM', () => {
    // Correct at one zoom level and wrong at every other, which is the failure
    // nobody notices on a desktop-only review.
    const root = rootWith({
      stageSelection: file('stageSelection').replace(
        'bounds.minX',
        'node.getBoundingClientRect().left',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry from the DOM'));
  });

  it('refuses a viewBox that is not the document placement canvas', () => {
    const root = rootWith({
      stage: file('stage').replace(
        'viewBox={`0 0 ${String(scene.canvasWidthPx)} ${String(scene.canvasHeightPx)}`}',
        'viewBox={`0 0 ${String(scene.canvasWidthPx * zoom)} ${String(scene.canvasHeightPx)}`}',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'placement canvas'));
  });

  it('refuses a reversed paint order', () => {
    // Invisible until two elements overlap, and then wrong in a way that reads
    // as a design mistake rather than a rendering one.
    const root = rootWith({
      stage: file('stage').replace('{scene.elements', '{[...scene.elements].reverse()'),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 're-orders the element list'));
  });

  it('refuses a scene sorted by anything at all', () => {
    const root = rootWith({
      scene: file('scene').replace(
        'return {\n    ok: true,',
        'elements.sort();\n  return {\n    ok: true,',
      ),
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 're-orders the element list'));
  });
});

describe('runtime-only selection', () => {
  it('refuses a store that holds a browser resource', () => {
    const root = rootWith({
      store: file('store').replace(
        'selectedElementId: null,',
        'selectedElementId: null,\n  blob: new Blob(),',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'Blob'));
  });

  it('refuses a store that holds a Session identity', () => {
    const root = rootWith({
      store: file('store').replace(
        'selectedElementId: null,',
        'selectedElementId: null,\n  sessionId: null,',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'sessionId'));
  });

  it('refuses a multi-selection S02 does not own', () => {
    const root = rootWith({
      store: file('store').replaceAll('selectedElementId', 'selectedElementIds'),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'multi-selection'));
  });

  it('refuses state a later checkpoint owns, pre-built here', () => {
    const root = rootWith({
      store: file('store').replace(
        'selectedElementId: null,',
        'selectedElementId: null,\n  zoom: 1,',
      ),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'zoom'));
  });

  it('refuses a selection sent to the server', () => {
    const root = rootWith({
      [`${FEATURE}/services/studio-selection.client.ts`]:
        'export const send = (selectedElementId) => selectedElementId;',
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'runtime selection to the server'));
  });

  it('refuses a stale selection that is never dropped', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replaceAll('reconcileSelection', 'keepSelection'),
    });
    assert.ok(mentions(failuresOf(checkSelection, root), 'stale selection'));
  });
});

describe('the one media path', () => {
  it('refuses an object URL that is never revoked', () => {
    const root = rootWith({
      backgroundHook: file('backgroundHook').replaceAll('URL.revokeObjectURL', 'noop'),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'created and revoked'));
  });

  it('refuses revocation that is not effect cleanup', () => {
    const root = rootWith({
      backgroundHook: file('backgroundHook').replace(
        'return () => {\n      URL.revokeObjectURL(url);',
        'URL.revokeObjectURL(url);\n    return () => {\n      void url;',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'effect cleanup'));
  });

  it('refuses a retained no-store blob', () => {
    // `replaceAll` on the trailing comma: the prose above the hook quotes
    // `gcTime: 0` while explaining why it is load-bearing, and a mutation that
    // only rewrote the sentence would prove nothing about the code.
    const root = rootWith({
      backgroundHook: file('backgroundHook').replaceAll('gcTime: 0,', 'gcTime: 300_000,'),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'retained'));
  });

  it('refuses placeholderData over the background key', () => {
    // The mutation that leaves a working stage and shows the previous Side's
    // garment under the current Side's design.
    const root = rootWith({
      backgroundHook: file('backgroundHook').replace(
        'gcTime: 0,',
        'gcTime: 0,\n    placeholderData: 1,',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'previous'));
  });

  it('refuses a background addressed by an asset or storage identity', () => {
    const root = rootWith({
      backgroundService: file('backgroundService').replace(
        'sideCode: string,',
        'sideCode: string,\n  assetId: string,',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'assetId'));
  });

  it('refuses the curated boundary dropping the operation it consumes', () => {
    const root = rootWith({
      curatedClient: file('curatedClient').replaceAll('publicProductSideBackgroundGet', 'x'),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'not exported to consumers'));
  });

  /*
   * Autosave crossed at `APP3-S10`, which owns saving. The rule is about
   * withholding an operation until its screen exists, so the mutation moves to
   * one that still has no screen rather than being deleted.
   */
  it('refuses an operation crossing without a screen', () => {
    const root = rootWith({
      curatedClient: file('curatedClient').replace(
        '  publicProductSideBackgroundGet,',
        '  publicProductSideBackgroundGet,\n  publicProductMediaGet,',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'publicProductMediaGet'));
  });

  it('refuses B05A used as a Session media shortcut', () => {
    // The mutation that shows the right picture through the wrong authority:
    // Template lineage is provenance, not permission, and clone independence is
    // exactly what it breaks.
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'return <ImagePlaceholder width={width} height={height} />;',
        'return <img src={publicDesignTemplateAssetGet(slug, version, element.assetId)} />;',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'Session media shortcut'));
  });

  it('refuses a Session asset route that does not exist yet', () => {
    const root = rootWith({
      backgroundService: file('backgroundService').replace(
        'publicProductSideBackgroundGet(',
        'publicDesignSessionAssetCreate(',
      ),
    });
    assert.ok(mentions(failuresOf(checkMedia, root), 'publicDesignSessionAsset'));
  });
});

describe('the capabilities S02 must not grow', () => {
  it('refuses a pointer-move handler added early', () => {
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'onKeyDown={(event) => {',
        'onPointerMove={() => undefined}\n      onKeyDown={(event) => {',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S03'));
  });

  it('refuses a wheel handler, which is zoom', () => {
    const root = rootWith({
      stage: file('stage').replace(
        'onClick={(event) => {',
        'onWheel={() => undefined}\n      onClick={(event) => {',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S07'));
  });

  it('refuses a second watermark built outside the files APP3-S09 owns', () => {
    // The word is legitimate from S09; **building** one here is not.
    const root = rootWith({
      [`${FEATURE}/components/studio-second-watermark.tsx`]:
        "export const mark = 'studio-watermark__rogue';",
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'builds a watermark outside'));
  });

  it('refuses a document mutation', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        'const area =',
        'snapshot.document.elements.push(1);\n  const area =',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'mutates the Design Document'));
  });
});

describe('the artifacts a frontend checkpoint must not move', () => {
  it('refuses a changed OpenAPI surface', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/api/public/design-sessions/{sessionId}/thumbnail'] = { get: {} };
    const root = rootWith({ openapi: JSON.stringify(document) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'expected 35/40'));
  });

  it('refuses an edited generated client', () => {
    const root = rootWith({
      generatedClient: `// APP3-S02 edit\n${file('generatedClient')}`,
    });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'carries an APP3-S02 edit'));
  });

  it('refuses a new root script', () => {
    const manifest = JSON.parse(file('rootPackage'));
    manifest.scripts['check:app3-s02'] = 'node tools/check-app3-s02.mjs';
    const root = rootWith({ rootPackage: JSON.stringify(manifest) });
    assert.ok(mentions(failuresOf(checkImmutability, root), 'root scripts'));
  });

  it('refuses an unregistered scoped command', () => {
    const root = rootWith({
      index: file('index').replaceAll('node tools/check-app3-s02.mjs', 'x'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'CMD-CHECK-APP3-S02'));
  });

  it('refuses a benchmark command that is not indexed', () => {
    const root = rootWith({
      index: file('index').replaceAll('--testPathPatterns=studio-stage-scale', 'x'),
    });
    assert.ok(mentions(failuresOf(checkCommandIndex, root), 'CMD-BENCH-APP3-S02-EDITOR'));
  });
});

describe('the pre-S02 world', () => {
  it('refuses the S02 design rows approved before S02 opened', () => {
    const root = rootWith({ phase: beforeS02() });
    assert.ok(
      mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED'),
    );
  });

  it('applies no runtime rule in a world where the stage has not shipped', () => {
    // The runtime rules read the stage's own source, so running them before the
    // checkpoint ships would be ruling on a stage that does not exist. What the
    // pre-S02 world *does* rule on is the governance half — and it refuses,
    // which is what stops "rewind the phase line" from being a way past the gate.
    const root = rootWith({ phase: beforeS02() });
    const failures = checkApp3S02(root);

    assert.ok(failures.length > 0);
    assert.ok(mentions(failures, 'FIG-STUDIO-STAGE-DESKTOP-UNSELECTED'));
    for (const runtime of ['<svg> roots', 'geometry from the DOM', 'effect cleanup']) {
      assert.ok(!mentions(failures, runtime), `runtime rule fired before S02: ${runtime}`);
    }
  });
});

/*
 * The world-aware half.
 *
 * `APP3-S07` legitimately introduced a pointer gesture and one measurement of an
 * element's own size — both of which S02 banned outright. The bans were narrowed
 * to exclude the five files S07 added, and never deleted, so these prove the
 * three ways that narrowing could have become a hole: the gesture arriving in a
 * file S07 did not introduce, the measurement doing the same, and either of them
 * arriving before S07 shipped at all.
 */
