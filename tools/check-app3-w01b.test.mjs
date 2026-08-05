/**
 * Regressions for the `APP3-W01B` gate.
 *
 * Each case breaks exactly one ruled property of the Template SVG consumer in a
 * throwaway copy of the repository and proves the checker refuses it. The cases
 * worth reading twice are the ones a later edit would make for convenience and
 * that still compile: an element added to the allowlist, a value accepted that
 * the grammar refused, `DOMPurify.removed` consulted instead of the repository's
 * own validation, the second pass dropped because it "always matches", or a
 * newer jsdom pinned that the locked container cannot start. None of those fail
 * loudly at runtime — the last one fails only inside the image — which is why
 * the gate has to assert them.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES as B01_FILES } from './check-app3-b01.mjs';
import { CANONICAL_FILES as B01N_FILES } from './check-app3-b01n.mjs';
import { CANONICAL_FILES as DB01_FILES } from './check-app3-db01.mjs';
import { CANONICAL_FILES as G01_FILES } from './check-app3-g01.mjs';
import { CANONICAL_FILES as G02_FILES } from './check-app3-g02.mjs';
import { CANONICAL_FILES as G03_FILES } from './check-app3-g03.mjs';
import { CANONICAL_FILES as G04_FILES } from './check-app3-g04.mjs';
import { CANONICAL_FILES as G05_FILES } from './check-app3-g05.mjs';
import { CANONICAL_FILES as G06_FILES } from './check-app3-g06.mjs';
import { CANONICAL_FILES as G07_FILES } from './check-app3-g07.mjs';
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { CANONICAL_FILES as W01A_FILES } from './check-app3-w01a.mjs';
import { CANONICAL_FILES as BOUNDARY_FILES } from './check-app3-w01b-boundaries.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, EXACT_PINS, REPO_ROOT, checkApp3W01B } from './check-app3-w01b.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-W01B` chains W01A and G07, and W01A chains G06 → B01 → P02 → G05 → P01 →
 * F01/DB01 → G04 → G03 → G02 → G01, so the root needs every canonical file those
 * gates read plus real `.git` history for G01's chronology half. `node_modules`
 * is **not** copied: the engines check reads it from the real repository, and
 * copying a dependency tree per test run would cost more than the whole suite.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-w01b-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(BOUNDARY_FILES),
    ...Object.values(W01A_FILES),
    ...Object.values(G07_FILES),
    ...Object.values(G06_FILES),
    ...Object.values(B01_FILES),
    ...Object.values(B01N_FILES),
    ...Object.values(P02_FILES),
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
    'apps/api/src',
    'apps/worker/src',
    'apps/worker/test',
    'packages/design-engine/src',
    'packages/domain-types/src',
    DOCUMENT_SRC,
    'packages/database/migrations',
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
    return checkApp3W01B(dir);
  } finally {
    for (const relative of touched) {
      try {
        cpSync(join(REPO_ROOT, relative), join(dir, relative));
      } catch {
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const file = (key) => read(CANONICAL_FILES[key]);
const boundaryFile = (key) => read(BOUNDARY_FILES[key]);
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** The worker manifest with one dependency changed or added. */
function manifestWith(changes) {
  const manifest = JSON.parse(file('workerManifest'));
  manifest.dependencies = { ...manifest.dependencies, ...changes };
  return `${JSON.stringify(manifest, undefined, 2)}\n`;
}

describe('APP3-W01B — the delivered consumer passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3W01B(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-W01B — the dependencies are exactly what IMP-D047 selected', () => {
  it('rejects a caret range on the sanitizer', () => {
    const failures = run({
      [CANONICAL_FILES.workerManifest]: manifestWith({ dompurify: '^3.4.13' }),
    });
    assert.ok(mentions(failures, 'IMP-D047 pins exactly'), failures.join('\n'));
  });

  it('rejects a tilde range on the DOM', () => {
    const failures = run({
      [CANONICAL_FILES.workerManifest]: manifestWith({ jsdom: '~29.1.1' }),
    });
    assert.ok(mentions(failures, 'IMP-D047 pins exactly'), failures.join('\n'));
  });

  it('rejects "latest" and a wildcard', () => {
    for (const specifier of ['latest', '*', '29.x']) {
      const failures = run({
        [CANONICAL_FILES.workerManifest]: manifestWith({ jsdom: specifier }),
      });
      assert.ok(
        mentions(failures, 'IMP-D047 pins exactly'),
        `${specifier}: ${failures.join('\n')}`,
      );
    }
  });

  it('rejects dropping either dependency', () => {
    const manifest = JSON.parse(file('workerManifest'));
    delete manifest.dependencies.dompurify;
    const failures = run({
      [CANONICAL_FILES.workerManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'does not depend on "dompurify"'), failures.join('\n'));
  });

  for (const refused of [
    'isomorphic-dompurify',
    'happy-dom',
    'svgo',
    'sanitize-svg',
    'puppeteer',
  ]) {
    it(`rejects "${refused}", which IMP-D047 refused`, () => {
      const failures = run({
        [CANONICAL_FILES.workerManifest]: manifestWith({ [refused]: '1.0.0' }),
      });
      assert.ok(mentions(failures, `gained "${refused}"`), failures.join('\n'));
    });
  }

  it('rejects a jsdom the locked container Node cannot start', () => {
    // The finding that decided IMP-D047. jsdom 30 declares `^22.22.2`, which
    // `node:22.14.0-alpine` does not satisfy — it compiles, passes every local
    // test and dies at container start. The engines comparison is the only
    // place that is visible without running a container.
    const dir = baseRoot();
    const modules = join(dir, 'node_modules', 'jsdom');
    mkdirSync(modules, { recursive: true });
    writeFileSync(
      join(modules, 'package.json'),
      JSON.stringify({ name: 'jsdom', engines: { node: '^22.22.2 || >=24.15.0' } }),
      'utf8',
    );
    try {
      const failures = checkApp3W01B(dir);
      assert.ok(mentions(failures, 'engines.node does not admit'), failures.join('\n'));
    } finally {
      rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
    }
  });

  it('accepts the pinned jsdom against the locked Node, so the check is not vacuous', () => {
    const dir = baseRoot();
    const modules = join(dir, 'node_modules', 'jsdom');
    mkdirSync(modules, { recursive: true });
    writeFileSync(
      join(modules, 'package.json'),
      JSON.stringify({ name: 'jsdom', engines: { node: '^20.19.0 || ^22.13.0 || >=24.0.0' } }),
      'utf8',
    );
    try {
      assert.ok(!mentions(checkApp3W01B(dir), 'engines.node does not admit'));
    } finally {
      rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
    }
  });

  it('rejects a sanitizer held by any package other than the worker', () => {
    const other = JSON.parse(read('packages/object-storage/package.json'));
    other.dependencies = { ...other.dependencies, jsdom: EXACT_PINS.jsdom };
    const failures = run({
      'packages/object-storage/package.json': `${JSON.stringify(other, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'only the worker may hold'), failures.join('\n'));
  });
});

describe('APP3-W01B — the policy version cannot drift', () => {
  it('rejects a second literal version beside the event’s', () => {
    const failures = run({
      [CANONICAL_FILES.svgPolicy]: file('svgPolicy').replace(
        'TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = NORMALIZATION_POLICY_VERSION',
        'TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = 1',
      ),
    });
    assert.ok(mentions(failures, 'a second literal that can drift'), failures.join('\n'));
  });

  it('rejects accepting an unsupported policy version', () => {
    const failures = run({
      [CANONICAL_FILES.service]: file('service').replace(
        'requested !== TEMPLATE_SVG_SANITIZATION_POLICY_VERSION',
        'requested < 0',
      ),
    });
    assert.ok(
      mentions(failures, 'an unsupported policy version is not refused'),
      failures.join('\n'),
    );
  });

  it('rejects asserting the version after the claim', () => {
    // Reading bytes and taking the row for rules this build cannot run is
    // exactly what asserting first prevents.
    const usecase = file('usecase');
    const moved = usecase
      .replace(/\n\s*this\.templateSvg\.assertPolicyVersion\([^)]*\);/, '')
      .replace(
        'if (prepared.kind === ',
        'this.templateSvg.assertPolicyVersion(payload.normalizationPolicyVersion);\n    if (prepared.kind === ',
      );
    const failures = run({ [CANONICAL_FILES.usecase]: moved });
    assert.ok(mentions(failures, 'not asserted before the claim'), failures.join('\n'));
  });
});

describe('APP3-W01B — parsing is strict and the window cannot leak', () => {
  it('rejects HTML parsing instead of strict XML', () => {
    const failures = run({
      // `replaceAll`: the first occurrence is in the doc comment, which the
      // checker strips before scanning, so a single replace changes nothing.
      [CANONICAL_FILES.jsdomParser]: file('jsdomParser').replaceAll(
        "'image/svg+xml'",
        "'text/html'",
      ),
    });
    assert.ok(mentions(failures, 'strict XML content type'), failures.join('\n'));
  });

  for (const option of ['runScripts', 'resources', 'virtualConsole']) {
    it(`rejects passing "${option}" to jsdom`, () => {
      const failures = run({
        [CANONICAL_FILES.jsdomParser]: file('jsdomParser').replace(
          'contentType: SVG_CONTENT_TYPE',
          `contentType: SVG_CONTENT_TYPE, ${option}: 'dangerously'`,
        ),
      });
      assert.ok(mentions(failures, `passes "${option}"`), failures.join('\n'));
    });
  }

  it('rejects a window that is not closed on every path', () => {
    const failures = run({
      [CANONICAL_FILES.purifier]: file('purifier').replace(
        /\} finally \{\n\s*dom\.window\.close\(\);\n\s*\}/,
        '}',
      ),
    });
    assert.ok(mentions(failures, 'does not close its window'), failures.join('\n'));
  });

  it('rejects a window or DOMPurify instance shared between jobs', () => {
    const failures = run({
      [CANONICAL_FILES.purifier]: file('purifier').replace(
        'export function withSanitizedSvgRoot',
        "const shared = new JSDOM('');\nexport function withSanitizedSvgRoot",
      ),
    });
    assert.ok(mentions(failures, 'shares a window'), failures.join('\n'));
  });
});

describe('APP3-W01B — the boundaries it must not cross', () => {
  it('rejects a second handler or event type', () => {
    const failures = run({
      [BOUNDARY_FILES.handler]: `${boundaryFile('handler')}\nexport class TemplateSvgHandler {}\n`,
    });
    assert.ok(mentions(failures, 'a second handler or event'), failures.join('\n'));
  });

  it('rejects the SVG lane opening its own transaction', () => {
    const failures = run({
      [BOUNDARY_FILES.service]: `${boundaryFile('service')}\nconst _own = 'runInTransaction';\n`,
    });
    assert.ok(mentions(failures, 'calls "runInTransaction"'), failures.join('\n'));
  });

  it('rejects the SVG lane writing its own row', () => {
    const failures = run({
      [BOUNDARY_FILES.service]: `${boundaryFile('service')}\nconst _own = 'finalizeReady';\n`,
    });
    assert.ok(mentions(failures, 'calls "finalizeReady"'), failures.join('\n'));
  });

  it('rejects a scheduler introduced by the SVG lane', () => {
    const failures = run({
      [BOUNDARY_FILES.service]: `${boundaryFile('service')}\nconst _tick = setInterval;\n`,
    });
    assert.ok(mentions(failures, 'introduces a scheduler'), failures.join('\n'));
  });

  it('rejects a raster decoder reachable from markup', () => {
    const failures = run({
      [BOUNDARY_FILES.service]: `${boundaryFile('service')}\nimport sharp from 'sharp';\n`,
    });
    assert.ok(mentions(failures, 'reaches a raster decoder'), failures.join('\n'));
  });

  it('rejects the sanitizer reachable from the raster lane', () => {
    const failures = run({
      [BOUNDARY_FILES.derivative]: `${boundaryFile('derivative')}\nimport { JSDOM } from 'jsdom';\n`,
    });
    assert.ok(mentions(failures, 'raster lane reaches the sanitizer'), failures.join('\n'));
  });

  it('rejects widening SVG beyond the Template profile', () => {
    const failures = run({
      [BOUNDARY_FILES.derivative]: boundaryFile('derivative').replace(
        "profile !== 'TEMPLATE_ASSET'",
        'false',
      ),
    });
    assert.ok(mentions(failures, 'not restricted to the Template profile'), failures.join('\n'));
  });

  it('rejects a raster policy change', () => {
    const failures = run({
      [BOUNDARY_FILES.policy]: boundaryFile('policy').replace('quality: 82', 'quality: 90'),
    });
    assert.ok(mentions(failures, 'the raster encoder quality'), failures.join('\n'));
  });

  it('rejects a new derivative kind', () => {
    const failures = run({
      [BOUNDARY_FILES.derivativeSchema]: `${boundaryFile('derivativeSchema')}\nconst _kind = 'SANITIZED';\n`,
    });
    assert.ok(mentions(failures, 'a new derivative kind'), failures.join('\n'));
  });

  it('rejects a policy column on the derivative table', () => {
    const failures = run({
      [BOUNDARY_FILES.derivativeSchema]: `${boundaryFile('derivativeSchema')}\nconst _c = 'sanitization';\n`,
    });
    assert.ok(mentions(failures, 'the policy is worker-owned'), failures.join('\n'));
  });

  it('rejects a migration added by this checkpoint', () => {
    const failures = run({ 'packages/database/migrations/9999_w01b.sql': 'select 1;\n' });
    assert.ok(mentions(failures, 'APP3-W01B adds none'), failures.join('\n'));
  });

  it('rejects publishing an HTTP surface for it', () => {
    const document = JSON.parse(boundaryFile('openapi'));
    document.paths = { ...document.paths, '/templates/{id}/svg': {} };
    const failures = run({ [BOUNDARY_FILES.openapi]: JSON.stringify(document) });
    assert.ok(mentions(failures, 'publishes no HTTP surface'), failures.join('\n'));
  });

  it('rejects a new root script', () => {
    const manifest = JSON.parse(boundaryFile('rootManifest'));
    manifest.scripts = { ...manifest.scripts, 'check:app3-w01b': 'node tools/check-app3-w01b.mjs' };
    const failures = run({
      [BOUNDARY_FILES.rootManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixes it at 30'), failures.join('\n'));
  });

  it('rejects closing the open platform follow-up', () => {
    const failures = run({
      [BOUNDARY_FILES.phase]: boundaryFile('phase').replace(
        /FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_[A-Z_]+/,
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = CLOSED',
      ),
    });
    assert.ok(mentions(failures, 'follow-up was closed'), failures.join('\n'));
  });

  it('rejects the staged capability outcome surviving its replacement', () => {
    const failures = run({
      [BOUNDARY_FILES.outcome]: `${boundaryFile('outcome')}\nconst _old = 'TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE';\n`,
    });
    assert.ok(mentions(failures, 'staged capability outcome survived'), failures.join('\n'));
  });

  it('rejects a command that is not in the scoped index', () => {
    const failures = run({
      [BOUNDARY_FILES.commandIndex]: boundaryFile('commandIndex').replace(
        'CMD-TEST-APP3-W01B-DETERMINISM',
        'CMD-TEST-APP3-W01B-REMOVED',
      ),
    });
    assert.ok(mentions(failures, 'CMD-TEST-APP3-W01B-DETERMINISM is not'), failures.join('\n'));
  });
});
