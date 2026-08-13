#!/usr/bin/env node
/**
 * `APP3-E01` — mutation tests for the cross-layer evidence gate.
 *
 * The gate's own claim is that it would notice. Each case here breaks exactly
 * one thing the gate protects, in a throwaway copy of the repository, and
 * requires the matching rule to fail — because a rule that passes on a mutated
 * tree is a rule that was reading something other than what it names. Three
 * APP3 checkpoints each shipped one of those: a slice anchored between two
 * interface declarations, a rule whose file had been split in two, and a
 * world-aware list that had emptied itself.
 *
 * Every case also asserts the gate is GREEN on the unmutated copy first, so a
 * "fails as expected" result cannot come from the copy being broken.
 *
 * Docker-free, network-free, database-free.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkApp3E01 } from './check-app3-e01.mjs';
import { CANONICAL_FILES, MIGRATIONS, REPO_ROOT, collect } from './check-app3-e01.sources.mjs';

/** Every harness file the gate reads by glob rather than by name. */
const HARNESS = collect(join(REPO_ROOT, 'tools'), /^smoke-app3-e01.*\.mjs$/).map((path) =>
  path.replaceAll('\\', '/').slice(REPO_ROOT.replaceAll('\\', '/').length + 1),
);

/**
 * A throwaway copy of exactly what the gate reads.
 *
 * Not a copy of the repository: the gate reads a named set plus two directory
 * counts, and copying the tree would make each case slow enough that nobody
 * runs them.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'app3-e01-gate-'));
  for (const relative of [...Object.values(CANONICAL_FILES), ...HARNESS]) {
    const source = join(REPO_ROOT, relative);
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  // The two directory counts, as names only: the gate counts entries.
  mkdirSync(join(root, MIGRATIONS), { recursive: true });
  for (const migration of collect(join(REPO_ROOT, MIGRATIONS), /\.sql$/)) {
    writeFileSync(join(root, MIGRATIONS, migration.split(/[\\/]/).pop()), '');
  }
  return root;
}

function failuresOf(root) {
  const failures = [];
  checkApp3E01(root, (message) => failures.push(message));
  return failures;
}

function edit(root, key, mutate) {
  const relative = CANONICAL_FILES[key] ?? key;
  const path = join(root, relative);
  writeFileSync(path, mutate(readFileSync(path, 'utf8')));
}

/**
 * One case: the gate is green, one thing breaks, the gate goes red.
 *
 * `expect` is matched against the joined failures so a case cannot pass because
 * some OTHER rule happened to fail on the mutated copy.
 */
function mutation(name, key, mutate, expect) {
  test(name, () => {
    const root = fixture();
    try {
      assert.deepEqual(failuresOf(root), [], 'the unmutated copy must be green');
      edit(root, key, mutate);
      const failures = failuresOf(root);
      assert.ok(
        failures.some((failure) => expect.test(failure)),
        `expected a failure matching ${String(expect)}, got ${JSON.stringify(failures)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('the gate passes on the repository as it stands', () => {
  assert.deepEqual(failuresOf(REPO_ROOT), []);
});

/* ---------------------------------------------------------------- the fix */

mutation(
  'the network key reverted to the client-controlled left-most entry',
  'networkKey',
  (source) => source.replace('hops[hops.length - 1]', 'hops[0]'),
  /not the entry the trusted hop wrote/,
);

mutation(
  'an empty forwarded entry is allowed to choose the bucket',
  'networkKey',
  (source) => source.replace(".filter((hop) => hop.trim() !== '')", ''),
  /empty forwarded entry can still choose/,
);

mutation(
  'the gateway stops appending, so "last hop" stops meaning anything',
  'proxyHeaders',
  (source) => source.replace('$proxy_add_x_forwarded_for', '$remote_addr'),
  /the gateway no longer appends/,
);

mutation(
  'the forged-header regression is deleted from the accepted spec',
  'networkKeySpec',
  (source) =>
    source.replace('gives a caller no way to mint a fresh bucket from its own header', 'x'),
  /forged-header regression .* is gone/,
);

/* ------------------------------------------------------- the capacity rule */

mutation(
  'the harness mints an identity with a header instead of an address',
  'orchestrator',
  (source) =>
    source.replace(
      'async function main()',
      "const forged = 'X-Forwarded-For';\nasync function main()",
    ),
  /the closed bypass/,
);

mutation(
  'the harness waits out a rate window',
  'orchestrator',
  (source) =>
    source.replace('async function main()', 'const CREATION_PAUSE = 1;\nasync function main()'),
  /waits out a rate window/,
);

mutation(
  'the identities stop being assigned addresses',
  'runners',
  (source) => source.replace("'--ip',", "'--label',"),
  /not assigned addresses/,
);

mutation(
  'the bypass is never attempted, so the fix is never attacked',
  'security',
  (source) => source.replaceAll('X-Forwarded-For', 'X-Something-Else'),
  /bypass is never attempted or never refused/,
);

/* ------------------------------------------------------------- the fixtures */

mutation(
  'a Template seed returns to "do nothing" and a re-seed leaves it archived',
  'studioFixtures',
  /*
   * Scoped to the Template insert with the gate's OWN indices.
   *
   * A whole-file `replace` was tried and removed the seed instead of mutating
   * it: the lazy `[\s\S]*?` ran from an earlier statement's `on conflict` past
   * the Template insert to the next `slug = excluded.slug`, and the gate then
   * reported "no Template seed found" — a different failure that would have let
   * this case pass for the wrong reason.
   */
  (source) => {
    const from = source.indexOf('insert into design_templates');
    const to = source.indexOf('insert into design_template_versions');
    return (
      source.slice(0, from) +
      source.slice(from, to).replace('on conflict (id) do update', 'on conflict (id) do nothing') +
      source.slice(to)
    );
  },
  /leaves the Template ARCHIVED/,
);

mutation(
  'the benchmark seed stops restoring the state it intends',
  'benchFixtures',
  (source) => source.replace('archived_at = null,', ''),
  /does not restore the state it intends/,
);

/* ------------------------------------------------------------ the follow-ups */

mutation(
  'a follow-up is closed without the measurement that earned it',
  'phase',
  (source) =>
    source.replace(
      /FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01 = COMPLETE — CLOSED_BY_APP3-E01 — VERDICT_EXPECTED_BY_STATE_MACHINE/,
      'FU-APP3-S10-RETRY-EXTRA-ATTEMPT-01 = COMPLETE — CLOSED_BY_APP3-E01 — verified',
    ),
  /closed without its measured evidence/,
);

mutation(
  'a follow-up carries an invented disposition',
  'phase',
  (source) =>
    source.replace(
      /FU-APP3-STUDIO-TOOL-RAIL-01 = OPEN — NONBLOCKING — AUDITED/,
      'FU-APP3-STUDIO-TOOL-RAIL-01 = FINE — AUDITED',
    ),
  /no recognised disposition/,
);

mutation(
  'the transform budget is disposed of without a WebKit run',
  'phase',
  // Every mention, not just the figures: the disposition names the engine four
  // times, so deleting one sentence leaves the rule satisfied by the prose.
  (source) => source.replaceAll('WebKit', 'Firefox').replaceAll('WEBKIT', 'FIREFOX'),
  /without a WebKit run/,
);

mutation(
  'the transform budget names no cause',
  'phase',
  (source) =>
    source.replace('ATTRIBUTION = PER_ELEMENT_REACT_SUBTREE_AT_L100', 'CAUSE = PER_ELEMENT'),
  /without an attribution/,
);

mutation(
  'the blocking finding is softened so closure could step over it',
  'phase',
  (source) =>
    source.replace(
      'FU-APP3-UPLOAD-REVISION-SEAM-01 = OPEN — BLOCKS_X01',
      'FU-APP3-UPLOAD-REVISION-SEAM-01 = OPEN — NONBLOCKING',
    ),
  /no longer blocks closure/,
);

mutation(
  'the blocking finding keeps its status but loses its measured refusal',
  'phase',
  (source) =>
    source.replace(/statusCode":409/g, 'statusCode":200').replace(/refuses it 409/, 'refuses it'),
  /names no measured refusal/,
);

/* ----------------------------------------------------------------- the entry */

mutation(
  'APP3-X01 starts before APP3-E01 is accepted',
  'phase',
  (source) => source.replace('APP3-X01 = BLOCKED_BY_APP3-E01', 'APP3-X01 = READY — NOT STARTED'),
  /APP3-X01 started before/,
);

mutation(
  'a predecessor loses its acceptance',
  'phase',
  (source) => source.replace('\nAPP3-S11 = COMPLETE — REVIEW_ACCEPTED', '\nAPP3-S11 = READY'),
  /APP3-S11 is not recorded as accepted/,
);

/* --------------------------------------------------------- the artifact set */

mutation(
  'the published contract moves',
  'openapi',
  (source) => {
    const document = JSON.parse(source);
    delete document.paths[Object.keys(document.paths)[0]];
    return JSON.stringify(document);
  },
  /paths/,
);

mutation(
  'a root script is added',
  'rootPackage',
  (source) => {
    const manifest = JSON.parse(source);
    manifest.scripts['app3-e01'] = 'node tools/smoke-app3-e01.mjs';
    return JSON.stringify(manifest, null, 2);
  },
  /scripts|checkpoint command/,
);

/* ------------------------------------------------------- the S10 investigation */

mutation(
  'the retry investigation stops measuring on injected time',
  'retryInvestigation',
  (source) => source.replaceAll('advance(', 'wait('),
  /not measured on injected time/,
);

mutation(
  'the retry investigation stops counting reconciliation reads',
  'retryInvestigation',
  (source) => source.replaceAll('resumeMock.mock.calls.length', 'true'),
  /proves nothing/,
);

/* -------------------------------------------------------------- the registry */

mutation(
  'a command is dropped from the scoped index',
  'index',
  (source) => source.replace('`CMD-JOURNEY-APP3-E01`', '`CMD-JOURNEY-APP3-E02`'),
  /CMD-JOURNEY-APP3-E01 is not registered/,
);
