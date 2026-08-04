/**
 * Regressions for the `APP3-G05` geometry-authority gate.
 *
 * Every case flips exactly one ruled property in a throwaway copy of the
 * authority and proves the checker refuses it. No geometry is executed here —
 * `IMP-D045` is a decision, and this file guards the decision, not an
 * implementation of it.
 *
 * The cases worth reading twice are the ones that look like harmless edits: a
 * pivot moved from centre to corner, a composition order reversed, a
 * containment check narrowed to the untransformed box. None of them changes a
 * single stored byte, none changes a document hash, and every one of them
 * silently relocates or re-admits designs that were already approved. That
 * invisibility is the whole reason the decision needed locking and the reason
 * these assertions are exact-string rather than "mentions".
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
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR, SRC_DIR } from './check-app3-p01.mjs';
import {
  CANONICAL_FILES,
  DECISION_ID,
  FACTS_HEADING,
  REPO_ROOT,
  RULINGS_HEADING,
  checkApp3G05,
} from './check-app3-g05.mjs';

const PHASE = CANONICAL_FILES.phase;
const REGISTER = CANONICAL_FILES.register;
const ENGINE = CANONICAL_FILES.engine;

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * The gate chains P01 → F01/DB01 → G04 → G03 → G02 → G01, so the root needs every
 * canonical file those gates read plus real `.git` history for G01's chronology
 * half. `node:test` runs subtests sequentially, so applying an edit and putting
 * the original back is safe and avoids re-copying the repository per case.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-g05-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(DB01_FILES),
    ...Object.values(G01_FILES),
    ...Object.values(G02_FILES),
    ...Object.values(G03_FILES),
    ...Object.values(G04_FILES),
    ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
    `${FONT_DIR}/.gitattributes`,
    `${PACKAGE_DIR}/package.json`,
  ]);
  for (const relative of canonical) {
    mkdirSync(dirname(join(base, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(base, relative));
  }
  for (const directory of [
    SRC_DIR,
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
    return checkApp3G05(dir);
  } finally {
    for (const relative of touched) cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/**
 * Rewrites one `| \`Key\` | \`Value\` |` row's value **inside §6.11.1 only**.
 *
 * Scoped rather than global because §6.10.1 (P01) and §6.11.1 (G05) are two
 * fact tables in one file, and a first-match replace silently edits the wrong
 * one — which is how a "this fails when I break it" test can pass while proving
 * nothing. Found the hard way on `Quantization authority`, which existed in
 * both tables; the G05 key was renamed as well.
 */
function retune(key, value) {
  const text = read(PHASE);
  const start = text.indexOf(FACTS_HEADING);
  assert.ok(start >= 0, `${FACTS_HEADING} not found`);
  const end = text.indexOf(RULINGS_HEADING, start);
  assert.ok(end > start, `${RULINGS_HEADING} not found after the fact table`);

  const section = text.slice(start, end);
  const pattern = new RegExp(`(\\| \`${key}\` \\| \`)[^\`]*(\`)`);
  assert.ok(pattern.test(section), `fact "${key}" not found in §6.11.1`);
  return text.slice(0, start) + section.replace(pattern, `$1${value}$2`) + text.slice(end);
}

describe('APP3-G05 — the locked authority passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3G05(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-G05 — coordinate, rotation and scale cannot drift', () => {
  it('rejects a pivot moved to the persisted top-left corner', () => {
    const failures = run({ [PHASE]: retune('Rotation pivot', 'PERSISTED_TOP_LEFT_CORNER') });
    assert.ok(mentions(failures, 'Rotation pivot'), failures.join('\n'));
  });

  it('rejects rotation redefined as anticlockwise', () => {
    const failures = run({ [PHASE]: retune('Positive rotation direction', 'ANTICLOCKWISE') });
    assert.ok(mentions(failures, 'Positive rotation direction'), failures.join('\n'));
  });

  it('rejects scale using a pivot other than rotation', () => {
    const failures = run({ [PHASE]: retune('Scale pivot', 'PERSISTED_TOP_LEFT_CORNER') });
    assert.ok(mentions(failures, 'Scale pivot'), failures.join('\n'));
  });

  it('rejects scale applied after rotation', () => {
    const failures = run({ [PHASE]: retune('Scale before rotation', 'NO') });
    assert.ok(mentions(failures, 'Scale before rotation'), failures.join('\n'));
  });

  it('rejects a y-up coordinate system', () => {
    const failures = run({ [PHASE]: retune('Positive y direction', 'UP') });
    assert.ok(mentions(failures, 'Positive y direction'), failures.join('\n'));
  });

  it('rejects a centre-origin coordinate system', () => {
    const failures = run({ [PHASE]: retune('Coordinate origin', 'CENTRE') });
    assert.ok(mentions(failures, 'Coordinate origin'), failures.join('\n'));
  });
});

describe('APP3-G05 — the matrix contract cannot drift', () => {
  it('rejects a reversed local matrix order', () => {
    const reversed =
      'T(x + width/2, y + height/2) x S(scaleX, scaleY) x R(rotationDeg) x T(-width/2, -height/2)';
    const failures = run({ [PHASE]: retune('Local matrix order', reversed) });
    assert.ok(mentions(failures, 'Local matrix order'), failures.join('\n'));
  });

  it('rejects row-vector semantics', () => {
    const failures = run({ [PHASE]: retune('Matrix convention', 'ROW_VECTOR') });
    assert.ok(mentions(failures, 'Matrix convention'), failures.join('\n'));
  });

  it('rejects an anticlockwise rotation matrix under y-down', () => {
    const flipped = 'a = cos ; b = -sin ; c = sin ; d = cos ; e = 0 ; f = 0';
    const failures = run({ [PHASE]: retune('Clockwise rotation matrix', flipped) });
    assert.ok(mentions(failures, 'Clockwise rotation matrix'), failures.join('\n'));
  });

  it('rejects dropping the prose formula that explains the order', () => {
    const text = read(PHASE).replaceAll('Mlocal = T(x + width/2, y + height/2)', 'Mlocal = ...');
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'local matrix formula'), failures.join('\n'));
  });
});

describe('APP3-G05 — group semantics cannot drift', () => {
  it('rejects child coordinates redefined as document space', () => {
    const failures = run({ [PHASE]: retune('Child element parent frame', 'DOCUMENT_SPACE') });
    assert.ok(mentions(failures, 'Child element parent frame'), failures.join('\n'));
  });

  it('rejects child x parent composition', () => {
    const failures = run({
      [PHASE]: retune('Effective transform composition', 'CHILD_TIMES_PARENT'),
    });
    assert.ok(mentions(failures, 'Effective transform composition'), failures.join('\n'));
  });

  it('rejects partial group inheritance', () => {
    const failures = run({ [PHASE]: retune('Group transform inheritance', 'SCALE_ONLY') });
    assert.ok(mentions(failures, 'Group transform inheritance'), failures.join('\n'));
  });

  it('rejects a group pivot derived from descendant bounds', () => {
    const failures = run({ [PHASE]: retune('Group pivot from descendant bounds', 'ALLOWED') });
    assert.ok(mentions(failures, 'Group pivot from descendant bounds'), failures.join('\n'));
  });

  it('rejects the group persisted box being used as bounds', () => {
    const failures = run({ [PHASE]: retune('Group persisted box as bounds', 'ALLOWED') });
    assert.ok(mentions(failures, 'Group persisted box as bounds'), failures.join('\n'));
  });

  it('rejects P02 rebasing children automatically', () => {
    const failures = run({ [PHASE]: retune('Group child rebasing by P02', 'ALLOWED') });
    assert.ok(mentions(failures, 'Group child rebasing by P02'), failures.join('\n'));
  });
});

describe('APP3-G05 — the bounds strategy cannot drift', () => {
  it('rejects a path-accurate or renderer-specific strategy', () => {
    for (const substitute of ['PATH_ACCURATE', 'RENDERER_HIT_REGION', 'TIGHT_ROTATED_AABB']) {
      const failures = run({ [PHASE]: retune('Bounds strategy', substitute) });
      assert.ok(mentions(failures, 'Bounds strategy'), failures.join('\n'));
    }
  });

  it('rejects ellipse using a different production strategy', () => {
    const failures = run({ [PHASE]: retune('Ellipse bounds', 'TIGHT_ROTATED_ELLIPSE_AABB') });
    assert.ok(mentions(failures, 'Ellipse bounds'), failures.join('\n'));
  });

  it('rejects inventing line-cap or line-join extension', () => {
    const failures = run({ [PHASE]: retune('Line cap join extension', 'ALLOWED') });
    assert.ok(mentions(failures, 'Line cap join extension'), failures.join('\n'));
  });

  it('rejects changing the stroke expansion rule', () => {
    const failures = run({ [PHASE]: retune('Line freehand stroke expansion', 'strokeWidthPx') });
    assert.ok(mentions(failures, 'Line freehand stroke expansion'), failures.join('\n'));
  });

  it('rejects exempting hidden or locked elements from geometry', () => {
    const failures = run({ [PHASE]: retune('Hidden locked element geometry', 'EXEMPT') });
    assert.ok(mentions(failures, 'Hidden locked element geometry'), failures.join('\n'));
  });
});

describe('APP3-G05 — containment cannot drift', () => {
  it('rejects checking the untransformed box', () => {
    const failures = run({
      [PHASE]: retune('Containment strategy', 'UNTRANSFORMED_BOX_INSIDE_AREA'),
    });
    assert.ok(mentions(failures, 'Containment strategy'), failures.join('\n'));
  });

  it('rejects boundary equality becoming invalid', () => {
    const failures = run({ [PHASE]: retune('Containment boundary equality', 'INVALID') });
    assert.ok(mentions(failures, 'Containment boundary equality'), failures.join('\n'));
  });

  it('rejects out-of-bounds becoming advisory only', () => {
    const failures = run({ [PHASE]: retune('Containment enforcement', 'ADVISORY') });
    assert.ok(mentions(failures, 'Containment enforcement'), failures.join('\n'));
  });

  it('rejects clamping, snapping or any other mutation', () => {
    const failures = run({ [PHASE]: retune('Containment mutation', 'CLAMP_TO_AREA') });
    assert.ok(mentions(failures, 'Containment mutation'), failures.join('\n'));
  });

  it('rejects dropping the prose that makes enforcement blocking', () => {
    const text = read(PHASE).replaceAll(
      'must treat an out-of-bounds',
      'may warn about an out-of-bounds',
    );
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'out-of-bounds as failure'), failures.join('\n'));
  });
});

describe('APP3-G05 — physical scale authority cannot drift', () => {
  it('rejects a DPI-derived scale', () => {
    for (const substitute of ['96_DPI', 'CSS_DPI', 'IMAGE_METADATA_DPI']) {
      const failures = run({ [PHASE]: retune('Px per mm authority', substitute) });
      assert.ok(mentions(failures, 'Px per mm authority'), failures.join('\n'));
    }
  });

  it('rejects an Embroidery Area derived scale', () => {
    const failures = run({ [PHASE]: retune('Area derived scale', 'ALLOWED') });
    assert.ok(mentions(failures, 'Area derived scale'), failures.join('\n'));
  });

  it('rejects averaging an inconsistent width/height ratio', () => {
    const failures = run({ [PHASE]: retune('Inconsistent axis resolution', 'AVERAGE_BOTH_AXES') });
    assert.ok(mentions(failures, 'Inconsistent axis resolution'), failures.join('\n'));
  });

  it('rejects area maxima becoming conversion authority', () => {
    const failures = run({ [PHASE]: retune('Area max mm role', 'CONVERSION_AUTHORITY') });
    assert.ok(mentions(failures, 'Area max mm role'), failures.join('\n'));
  });
});

describe('APP3-G05 — placement modes and integrity cannot drift', () => {
  it('rejects forbidding historical rendering of a retired row', () => {
    const failures = run({ [PHASE]: retune('Historical render retired placement', 'FORBIDDEN') });
    assert.ok(mentions(failures, 'Historical render retired placement'), failures.join('\n'));
  });

  it('rejects a retired row becoming selectable for new editing', () => {
    const failures = run({ [PHASE]: retune('New editing retired placement', 'SELECTABLE') });
    assert.ok(mentions(failures, 'New editing retired placement'), failures.join('\n'));
  });

  it('rejects treating retirement as deletion', () => {
    const failures = run({ [PHASE]: retune('Retirement as deletion', 'ALLOWED') });
    assert.ok(mentions(failures, 'Retirement as deletion'), failures.join('\n'));
  });

  it('rejects a semantic change that no longer needs a schema migration', () => {
    const failures = run({ [PHASE]: retune('Semantic change requirement', 'INTERNAL_REFACTOR') });
    assert.ok(mentions(failures, 'Semantic change requirement'), failures.join('\n'));
  });

  it('rejects unbinding the semantics from schemaVersion 1', () => {
    const failures = run({ [PHASE]: retune('Geometry semantics binding', 'NONE') });
    assert.ok(mentions(failures, 'Geometry semantics binding'), failures.join('\n'));
  });

  it('rejects a database contribution appearing in G05', () => {
    const failures = run({ [PHASE]: retune('G05_DB_CONTRIBUTION', 'REQUIRES_APP3_DB02') });
    assert.ok(mentions(failures, 'G05_DB_CONTRIBUTION'), failures.join('\n'));
  });

  it('rejects a second quantization precision', () => {
    const failures = run({ [PHASE]: retune('Geometry quantization authority', 'NEW_SCALE_1000') });
    assert.ok(mentions(failures, 'Geometry quantization authority'), failures.join('\n'));
  });
});

describe('APP3-G05 — the decision itself', () => {
  it('rejects a missing decision', () => {
    const text = read(REGISTER).replaceAll(`| ${DECISION_ID} |`, '| IMP-D999 |');
    const failures = run({ [REGISTER]: text });
    assert.ok(mentions(failures, 'expected exactly 1'), failures.join('\n'));
  });

  it('rejects a duplicated decision', () => {
    const lines = read(REGISTER).split('\n');
    const index = lines.findIndex((line) => line.startsWith(`| ${DECISION_ID} |`));
    lines.splice(index, 0, lines[index] ?? '');
    const failures = run({ [REGISTER]: lines.join('\n') });
    assert.ok(mentions(failures, 'expected exactly 1'), failures.join('\n'));
  });

  it('rejects an unlocked decision', () => {
    const text = read(REGISTER).replace(
      new RegExp(`(^\\| ${DECISION_ID} \\|.*)\\| LOCKED \\|$`, 'm'),
      '$1| PROPOSED |',
    );
    const failures = run({ [REGISTER]: text });
    assert.ok(mentions(failures, 'not LOCKED'), failures.join('\n'));
  });

  it('rejects a ruling missing from the register row', () => {
    const failures = run({ [REGISTER]: read(REGISTER).replaceAll('**(PO-07)', '**(PO-77)') });
    assert.ok(mentions(failures, 'does not record ruling PO-07'), failures.join('\n'));
  });

  it('rejects a ruling missing from the phase section', () => {
    const failures = run({ [PHASE]: read(PHASE).replaceAll('**PO-06 —', '**PO-66 —') });
    assert.ok(mentions(failures, 'does not record ruling PO-06'), failures.join('\n'));
  });
});

describe('APP3-G05 — the checkpoint implements no geometry', () => {
  it('rejects geometry shipped under cover of the decision', () => {
    const failures = run({ [ENGINE]: 'export function rotate() {\n  return 1;\n}\n' });
    assert.ok(mentions(failures, 'no longer an empty stub'), failures.join('\n'));
  });

  it('rejects a phase plan that does not block APP3-P02', () => {
    const text = read(PHASE).replaceAll('BLOCKED_BY_APP3-G05_REVIEW_ACCEPTANCE', 'READY');
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'block APP3-P02'), failures.join('\n'));
  });

  it('rejects a phase plan that marks APP3-P02 complete', () => {
    const text = read(PHASE).replace(
      'APP3-P02 = BLOCKED_BY_APP3-G05_REVIEW_ACCEPTANCE',
      'APP3-P02 = COMPLETE — REVIEW_DELIVERED',
    );
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'marks APP3-P02 complete'), failures.join('\n'));
  });

  it('rejects forgetting why the first APP3-P02 attempt failed', () => {
    const text = read(PHASE).replaceAll(
      'GEOMETRY_SEMANTICS_NOT_AUTHORIZED_AND_SPIKE_DIVERGENT',
      'NONE',
    );
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'failed APP3-P02 first attempt'), failures.join('\n'));
  });

  it('rejects promoting the spike adapters to production authority', () => {
    const text = read(PHASE).replaceAll(
      'COMPARATIVE_RESEARCH_NOT_PRODUCTION_AUTHORITY',
      'PRODUCTION_AUTHORITY',
    );
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'research evidence'), failures.join('\n'));
  });

  it('reports an entry-authority regression from the gates it chains', () => {
    const failures = run({ [`${SRC_DIR}/index.ts`]: 'export {};\n' });
    assert.ok(mentions(failures, 'APP3-P01 regression'), failures.join('\n'));
  });
});
