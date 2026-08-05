/**
 * Regressions for the `APP3-G07` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The cases worth reading twice
 * are the ones that would make `APP3-W01B` *easier* to write: one allowlist
 * entry quietly dropped, `DOMPurify.removed` promoted from diagnostic to
 * decision, the fixed-point second pass deleted, SVGO readmitted "just to tidy
 * the output", a caret allowed on a version, `width_px` taken from a root
 * attribute instead of the `viewBox`. None of those look like a security change
 * in a diff, which is exactly why an authority gate has to assert them.
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
import { CANONICAL_FILES as P02_FILES } from './check-app3-p02.mjs';
import { CANONICAL_FILES as W01A_FILES } from './check-app3-w01a.mjs';
import { FONT_DIR, REQUIRED_FILES } from './check-app3-f01-font-assets.mjs';
import { PACKAGE_DIR as DOCUMENT_PACKAGE, SRC_DIR as DOCUMENT_SRC } from './check-app3-p01.mjs';
import { CANONICAL_FILES, DECISION_ID, REPO_ROOT, checkApp3G07 } from './check-app3-g07.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/**
 * One throwaway root, built once and restored between cases.
 *
 * `APP3-G07` chains `APP3-B01N`, which chains W01A → G06 → B01 → P02 → G05 →
 * P01 → F01/DB01 → G04 → G03 → G02 → G01, so the root needs every canonical file
 * those gates read plus real `.git` history for G01's chronology half. The
 * application source trees, the shared contract and the generated client are
 * copied because the no-implementation walk, the cross-import walk and the tree
 * hash read them: without them several checks would pass vacuously.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-g07-'));
  temporaries.push(base);

  const canonical = new Set([
    ...Object.values(CANONICAL_FILES),
    ...Object.values(B01N_FILES),
    ...Object.values(W01A_FILES),
    ...Object.values(G06_FILES),
    ...Object.values(B01_FILES),
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
    'packages/design-engine/src',
    'packages/domain-types/src',
    'packages/api-client/src/generated',
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
    return checkApp3G07(dir);
  } finally {
    for (const relative of touched) {
      try {
        cpSync(join(REPO_ROOT, relative), join(dir, relative));
      } catch {
        // The case created a file the repository does not have; remove it.
        rmSync(join(dir, relative), { force: true });
      }
    }
  }
}

const read = (relative) => readFileSync(join(REPO_ROOT, relative), 'utf8');
const file = (key) => read(CANONICAL_FILES[key]);
const phase = () => file('phase');
const mentions = (failures, needle) => failures.some((line) => line.includes(needle));

/** Rewrites one line of the §6.17.1 fact table. */
const withFact = (key, value) =>
  phase().replace(new RegExp(`\\| \`${key}\` \\| \`[^\`]+\` \\|`), `| \`${key}\` | \`${value}\` |`);

/**
 * Rewrites inside one §6.17.x body only.
 *
 * Scoping matters: several of these terms — `ellipse`, `data:`, `DOM-clobbering`
 * — also appear in earlier APP3 sections and in the corpus, and a whole-file
 * replace would edit the wrong one and let the case pass for the wrong reason.
 */
function withinSection(heading, next, pattern, replacement) {
  const text = phase();
  const start = text.indexOf(heading);
  const end = text.indexOf(next);
  return (
    text.slice(0, start) + text.slice(start, end).replace(pattern, replacement) + text.slice(end)
  );
}

const withinRulings = (pattern, replacement) =>
  withinSection('### 6.17.2 ', '### 6.17.3 ', pattern, replacement);
const withinCorpus = (pattern, replacement) =>
  withinSection('### 6.17.3 ', '### 6.17.4 ', pattern, replacement);

describe('APP3-G07 — the delivered authority passes', () => {
  it('accepts the committed repository', () => {
    assert.deepEqual(checkApp3G07(REPO_ROOT), []);
  });

  it('accepts the throwaway copy, so later failures are the edit', () => {
    assert.deepEqual(run(), []);
  });
});

describe('APP3-G07 — the decision itself', () => {
  it('rejects a missing decision', () => {
    const failures = run({
      [CANONICAL_FILES.register]: file('register')
        .split('\n')
        .filter((line) => !line.startsWith(`| ${DECISION_ID} |`))
        .join('\n'),
    });
    assert.ok(mentions(failures, `${DECISION_ID} is missing`), failures.join('\n'));
  });

  it('rejects a decision that is not LOCKED', () => {
    const failures = run({
      [CANONICAL_FILES.register]: file('register').replace(
        new RegExp(`(\\| ${DECISION_ID} \\|[\\s\\S]*?)\\| LOCKED \\|`),
        '$1| PROPOSED |',
      ),
    });
    assert.ok(mentions(failures, 'is not LOCKED'), failures.join('\n'));
  });

  it('rejects a decision missing one of the fifteen rulings', () => {
    const failures = run({
      // Scoped to this decision's row: IMP-D046 also has a PO-12.
      [CANONICAL_FILES.register]: file('register')
        .split('\n')
        .map((line) =>
          line.startsWith(`| ${DECISION_ID} |`) ? line.replace('(PO-12)', '(PO-12x)') : line,
        )
        .join('\n'),
    });
    assert.ok(mentions(failures, 'does not record ruling PO-12'), failures.join('\n'));
  });

  it('rejects a decision that does not carry the exact versions', () => {
    // A decision naming "DOMPurify" without a version is not a lock; the whole
    // point is that W01B cannot pick a different one and still be compliant.
    const failures = run({
      [CANONICAL_FILES.register]: file('register').replaceAll('dompurify@3.4.13', 'dompurify'),
    });
    assert.ok(mentions(failures, 'the exact sanitizer version'), failures.join('\n'));
  });

  it('rejects a decision without the runtime it was checked against', () => {
    const failures = run({
      [CANONICAL_FILES.register]: file('register').replaceAll('22.14.0', 'the container runtime'),
    });
    assert.ok(mentions(failures, 'the locked runtime version'), failures.join('\n'));
  });

  it('rejects a decision without the license evidence', () => {
    const failures = run({
      [CANONICAL_FILES.register]: file('register').replaceAll(
        'MPL-2.0 OR Apache-2.0',
        'a permissive license',
      ),
    });
    assert.ok(mentions(failures, "the sanitizer's license"), failures.join('\n'));
  });
});

describe('APP3-G07 — the fact and dependency tables', () => {
  it('rejects a drifted sanitizer version', () => {
    const failures = run({ [CANONICAL_FILES.phase]: withFact('Sanitizer version', '3.4.12') });
    assert.ok(mentions(failures, '"Sanitizer version" is "3.4.12"'), failures.join('\n'));
  });

  it('rejects claiming the newest jsdom is usable', () => {
    // The one measured fact that decided the pin. Flipping it would let a later
    // checkpoint bump jsdom into a version the runtime cannot start.
    const failures = run({ [CANONICAL_FILES.phase]: withFact('Latest jsdom usable', 'YES') });
    assert.ok(mentions(failures, '"Latest jsdom usable" is "YES"'), failures.join('\n'));
  });

  it('rejects a floated version range form', () => {
    const failures = run({ [CANONICAL_FILES.phase]: withFact('Version range form', 'CARET') });
    assert.ok(mentions(failures, '"Version range form" is "CARET"'), failures.join('\n'));
  });

  it('rejects readmitting SVGO', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withFact('SVGO role', 'RUNS_AFTER_SANITIZATION'),
    });
    assert.ok(mentions(failures, '"SVGO role"'), failures.join('\n'));
  });

  it('rejects persisting the policy in the database', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withFact('Sanitization policy persistence', 'DERIVATIVE_COLUMN'),
    });
    assert.ok(mentions(failures, '"Sanitization policy persistence"'), failures.join('\n'));
  });

  it('rejects a path parser dependency', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withFact('Path parser dependency', 'svg-path-parser'),
    });
    assert.ok(mentions(failures, '"Path parser dependency"'), failures.join('\n'));
  });

  it('rejects declaring W01B ready before human acceptance', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '| `APP3-W01B` | whole checkpoint, post-G07 | `BLOCKED_BY_APP3-G07_REVIEW_ACCEPTANCE` |',
        '| `APP3-W01B` | whole checkpoint, post-G07 | `READY — NOT STARTED` |',
      ),
    });
    assert.ok(mentions(failures, 'APP3-W01B :: whole checkpoint, post-G07'), failures.join('\n'));
  });
});

describe('APP3-G07 — the allowlists', () => {
  it('rejects dropping an allowed element', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withinRulings(/`ellipse`,\s+`line`/, '`line`'),
    });
    assert.ok(mentions(failures, 'does not allow the element "ellipse"'), failures.join('\n'));
  });

  it('rejects dropping an allowed attribute', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('`stroke-miterlimit`', '`stroke-mitre`'),
    });
    assert.ok(mentions(failures, 'the attribute "stroke-miterlimit"'), failures.join('\n'));
  });

  it('rejects losing the foreignObject refusal', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('`foreignObject`', 'embedded markup'),
    });
    assert.ok(mentions(failures, 'does not reject "foreignObject"'), failures.join('\n'));
  });

  it('rejects losing the id refusal and its DOM-clobbering rationale', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withinRulings(
        /Rejecting `id` is also the\s+DOM-clobbering defence\./,
        '',
      ),
    });
    assert.ok(mentions(failures, 'DOM clobbering'), failures.join('\n'));
  });
});

describe('APP3-G07 — URLs, values, transforms and paths', () => {
  it('rejects readmitting data: URLs', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withinRulings(/`data:`,\s+`blob:`/, '`blob:`'),
    });
    assert.ok(mentions(failures, 'does not reject "data:"'), failures.join('\n'));
  });

  it('rejects losing the currentColor refusal', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('currentColor', 'inherited paint'),
    });
    assert.ok(mentions(failures, 'the `currentColor` refusal'), failures.join('\n'));
  });

  it('rejects losing the NaN and Infinity refusal', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('`NaN`', '`not-a-number`'),
    });
    assert.ok(mentions(failures, 'the NaN refusal'), failures.join('\n'));
  });

  it('rejects a permissive path regex', () => {
    // The single most tempting shortcut in the whole checkpoint.
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'a permissive character regex is\nforbidden',
        'a character-class regex is sufficient',
      ),
    });
    assert.ok(mentions(failures, 'the regex-path refusal'), failures.join('\n'));
  });

  it('rejects dropping a transform function from the allowlist', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll('`skewY(angle)`', 'no skew on the Y axis'),
    });
    assert.ok(mentions(failures, 'the transform "skewY"'), failures.join('\n'));
  });

  it('rejects deriving width_px from anything but the viewBox', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll(
        '`width_px = viewBox width`',
        '`width_px = root width attribute`',
      ),
    });
    assert.ok(mentions(failures, 'the viewBox-derived width'), failures.join('\n'));
  });

  it('rejects loosening a complexity limit', () => {
    const failures = run({ [CANONICAL_FILES.phase]: phase().replaceAll('10,000', '100,000') });
    assert.ok(mentions(failures, 'the node limit'), failures.join('\n'));
  });

  it('rejects truncating into compliance', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'Nothing is ever truncated into compliance.',
        'Oversized documents are trimmed to the limit.',
      ),
    });
    assert.ok(mentions(failures, 'the no-truncation rule'), failures.join('\n'));
  });
});

describe('APP3-G07 — the pipeline and the output', () => {
  it('rejects losing a pipeline step', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace('(9) reparse, revalidate and sanitize again;', ''),
    });
    assert.ok(mentions(failures, 'pipeline step 9 is missing'), failures.join('\n'));
  });

  it('rejects losing the fixed point', () => {
    // Without it, "reject on any structural removal" is unenforceable: nothing
    // proves the canonical form is itself already sanitized.
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        '(11) require the\nsecond bytes to equal the first;',
        '',
      ),
    });
    assert.ok(mentions(failures, 'the fixed-point equality'), failures.join('\n'));
  });

  it('rejects allowing a post-final-pass optimizer', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'No\nmutation and no optimizer after the final pass.',
        'An optimizer may run after the final pass.',
      ),
    });
    assert.ok(mentions(failures, 'the no-post-mutation rule'), failures.join('\n'));
  });

  it('rejects promoting DOMPurify.removed to the security decision', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        /`DOMPurify\.removed` is \*\*diagnostic only\*\*/,
        '`DOMPurify.removed` decides acceptance',
      ),
    });
    assert.ok(mentions(failures, 'never the security decision'), failures.join('\n'));
  });

  it('rejects silent removal instead of whole-file rejection', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replaceAll(
        'UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG',
        'SVG_PARTIALLY_SANITIZED',
      ),
    });
    assert.ok(mentions(failures, 'the whole-file rejection outcome'), failures.join('\n'));
  });

  it('rejects losing the delivery boundary', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'A sanitized Template SVG\nremains private, unwatermarked',
        'A sanitized Template SVG may be served publicly, unwatermarked',
      ),
    });
    assert.ok(mentions(failures, 'the delivery boundary'), failures.join('\n'));
  });
});

describe('APP3-G07 — nothing was installed and nothing was implemented', () => {
  /**
   * Mode-aware since `APP3-W01B`. Every case here restores the pre-W01B world by
   * removing a delivery token from the phase document, because that world is
   * where "G07 installs nothing" is the truth being asserted. Two consistent
   * worlds and no third — the half-flipped cases below prove the third is shut.
   */
  const beforeW01b = (overrides = {}) => ({
    [CANONICAL_FILES.phase]: phase().replace('APP3-W01B = COMPLETE', 'APP3-W01B = READY'),
    ...overrides,
  });

  it('rejects installing the sanitizer here', () => {
    const manifest = JSON.parse(file('workerManifest'));
    manifest.dependencies = { ...manifest.dependencies, dompurify: '3.4.13' };
    const failures = run(
      beforeW01b({
        [CANONICAL_FILES.workerManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
      }),
    );
    assert.ok(mentions(failures, 'APP3-G07 installs nothing'), failures.join('\n'));
  });

  it('rejects implementing the sanitizer here', () => {
    const failures = run(
      beforeW01b({
        'apps/worker/src/jobs/asset-normalization/application/svg-sanitizer.ts':
          "import { JSDOM } from 'jsdom';\nexport const window = new JSDOM('').window;\n",
      }),
    );
    assert.ok(mentions(failures, "that is APP3-W01B's"), failures.join('\n'));
  });

  it('rejects implementing the policy version here', () => {
    const failures = run(
      beforeW01b({
        'apps/worker/src/jobs/asset-normalization/domain/svg-policy.ts':
          'export const TEMPLATE_SVG_SANITIZATION_POLICY_VERSION = 1;\n',
      }),
    );
    assert.ok(mentions(failures, 'implements the sanitization policy'), failures.join('\n'));
  });

  it('rejects removing the staged refusal without implementing anything', () => {
    const staged = W01A_FILES.derivative;
    const failures = run(
      beforeW01b({
        [staged]: read(staged).replaceAll(
          'TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE',
          'SOURCE_MEDIA_TYPE_NOT_SUPPORTED',
        ),
      }),
    );
    assert.ok(mentions(failures, 'the staged Template SVG refusal is gone'), failures.join('\n'));
  });

  it('accepts the delivered sanitizer once APP3-W01B is complete', () => {
    // The second world. The real tree already installs and implements both
    // packages, so an empty override is the assertion.
    const failures = run({});
    assert.ok(!mentions(failures, 'installs nothing'), failures.join('\n'));
    assert.ok(!mentions(failures, "that is APP3-W01B's"), failures.join('\n'));
  });

  it('refuses a half-flipped world: W01B complete but IMP-D047 unlocked', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace('IMP-D047 = LOCKED', 'IMP-D047 = PROPOSED'),
    });
    assert.ok(mentions(failures, 'installs nothing'), failures.join('\n'));
  });

  it('rejects a policy column on the derivative table', () => {
    const failures = run({
      [CANONICAL_FILES.derivativeSchema]: `${file('derivativeSchema')}\nconst _column = 'sanitization_policy';\n`,
    });
    assert.ok(mentions(failures, 'the policy is worker-owned'), failures.join('\n'));
  });

  it('rejects a migration added by this gate', () => {
    const failures = run({
      'packages/database/migrations/9999_g07_regression.sql': 'select 1;\n',
    });
    assert.ok(mentions(failures, 'APP3-G07 adds none'), failures.join('\n'));
  });
});

describe('APP3-G07 — governance', () => {
  it('rejects a root script added for the new gate', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts = { ...manifest.scripts, 'check:app3-g07': 'node tools/check-app3-g07.mjs' };
    const failures = run({
      [CANONICAL_FILES.rootManifest]: `${JSON.stringify(manifest, undefined, 2)}\n`,
    });
    assert.ok(mentions(failures, 'GOV-Q01 fixed it at 30'), failures.join('\n'));
  });

  it('rejects unindexed checkpoint commands', () => {
    const failures = run({
      [CANONICAL_FILES.commandIndex]: file('commandIndex')
        .split('\n')
        .filter((line) => !line.includes('CMD-CHECK-APP3-G07'))
        .join('\n'),
    });
    assert.ok(mentions(failures, 'does not index CMD-CHECK-APP3-G07'), failures.join('\n'));
  });

  it('rejects a security document that does not record the authority', () => {
    const failures = run({
      [CANONICAL_FILES.security]: file('security').replaceAll(DECISION_ID, 'a future decision'),
    });
    assert.ok(mentions(failures, 'does not record the sanitizer authority'), failures.join('\n'));
  });

  it('rejects declaring Template SVG available before W01B', () => {
    const failures = run({
      [CANONICAL_FILES.security]: file('security').replace(
        '**authorized but operationally unavailable**',
        '**available**',
      ),
    });
    assert.ok(mentions(failures, 'no longer recorded as unavailable'), failures.join('\n'));
  });

  it('rejects quietly closing the platform Zod/OpenAPI follow-up', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: phase().replace(
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = CLOSED',
      ),
    });
    assert.ok(mentions(failures, 'no longer recorded as open'), failures.join('\n'));
  });

  it('rejects dropping a rejection family from the security corpus', () => {
    // A sanitizer without its regression corpus is a claim, not a control: the
    // only thing that catches a policy which quietly stopped rejecting
    // something is a fixture that used to fail.
    const failures = run({
      [CANONICAL_FILES.phase]: withinCorpus(
        /mutation-XSS and parser-differential fixtures; and/,
        '',
      ),
    });
    assert.ok(mentions(failures, '"mutation-XSS" rejection family'), failures.join('\n'));
  });

  it('rejects a corpus that does not require determinism', () => {
    const failures = run({
      [CANONICAL_FILES.phase]: withinCorpus(/byte and SHA-256 determinism/, 'plausible output'),
    });
    assert.ok(mentions(failures, 'the determinism requirement'), failures.join('\n'));
  });

  it('reports an APP3-B01N regression through the chained gate', () => {
    const failures = run({
      [B01N_FILES.intents]: read(B01N_FILES.intents).replaceAll(
        'fields.backgroundAssetId',
        'fields.name',
      ),
    });
    assert.ok(mentions(failures, 'APP3-B01N regression:'), failures.join('\n'));
  });
});
