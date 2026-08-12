/**
 * Regressions for the **world-aware evolution** of the `APP3-S02` gate.
 *
 * Split from `check-app3-s02.test.mjs` by responsibility once that file crossed
 * the repository's test-size limit: this one asks a different question. The
 * sibling asks "does the S02 gate still catch an S02 defect"; this asks "did
 * narrowing a ban for a later checkpoint open a hole in it".
 *
 * Three ways it could have. The gesture or the measurement arriving in a file
 * the later checkpoint did **not** introduce. Either arriving before that
 * checkpoint opened at all. And a design row approved ahead of the capability
 * that owns it.
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

describe('the APP3-S07 evolution did not open a hole', () => {
  it('refuses a pan gesture in a file APP3-S07 did not introduce', () => {
    const root = rootWith({
      stageScreen: file('stageScreen').replace(
        '<div className="studio-stage">',
        '<div className="studio-stage" onPointerDown={() => undefined}>',
      ),
    });
    assert.ok(
      mentions(failuresOf(checkNonScope, root), 'outside the viewport and the transform chrome'),
    );
  });

  it('refuses an element that follows the pointer, in either world', () => {
    const root = rootWith({
      stageElement: file('stageElement').replace(
        'onKeyDown={(event) => {',
        'onPointerDown={() => undefined}\n      onKeyDown={(event) => {',
      ),
    });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'APP3-S03'));
  });

  it('refuses a layout measurement outside the viewport', () => {
    const root = rootWith({
      stageScreen: `${file('stageScreen')}\nconst width = node.clientWidth;\n`,
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry from the DOM'));
  });

  it('refuses the viewport gesture arriving before APP3-S07 opened', () => {
    // The narrowing is conditional on S07 having shipped. Rewinding the phase
    // line puts the original whole-feature ban back, so a viewport built early
    // is refused by the same rule that allows it late.
    const root = rootWith({ phase: beforeS07() });
    assert.ok(
      mentions(failuresOf(checkNonScope, root), 'outside the viewport and the transform chrome'),
    );
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry from the DOM'));
  });

  it('refuses engine composition in a file APP3-S03 did not introduce', () => {
    // `composeMatrices` is the engine's own export, so it is legal *inside* the
    // transform model and nowhere else. A stage that composed its own frame
    // would agree with APP3-P02 on every fixture and diverge on the nested ones.
    const root = rootWith({
      stage: `${file('stage')}
const m = composeMatrices(a, b);
`,
    });
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry the engine owns'));
  });

  it('never allows a local rotation matrix, in any world', () => {
    // `Math.cos`/`sin`/`tan` build one, and no checkpoint may open them.
    for (const key of ['stage', 'stageScreen']) {
      const root = rootWith({
        [key]: `${file(key)}
const c = Math.cos(1);
`,
      });
      assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry the engine owns'));
    }
  });

  it('refuses the transform gesture arriving before APP3-S03 opened', () => {
    const root = rootWith({ phase: beforeS03() });
    assert.ok(mentions(failuresOf(checkNonScope, root), 'transform chrome'));
    assert.ok(mentions(failuresOf(checkGeometryAuthority, root), 'geometry from the DOM'));
  });

  it('refuses the zoom design row approved before APP3-S07 opened', () => {
    const root = rootWith({ phase: beforeS07() });
    assert.ok(mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-ZOOM-DESKTOP-FIT'));
  });

  it('still refuses every other later Studio row in the S07 world', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-WATERMARK-DESKTOP-LIGHT \|[^\n]*?)REVIEW_REQUIRED/,
      '$1APPROVED_FOR_IMPLEMENTATION',
    );
    const root = rootWith({ registry });
    assert.ok(
      mentions(failuresOf(checkDesignApproval, root), 'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT'),
    );
  });
});
