/**
 * Regressions for the `APP3-P01` gate.
 *
 * Every case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. Nothing here writes into tracked
 * authority; behaviour of the package itself is the package's own 151 unit tests.
 *
 * The cases worth reading twice are the erosion ones — a `node:crypto` import
 * added to a module three hops from the root export, a trigonometric helper that
 * quietly moves geometry out of `APP3-P02`, and a font hash edited to match a
 * different binary. All three compile, all three pass a type check, and all
 * three would ship a boundary this checkpoint was built to hold.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { G04_LIMITS, PACKAGE_DIR, REPO_ROOT, SRC_DIR, checkApp3P01 } from './check-app3-p01.mjs';

const INDEX = `${SRC_DIR}/index.ts`;
const CONSTANTS = `${SRC_DIR}/schema/constants.ts`;
const ELEMENTS = `${SRC_DIR}/schema/elements.ts`;
const QUANTIZE = `${SRC_DIR}/quantization/quantize.ts`;
const CONTEXT = `${SRC_DIR}/validation/context.ts`;
const REGISTRY = `${SRC_DIR}/fonts/registry.ts`;
const MANIFEST = `${PACKAGE_DIR}/package.json`;
const PHASE = 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * The gate chains DB01 (which chains G04 → G03 → G02 → G01), so the root needs
 * every canonical file those gates read, plus real `.git` history for the G01
 * chronology half. Rebuilding all of that per case would copy the repository
 * dozens of times; `node:test` runs subtests sequentially, so writing an edit
 * and putting the original back is safe.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-p01-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(DB01_FILES),
    ...Object.values(G01_FILES),
    ...Object.values(G02_FILES),
    ...Object.values(G03_FILES),
    ...Object.values(G04_FILES),
    ...REQUIRED_FILES.map((name) => `${FONT_DIR}/${name}`),
    `${FONT_DIR}/.gitattributes`,
    MANIFEST,
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
    if (content === null) rmSync(join(dir, relative), { force: true });
    else writeFileSync(join(dir, relative), content, 'utf8');
  }
  try {
    return checkApp3P01(dir);
  } finally {
    for (const relative of touched) {
      rmSync(join(dir, relative), { force: true });
      cpSync(join(REPO_ROOT, relative), join(dir, relative));
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

describe('APP3-P01 — the delivered package passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3P01(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-P01 — the package must actually be implemented', () => {
  it('rejects the empty stub the first attempt left behind', () => {
    const failures = run({ [INDEX]: 'export {};\n' });
    assert.ok(mentions(failures, 'still the empty stub'), failures.join('\n'));
  });

  it('rejects a manifest with no test script', () => {
    const manifest = JSON.parse(read(MANIFEST));
    delete manifest.scripts.test;
    const failures = run({ [MANIFEST]: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failures, 'no test script'), failures.join('\n'));
  });

  it('rejects a manifest with no build script', () => {
    const manifest = JSON.parse(read(MANIFEST));
    delete manifest.scripts.build;
    const failures = run({ [MANIFEST]: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failures, 'no build script'), failures.join('\n'));
  });
});

describe('APP3-P01 — the schema is v1 with five element kinds', () => {
  it('rejects a schema version other than 1', () => {
    const text = read(CONSTANTS).replace(
      'CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 1',
      'CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 2',
    );
    const failures = run({ [CONSTANTS]: text });
    assert.ok(mentions(failures, 'must be exactly 1'), failures.join('\n'));
  });

  it('rejects dropping an element kind', () => {
    const failures = run({ [ELEMENTS]: read(ELEMENTS).replaceAll("'freehand'", "'sketch'") });
    assert.ok(mentions(failures, 'does not support "freehand"'), failures.join('\n'));
  });

  it('rejects reintroducing svg as a v1 element kind', () => {
    const text = read(ELEMENTS).replace(
      "export type DesignElementType = 'text'",
      "export type DesignElementType = 'svg' | 'text'",
    );
    const failures = run({ [ELEMENTS]: text });
    assert.ok(mentions(failures, 'not a v1 element kind'), failures.join('\n'));
  });
});

describe('APP3-P01 — the complexity constants are the ruled values', () => {
  for (const [name, value] of Object.entries(G04_LIMITS)) {
    it(`rejects a raised ${name}`, () => {
      const raised = read(CONSTANTS).replace(
        new RegExp(`${name}:\\s*[0-9_]+`),
        `${name}: ${String(value * 2)}`,
      );
      const failures = run({ [CONSTANTS]: raised });
      assert.ok(mentions(failures, name), failures.join('\n'));
    });
  }
});

describe('APP3-P01 — quantization uses the one accepted precision', () => {
  it('rejects a different scale', () => {
    const text = read(QUANTIZE).replace(
      'QUANTIZATION_SCALE = 10_000',
      'QUANTIZATION_SCALE = 1_000',
    );
    const failures = run({ [QUANTIZE]: text });
    assert.ok(mentions(failures, 'quantization scale'), failures.join('\n'));
  });

  it('rejects losing the record of where the constant came from', () => {
    const failures = run({ [QUANTIZE]: read(QUANTIZE).replaceAll('APP0-R01', 'somewhere') });
    assert.ok(mentions(failures, 'APP0-R01'), failures.join('\n'));
  });

  it('rejects dropping negative-zero normalization', () => {
    const text = read(QUANTIZE).replaceAll('Object.is(rounded, -0) ? 0 : rounded', 'rounded');
    const failures = run({ [QUANTIZE]: text });
    assert.ok(mentions(failures, 'negative zero'), failures.join('\n'));
  });
});

describe('APP3-P01 — the browser/server split holds', () => {
  it('rejects a Node import reachable from the root export', () => {
    // Three hops from the root, which is exactly how this erodes in practice.
    const text = `import { createHash } from 'node:crypto';\n${read(CONTEXT)}`;
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'imports node:'), failures.join('\n'));
  });

  it('rejects re-exporting the server module from the root', () => {
    const text = `${read(INDEX)}\nexport * from './server/index';\n`;
    const failures = run({ [INDEX]: text });
    assert.ok(mentions(failures, 'reaches the server module'), failures.join('\n'));
  });

  it('rejects exposing the hash function from the root export', () => {
    const text = `${read(INDEX)}\n// hashDesignDocumentSha256\n`;
    const failures = run({ [INDEX]: text });
    assert.ok(mentions(failures, 'hashing is server-only'), failures.join('\n'));
  });

  it('rejects dropping the server subpath from the manifest', () => {
    const manifest = JSON.parse(read(MANIFEST));
    delete manifest.exports['./server'];
    const failures = run({ [MANIFEST]: JSON.stringify(manifest, null, 2) });
    assert.ok(mentions(failures, '"./server"'), failures.join('\n'));
  });

  it('rejects a forbidden framework import', () => {
    const failures = run({ [CONTEXT]: `import React from 'react';\n${read(CONTEXT)}` });
    assert.ok(mentions(failures, 'forbidden module "react"'), failures.join('\n'));
  });

  it('rejects importing the geometry package', () => {
    const text = `import { bounds } from '@embroidery/design-engine';\n${read(CONTEXT)}`;
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, '@embroidery/design-engine'), failures.join('\n'));
  });
});

describe('APP3-P01 — geometry stays in APP3-P02', () => {
  it('rejects trigonometry entering the package', () => {
    const text = `${read(CONTEXT)}\nconst _angle = Math.cos(1);\n`;
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'geometry (Math.cos)'), failures.join('\n'));
  });

  it('rejects a pixel-to-millimetre conversion', () => {
    const text = `${read(CONTEXT)}\nconst _mm = 10 / pxPerMm;\n`;
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'pixels and millimetres'), failures.join('\n'));
  });

  it('rejects an API or UI implementation', () => {
    const failures = run({ [CONTEXT]: `@Injectable()\n${read(CONTEXT)}` });
    assert.ok(mentions(failures, 'no API or UI'), failures.join('\n'));
  });
});

describe('APP3-P01 — contextual validation demands measured eligibility', () => {
  it('rejects dropping the derivative status requirement', () => {
    const text = read(CONTEXT).replaceAll('ELIGIBLE_DERIVATIVE_STATUS', 'ANY_STATUS');
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'ELIGIBLE_DERIVATIVE_STATUS'), failures.join('\n'));
  });

  it('rejects ignoring a derivative metadata column', () => {
    const failures = run({ [CONTEXT]: read(CONTEXT).replaceAll('byteSize', 'sizeBytes') });
    assert.ok(mentions(failures, 'derivative byteSize'), failures.join('\n'));
  });

  it('rejects changing the eligible kind away from NORMALIZED', () => {
    const text = read(CONSTANTS).replace(
      "ELIGIBLE_DERIVATIVE_KIND = 'NORMALIZED'",
      "ELIGIBLE_DERIVATIVE_KIND = 'THUMBNAIL'",
    );
    const failures = run({ [CONSTANTS]: text });
    assert.ok(mentions(failures, 'NORMALIZED / READY'), failures.join('\n'));
  });
});

/**
 * `APP3-P01-C1`. The decoded-pixel budget is keyed by Asset, not derivative —
 * the two only look equivalent while every Asset is placed through a single
 * derivative, and IMP-D044 PO-09 keys both the 20-Asset limit and the pixel
 * total on the Asset.
 */
describe('APP3-P01 — decoded pixels are budgeted per Asset', () => {
  const SPEC = `${SRC_DIR}/validation/context.spec.ts`;

  it('rejects a return to derivative-keyed accumulation', () => {
    const text = read(CONTEXT).replaceAll('countedAssets', 'countedDerivatives');
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'derivative-keyed'), failures.join('\n'));
  });

  it('rejects keying the accumulator on the derivative id', () => {
    const text = read(CONTEXT).replace(
      'countedAssets.get(record.assetId)',
      'countedAssets.get(record.derivativeId)',
    );
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'keyed by assetId'), failures.join('\n'));
  });

  it('rejects dropping the two-derivatives-one-Asset conflict check', () => {
    const text = read(CONTEXT).replace(
      'seen.derivativeId !== record.derivativeId',
      'seen.derivativeId === undefined',
    );
    const failures = run({ [CONTEXT]: text });
    assert.ok(mentions(failures, 'two derivative ids is not detected'), failures.join('\n'));
  });

  it('rejects losing the G04 repeated-asset ruling it restores', () => {
    const text = read(PHASE).replaceAll('ONCE_FOR_ASSET_BUDGETS_EACH_FOR_ELEMENTS', 'PER_ELEMENT');
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'repeated-asset counting ruling'), failures.join('\n'));
  });

  it('rejects rewording the G04 decoded-pixel ruling away from assets', () => {
    const text = read(PHASE).replaceAll(
      'unique referenced image assets',
      'unique referenced derivatives',
    );
    const failures = run({ [PHASE]: text });
    assert.ok(mentions(failures, 'unique referenced image assets'), failures.join('\n'));
  });

  it('rejects dropping the conflict regression from the package tests', () => {
    const text = read(SPEC).replaceAll('two different derivative ids', 'two derivatives');
    const failures = run({ [SPEC]: text });
    assert.ok(mentions(failures, 'one-Asset/two-derivatives regression'), failures.join('\n'));
  });
});

describe('APP3-P01 — the font registry stays bound to APP3-F01', () => {
  it('rejects a hash that no longer matches the committed binary', () => {
    const text = read(REGISTRY).replace(
      '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3',
      'f'.repeat(64),
    );
    const failures = run({ [REGISTRY]: text });
    assert.ok(mentions(failures, 'committed SHA-256 of InterVariable.woff2'), failures.join('\n'));
  });

  it('rejects a drifted upstream commit', () => {
    const text = read(REGISTRY).replaceAll(
      'e3a3d4c57d5ecc01453a575621882a384c1995a3',
      'a'.repeat(40),
    );
    const failures = run({ [REGISTRY]: text });
    assert.ok(mentions(failures, 'e3a3d4c'), failures.join('\n'));
  });

  it('rejects a silent fallback policy', () => {
    const text = read(REGISTRY).replaceAll(
      "fallbackPolicy: 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE'",
      "fallbackPolicy: 'SUBSTITUTE_NEAREST'",
    );
    const failures = run({ [REGISTRY]: text });
    assert.ok(mentions(failures, 'REJECT_IF_CONTROLLED_FONT_UNAVAILABLE'), failures.join('\n'));
  });

  it('rejects registering General Sans as controlled', () => {
    const text = read(REGISTRY).replace("family: 'Inter'", "family: 'General Sans'");
    const failures = run({ [REGISTRY]: text });
    assert.ok(mentions(failures, 'General Sans'), failures.join('\n'));
  });

  it('rejects a remote font URL', () => {
    // A URL in executable code, not in prose: the gate strips comments first,
    // because the header legitimately explains why no URL belongs here.
    const text = `${read(REGISTRY)}\nexport const CDN = 'https://fonts.example.test/inter.woff2';\n`;
    const failures = run({ [REGISTRY]: text });
    assert.ok(mentions(failures, 'https://'), failures.join('\n'));
  });
});

describe('APP3-P01 — entry authority stays intact', () => {
  it('reports an APP3-F01 regression', () => {
    const failures = run({ [`${FONT_DIR}/LICENSE.txt`]: 'All rights reserved.\n' });
    assert.ok(mentions(failures, 'APP3-F01 regression'), failures.join('\n'));
  });

  it('reports an APP3-DB01 regression', () => {
    const text = read(DB01_FILES.derivatives).replaceAll('width_px', 'w_px');
    const failures = run({ [DB01_FILES.derivatives]: text });
    assert.ok(mentions(failures, 'APP3-DB01 regression'), failures.join('\n'));
  });
});
