/**
 * Regressions for the `APP3-P02` gate.
 *
 * Every case breaks exactly one ruled semantic in a throwaway copy of the
 * package and proves the checker refuses it. Behaviour of the geometry itself is
 * the package's own 137 unit tests; what these guard is the seam between the
 * ruling and the implementation.
 *
 * The cases worth reading twice all compile and all pass a type check: an
 * anticlockwise rotation matrix, a `child × parent` composition, a stroke added
 * after the transform, a second quantization scale. None would fail `tsc`, and
 * each silently relocates or re-admits designs that were already approved.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import {
  CANONICAL_FILES,
  PACKAGE_DIR,
  REPO_ROOT,
  SRC_DIR,
  checkApp3P02,
} from './check-app3-p02.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * The gate chains G05 → P01 → F01/DB01 → G04 → G03 → G02 → G01, so the root needs
 * every canonical file those gates read plus real `.git` history for G01's
 * chronology half. `node:test` runs subtests sequentially, so applying an edit
 * and putting the original back is safe.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-p02-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(G05_FILES),
    ...Object.values(DB01_FILES),
    ...Object.values(G01_FILES),
    ...Object.values(G02_FILES),
    ...Object.values(G03_FILES),
    ...Object.values(G04_FILES),
    ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
    `${FONT_DIR}/.gitattributes`,
    `${DOCUMENT_PACKAGE}/package.json`,
  ]);
  for (const relative of canonical) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  for (const directory of [
    SRC_DIR,
    DOCUMENT_SRC,
    'packages/database/migrations',
    'apps/api/src/modules/design',
    '.git',
  ]) {
    cpSync(join(REPO_ROOT, directory), join(base, directory), { recursive: true });
  }
  return base;
}

/** Runs the gate against the shared root with `edits` applied, then restores. */
function run(edits = {}) {
  const dir = baseRoot();
  const touched = Object.keys(edits);
  for (const [relative, content] of Object.entries(edits)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checkApp3P02(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP3-P02 — the delivered package passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3P02(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-P02 — the package must be implemented', () => {
  it('rejects the empty stub the first attempt left behind', () => {
    const failures = run({ [CANONICAL_FILES.index]: 'export {};\n' });
    assert.ok(mentions(failures, 'still the empty stub'), failures.join('\n'));
  });

  it('rejects a missing public export', () => {
    const text = read(CANONICAL_FILES.index).replaceAll('getGroupBounds', 'groupBox');
    const failures = run({ [CANONICAL_FILES.index]: text });
    assert.ok(mentions(failures, 'does not export getGroupBounds'), failures.join('\n'));
  });

  it('rejects a manifest without the design-document dependency', () => {
    const manifest = JSON.parse(read(CANONICAL_FILES.manifest));
    delete manifest.dependencies;
    const failures = run({ [CANONICAL_FILES.manifest]: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failures, 'production dependency'), failures.join('\n'));
  });

  it('rejects a manifest with no test or build script', () => {
    for (const script of ['test', 'build']) {
      const manifest = JSON.parse(read(CANONICAL_FILES.manifest));
      delete manifest.scripts[script];
      const failures = run({ [CANONICAL_FILES.manifest]: JSON.stringify(manifest, null, 2) });
      assert.ok(mentions(failures, `no ${script} script`), failures.join('\n'));
    }
  });
});

describe('APP3-P02 — the dependency boundary holds', () => {
  it('rejects any import beyond the design-document public root', () => {
    const text = `import { z } from 'zod';\n${read(CANONICAL_FILES.units)}`;
    const failures = run({ [CANONICAL_FILES.units]: text });
    assert.ok(mentions(failures, 'only the design-document public root'), failures.join('\n'));
  });

  it('rejects a deep import into design-document', () => {
    const text = read(CANONICAL_FILES.quantized).replaceAll(
      "'@embroidery/design-document'",
      "'@embroidery/design-document/src/quantization/quantize'",
    );
    const failures = run({ [CANONICAL_FILES.quantized]: text });
    assert.ok(mentions(failures, 'deep-imports'), failures.join('\n'));
  });

  it('rejects a renderer or framework import', () => {
    const text = `import Konva from 'konva';\n${read(CANONICAL_FILES.bounds)}`;
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'forbidden module'), failures.join('\n'));
  });

  it('rejects a Node built-in, which would end browser safety', () => {
    const text = `import { readFileSync } from 'node:fs';\n${read(CANONICAL_FILES.graph)}`;
    const failures = run({ [CANONICAL_FILES.graph]: text });
    assert.ok(mentions(failures, 'Node built-in'), failures.join('\n'));
  });

  it('rejects module-level mutable state', () => {
    const text = `${read(CANONICAL_FILES.bounds)}\nlet cache = 0;\n`;
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'module-level mutable state'), failures.join('\n'));
  });
});

describe('APP3-P02 — the matrix contract cannot drift', () => {
  it('rejects an anticlockwise rotation matrix', () => {
    const text = read(CANONICAL_FILES.matrix)
      .replace('b: sin,', 'b: normalize(-sin),')
      .replace('c: normalize(-sin),', 'c: sin,');
    const failures = run({ [CANONICAL_FILES.matrix]: text });
    assert.ok(mentions(failures, 'a = cos, b = sin'), failures.join('\n'));
  });

  it('rejects row-vector semantics in transformPoint', () => {
    const text = read(CANONICAL_FILES.matrix).replace(
      'matrix.a * point.x + matrix.c * point.y + matrix.e',
      'matrix.a * point.x + matrix.b * point.y + matrix.e',
    );
    const failures = run({ [CANONICAL_FILES.matrix]: text });
    assert.ok(mentions(failures, 'column-vector semantics'), failures.join('\n'));
  });

  it('rejects rotation applied before scale', () => {
    const text = read(CANONICAL_FILES.matrix).replace(
      'rotationClockwiseMatrix(transform.rotationDeg),\n    scaleMatrix(transform.scaleX, transform.scaleY),',
      'scaleMatrix(transform.scaleX, transform.scaleY),\n    rotationClockwiseMatrix(transform.rotationDeg),',
    );
    const failures = run({ [CANONICAL_FILES.matrix]: text });
    assert.ok(mentions(failures, 'scale must precede rotation'), failures.join('\n'));
  });

  it('rejects child x parent composition', () => {
    const text = read(CANONICAL_FILES.graph).replace('.reverse()', '');
    const failures = run({ [CANONICAL_FILES.graph]: text });
    assert.ok(mentions(failures, 'parent x child'), failures.join('\n'));
  });
});

describe('APP3-P02 — the stroke envelope cannot drift', () => {
  it('rejects dropping a fixed cap, join or miter limit', () => {
    for (const [from, to] of [
      ['RECTANGLE_MITER_LIMIT = 4', 'RECTANGLE_MITER_LIMIT = 10'],
      ["LINE_CAP = 'round'", "LINE_CAP = 'butt'"],
      ["FREEHAND_JOIN = 'round'", "FREEHAND_JOIN = 'bevel'"],
    ]) {
      const failures = run({
        [CANONICAL_FILES.envelope]: read(CANONICAL_FILES.envelope).replace(from, to),
      });
      assert.ok(failures.length > 0, `expected a failure for ${from}`);
    }
  });

  it('rejects removing the half-stroke expansion', () => {
    const text = read(CANONICAL_FILES.envelope).replaceAll(
      'strokeWidthPx / 2',
      'strokeWidthPx * 0',
    );
    const failures = run({ [CANONICAL_FILES.envelope]: text });
    assert.ok(mentions(failures, 'half the stroke width'), failures.join('\n'));
  });

  it('rejects a line path that is not (0,0) to (width,height)', () => {
    const text = read(CANONICAL_FILES.envelope).replace(
      '{ x: box.maxX, y: box.maxY },',
      '{ x: box.maxX, y: 0 },',
    );
    const failures = run({ [CANONICAL_FILES.envelope]: text });
    assert.ok(mentions(failures, 'v1 line path'), failures.join('\n'));
  });

  it('rejects transforming the unexpanded box instead of the envelope', () => {
    const text = read(CANONICAL_FILES.bounds).replace(
      'boundsCorners(envelope)',
      'boundsCorners(box)',
    );
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'corners of the local envelope'), failures.join('\n'));
  });
});

describe('APP3-P02 — group, scale and containment semantics', () => {
  it('rejects group bounds that stop unioning descendants', () => {
    const text = read(CANONICAL_FILES.bounds).replace('drawableDescendants(graph, groupId)', '[]');
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'union descendants'), failures.join('\n'));
  });

  it('rejects using the group persisted box as visible geometry', () => {
    // PO-07: that box is the group local frame and pivot, never its bounds.
    const text = `${read(CANONICAL_FILES.bounds)}\nconst _box = localEnvelope(group);\n`;
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'persisted box as visible geometry'), failures.join('\n'));
  });

  it('rejects a parent chosen by claim order', () => {
    // APP3-P02-C1, in the exact form the defect took: insert the first claim and
    // ignore the rest. It compiles, it is deterministic, and it is wrong.
    const text = read(CANONICAL_FILES.graph).replace(
      'if (claiming.size === 1 && onlyParent !== undefined) parentOf.set(childId, onlyParent);',
      'if (!parentOf.has(childId)) parentOf.set(childId, onlyParent);',
    );
    const failures = run({ [CANONICAL_FILES.graph]: text });
    assert.ok(mentions(failures, 'selects a parent by claim order'), failures.join('\n'));
  });

  it('rejects dropping any one ambiguity check', () => {
    for (const [from, to] of [
      ['listedHere.has(childId)', 'false'],
      ['claiming.size > 1', 'false'],
      ['childId === element.id', 'false'],
      ['!byId.has(childId)', 'false'],
      ['structuralFindings.length === 0', 'true'],
    ]) {
      const failures = run({
        [CANONICAL_FILES.graph]: read(CANONICAL_FILES.graph).replace(from, to),
      });
      assert.ok(mentions(failures, 'ambiguous parentage'), `expected a failure for ${from}`);
    }
  });

  it('rejects bounds or containment that proceed on an ambiguous graph', () => {
    for (const target of [CANONICAL_FILES.bounds, CANONICAL_FILES.containment]) {
      const text = read(target).replaceAll('structuralFinding(', 'noStructuralCheck(');
      const failures = run({ [target]: text });
      assert.ok(mentions(failures, 'no authoritative parentage'), failures.join('\n'));
    }
  });

  it('rejects prose that promises a winner, and a renamed regression test', () => {
    const claimed = `${read(CANONICAL_FILES.graph)}\n// The first parent wins.\n`;
    assert.ok(mentions(run({ [CANONICAL_FILES.graph]: claimed }), 'claims "first parent wins"'));

    const spec = read(CANONICAL_FILES.graphSpec).replace(
      'rejects two groups claiming one child',
      'keeps only the first parent',
    );
    const failures = run({ [CANONICAL_FILES.graphSpec]: spec });
    assert.ok(mentions(failures, 'renamed, not replaced'), failures.join('\n'));
  });

  it('rejects rebasing or flattening children', () => {
    const text = `${read(CANONICAL_FILES.graph)}\nexport function rebaseChildren() {}\n`;
    const failures = run({ [CANONICAL_FILES.graph]: text });
    assert.ok(mentions(failures, 'rebase'), failures.join('\n'));
  });

  it('rejects losing a placement mode', () => {
    const text = read(CANONICAL_FILES.authority).replaceAll('HISTORICAL_RENDER', 'LEGACY');
    const failures = run({ [CANONICAL_FILES.authority]: text });
    assert.ok(mentions(failures, 'HISTORICAL_RENDER'), failures.join('\n'));
  });

  it('rejects following a replacement chain automatically', () => {
    const text = `${read(CANONICAL_FILES.authority)}\nconst _next = 'supersededById';\n`;
    const failures = run({ [CANONICAL_FILES.authority]: text });
    assert.ok(mentions(failures, 'replacement chain'), failures.join('\n'));
  });

  it('rejects containment that no longer requires the full AABB inside', () => {
    const text = read(CANONICAL_FILES.containment).replace(
      'containsBounds(limits, box)',
      'containsPoint(limits, { x: box.minX, y: box.minY })',
    );
    const failures = run({ [CANONICAL_FILES.containment]: text });
    assert.ok(mentions(failures, 'full transformed AABB'), failures.join('\n'));
  });

  it('rejects clamping or snapping in containment', () => {
    const text = `${read(CANONICAL_FILES.containment)}\nexport function clampToArea() {}\n`;
    const failures = run({ [CANONICAL_FILES.containment]: text });
    assert.ok(mentions(failures, 'report, never move'), failures.join('\n'));
  });
});

describe('APP3-P02 — numeric authority cannot drift', () => {
  it('rejects restating the quantization scale', () => {
    const text = `${read(CANONICAL_FILES.quantized)}\nexport const SCALE = 10_000;\n`;
    const failures = run({ [CANONICAL_FILES.quantized]: text });
    assert.ok(mentions(failures, 'restates the quantization scale'), failures.join('\n'));
  });

  it('rejects an epsilon anywhere in production code', () => {
    const text = `${read(CANONICAL_FILES.bounds)}\nconst TOLERANCE = 1e-6;\n`;
    const failures = run({ [CANONICAL_FILES.bounds]: text });
    assert.ok(mentions(failures, 'introduces an epsilon'), failures.join('\n'));
  });

  it('rejects a DPI constant', () => {
    const text = `${read(CANONICAL_FILES.units)}\nconst inch = 96 / 25.4;\n`;
    const failures = run({ [CANONICAL_FILES.units]: text });
    assert.ok(mentions(failures, '96 DPI'), failures.join('\n'));
  });

  it('rejects an area-derived scale in px/mm conversion', () => {
    const text = read(CANONICAL_FILES.units).replace('side.pxPerMm', 'side.boundWidthPx');
    const failures = run({ [CANONICAL_FILES.units]: text });
    assert.ok(mentions(failures, 'product_sides.px_per_mm'), failures.join('\n'));
  });
});

describe('APP3-P02 — scope and entry authority', () => {
  it('rejects an API or UI implementation', () => {
    const failures = run({
      [CANONICAL_FILES.bounds]: `@Injectable()\n${read(CANONICAL_FILES.bounds)}`,
    });
    assert.ok(mentions(failures, 'no API or UI'), failures.join('\n'));
  });

  it('rejects geometry leaking into design-document', () => {
    const target = `${DOCUMENT_SRC}/validation/complexity.ts`;
    const text = `${read(target)}\nconst _angle = Math.cos(1);\n`;
    const failures = run({ [target]: text });
    assert.ok(mentions(failures, 'gained geometry'), failures.join('\n'));
  });

  it('rejects a missing typed finding code', () => {
    const target = `${SRC_DIR}/findings/finding.ts`;
    const text = read(target).replaceAll("'PLACEMENT_RETIRED'", "'RETIRED'");
    const failures = run({ [target]: text });
    assert.ok(mentions(failures, 'missing PLACEMENT_RETIRED'), failures.join('\n'));
  });

  it('reports an APP3-G05 regression from the gates it chains', () => {
    const text = read(G05_FILES.phase).replaceAll('CONSERVATIVE_TRANSFORMED_AABB', 'PATH_ACCURATE');
    const failures = run({ [G05_FILES.phase]: text });
    assert.ok(mentions(failures, 'APP3-G05 regression'), failures.join('\n'));
  });
});
