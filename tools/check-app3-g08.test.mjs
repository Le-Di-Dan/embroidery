/**
 * Regressions for the `APP3-G08` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The cases worth reading twice
 * are the ones that would make `APP3-B06B` *easier* to write: a presign method
 * quietly added to the storage port, bootstrap handed to `APP3-B06A` "since it
 * already does the cookie", `APP3-W01C` dropped from the route because the race
 * "probably won't happen", the ordering premise left as prose after the worker
 * it describes has changed. None of those look like an architecture change in a
 * diff, which is exactly why an authority gate has to assert them.
 *
 * The sub-checks are exercised directly rather than through `checkApp3G08`,
 * which chains five predecessor gates: the chain is proved once, against the
 * real repository, in the last describe block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CANONICAL_FILES,
  DECISION_ID,
  checkBootstrapOwner,
  checkNoImplementation,
  checkOrderingPremise,
  checkRulingSubstance,
  checkStoragePortUnchanged,
  read,
} from './check-app3-g08-architecture.mjs';
import {
  EXPECTED_DEPENDENCIES,
  EXPECTED_FACTS,
  EXPECTED_STATUS,
  REPO_ROOT,
  checkApp3G08,
  checkDecision,
  checkFileSizes,
  checkGovernance,
  dependencyTable,
  factTable,
  statusBlock,
} from './check-app3-g08.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** Collects failures the way the checker does, so a case can assert on them. */
function collector() {
  const failures = [];
  return { failures, fail: (message) => failures.push(message) };
}

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

/**
 * One throwaway root holding exactly the files G08 reads.
 *
 * Deliberately not a full repository copy: G08's own checks read fourteen
 * files, and copying the application trees would make every case slower without
 * making any of them stronger.
 */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-g08-'));
  temporaries.push(base);
  for (const relative of Object.values(CANONICAL_FILES)) {
    const source = join(REPO_ROOT, relative);
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(source, target);
    } catch {
      // The completion report does not exist while Commit A is being prepared.
    }
  }
  // The checker measures itself against the soft caps.
  for (const tool of [
    'tools/check-app3-g08.mjs',
    'tools/check-app3-g08-architecture.mjs',
    'tools/check-app3-g08.test.mjs',
  ]) {
    const target = join(base, tool);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPO_ROOT, tool), target);
  }
  return base;
}

/** A copy of the base root with the given files replaced. */
function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-g08-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const relative = CANONICAL_FILES[key] ?? key;
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

const file = (key) => read(REPO_ROOT, key) ?? '';

/** The committed OpenAPI document with one design-session route grafted on. */
function openapiWithSessionRoute() {
  const document = JSON.parse(file('openapi'));
  document.paths['/public/design-sessions/{sessionId}/assets'] = { post: {} };
  return JSON.stringify(document);
}
const registerRow = () =>
  file('register')
    .split('\n')
    .find((line) => line.startsWith(`| ${DECISION_ID} |`));

describe('the decision itself', () => {
  it('accepts the delivered register row', () => {
    const { failures, fail } = collector();
    checkDecision(file('register'), fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a missing decision', () => {
    const { failures, fail } = collector();
    checkDecision('| IMP-D047 | something else | LOCKED |', fail);
    assert.ok(mentions(failures, 'is missing'), failures.join('\n'));
  });

  it('rejects a decision declared twice', () => {
    const row = registerRow();
    const { failures, fail } = collector();
    checkDecision(`${row}\n${row}`, fail);
    assert.ok(mentions(failures, 'is declared 2 times'), failures.join('\n'));
  });

  it('rejects a decision that is not LOCKED', () => {
    const { failures, fail } = collector();
    checkDecision(registerRow().replace('| LOCKED |', '| PROPOSED |'), fail);
    assert.ok(mentions(failures, 'is not LOCKED'), failures.join('\n'));
  });

  it('rejects a decision missing any one ruling', () => {
    for (const ruling of ['PO-01', 'PO-05', 'PO-08', 'PO-09']) {
      const { failures, fail } = collector();
      checkDecision(registerRow().replaceAll(`(${ruling})`, '(PO-XX)'), fail);
      assert.ok(mentions(failures, `does not record ruling ${ruling}`), ruling);
    }
  });
});

describe('the substance of the ruling', () => {
  it('accepts the delivered ruling', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow(), fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a ruling that drops the streaming architecture', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('API_OWNED_MULTIPART_STREAMING', 'TBD'), fail);
    assert.ok(mentions(failures, 'multipart streaming architecture'), failures.join('\n'));
  });

  it('rejects a ruling that no longer mentions presign at all', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('presign', 'upload'), fail);
    assert.ok(mentions(failures, 'the presign refusal'), failures.join('\n'));
  });

  it('rejects a ruling that loses the exact B06B route', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(
      registerRow().replaceAll(
        'POST /api/public/design-sessions/:sessionId/assets',
        'POST /api/public/uploads',
      ),
      fail,
    );
    assert.ok(mentions(failures, 'the B06B route'), failures.join('\n'));
  });

  it('rejects a ruling that loses either half of the expected surface', () => {
    for (const [needle, what] of [
      ['`paths 19 → 20`', 'the expected path delta'],
      ['`operations 23 → 24`', 'the expected operation delta'],
    ]) {
      const { failures, fail } = collector();
      checkRulingSubstance(registerRow().replaceAll(needle, '`measured at delivery`'), fail);
      assert.ok(mentions(failures, what), what);
    }
  });

  it('rejects a ruling that widens or narrows the media allowlist', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      const { failures, fail } = collector();
      checkRulingSubstance(registerRow().replaceAll(type, 'image/avif'), fail);
      assert.ok(mentions(failures, 'allowance'), type);
    }
  });

  it('rejects a ruling that stops refusing SVG', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('image/svg+xml', 'image/heic'), fail);
    assert.ok(mentions(failures, 'the SVG refusal'), failures.join('\n'));
  });

  it('rejects a ruling that loses the 10 MiB source limit', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('10 MiB', '25 MiB'), fail);
    assert.ok(mentions(failures, 'the source limit'), failures.join('\n'));
  });

  it('rejects a ruling that reinterprets the asset lane', () => {
    for (const value of ['CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE']) {
      const { failures, fail } = collector();
      checkRulingSubstance(registerRow().replaceAll(value, 'CATALOG_MEDIA'), fail);
      assert.ok(mentions(failures, 'asset'), value);
    }
  });

  it('rejects a ruling that abandons the APP2 claim protocol', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(
      registerRow().replaceAll('IdempotencyAllocationStore', 'a new store'),
      fail,
    );
    assert.ok(mentions(failures, 'reuse of the APP2 claim protocol'), failures.join('\n'));
  });

  it('rejects a ruling that drops the no-network-in-transaction boundary', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(
      registerRow().replaceAll(
        'No object-storage network call occurs inside the database transaction',
        'Storage calls are ordered sensibly',
      ),
      fail,
    );
    assert.ok(mentions(failures, 'the boundary rule'), failures.join('\n'));
  });

  it('rejects a ruling that loses the normalization event or its association identity', () => {
    for (const [needle, what] of [
      ['asset.normalization.requested', 'the normalization event'],
      ['DESIGN_SESSION_ASSET', 'the association reference kind'],
      ['designSessionAssetId', 'the association identity'],
    ]) {
      const { failures, fail } = collector();
      checkRulingSubstance(registerRow().replaceAll(needle, 'something'), fail);
      assert.ok(mentions(failures, what), what);
    }
  });

  it('rejects a ruling that drops the W01C ordering route', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('APP3-W01C', 'APP3-B06B'), fail);
    assert.ok(mentions(failures, 'the ordering route'), failures.join('\n'));
  });

  it('rejects a ruling that reassigns the bootstrap owner', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(registerRow().replaceAll('APP3-B07', 'APP3-B06A'), fail);
    assert.ok(mentions(failures, 'the bootstrap owner'), failures.join('\n'));
  });

  it('rejects a ruling that invents a new association uniqueness authority', () => {
    const { failures, fail } = collector();
    checkRulingSubstance(
      registerRow().replaceAll('uq_design_session_assets__session_asset', 'a new unique index'),
      fail,
    );
    assert.ok(mentions(failures, 'the association uniqueness authority'), failures.join('\n'));
  });
});

describe('the fact and dependency tables', () => {
  it('parses every expected fact from the delivered phase plan', () => {
    const facts = factTable(file('phase'));
    for (const [key, value] of Object.entries(EXPECTED_FACTS)) {
      assert.equal(facts.get(key), value, key);
    }
  });

  it('parses every expected dependency from the delivered phase plan', () => {
    const rows = dependencyTable(file('phase'));
    for (const [key, value] of Object.entries(EXPECTED_DEPENDENCIES)) {
      assert.equal(rows.get(key), value, key);
    }
  });

  it('reads no fact from a table whose section heading moved', () => {
    assert.equal(factTable(file('phase').replace('### 6.22.1 ', '### 6.23.1 ')).size, 0);
  });

  it('keeps W01C ahead of B06B in the routed dependency order', () => {
    const rows = dependencyTable(file('phase'));
    assert.equal(
      rows.get('APP3-W01C :: whole checkpoint, post-G08'),
      'BLOCKED_BY_APP3-G08_REVIEW_ACCEPTANCE',
    );
    assert.match(rows.get('APP3-B06B :: whole checkpoint, post-G08'), /APP3-W01C/);
  });
});

describe('the status block', () => {
  it('records every required status line', () => {
    const status = statusBlock(file('phase'));
    for (const line of EXPECTED_STATUS) {
      assert.ok(status.includes(`\n${line}\n`), line);
    }
  });

  it('is read only from the fenced status block, never from prose', () => {
    // Renamed to a heading that does not share the prefix: `## 10. Statuses`
    // would still match, and a test that passes on a prefix proves nothing.
    const phase = file('phase').replace('## 10. Status', '## 10. Recorded state');
    assert.equal(statusBlock(phase), '');
  });

  it('does not record B06 as complete or failed', () => {
    const status = statusBlock(file('phase'));
    assert.ok(!/\nAPP3-B06 = COMPLETE/.test(status));
    assert.ok(!/\nAPP3-B06 = FAILED/.test(status));
    assert.ok(status.includes('\nAPP3-B06 = REPLANNED — REPLACED_BY_APP3-B06A_AND_APP3-B06B\n'));
  });
});

describe('the bootstrap owner', () => {
  it('accepts the delivered plan, where APP3-B07 owns bootstrap', () => {
    const { failures, fail } = collector();
    checkBootstrapOwner(file('phase'), fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a plan in which B07 no longer owns session bootstrap', () => {
    const phase = file('phase').replace(
      '| 21 | `APP3-B07` | backend | session bootstrap (blank + clone) and resume',
      '| 21 | `APP3-B07` | backend | session resume only',
    );
    const { failures, fail } = collector();
    checkBootstrapOwner(phase, fail);
    assert.ok(mentions(failures, 'no longer owns session bootstrap'), failures.join('\n'));
  });

  it('rejects a plan that also hands bootstrap to B06A', () => {
    const phase = `${file('phase')}\n| 21b | \`APP3-B06A\` | backend | session bootstrap too | 1 |\n`;
    const { failures, fail } = collector();
    checkBootstrapOwner(phase, fail);
    assert.ok(mentions(failures, 'must not also own session bootstrap'), failures.join('\n'));
  });

  it('rejects a plan in which B07 has no row at all', () => {
    const phase = file('phase')
      .split('\n')
      .filter((line) => !/^\|\s*\d+\s*\|\s*`APP3-B07`/.test(line.trim()))
      .join('\n');
    const { failures, fail } = collector();
    checkBootstrapOwner(phase, fail);
    assert.ok(mentions(failures, 'has no checkpoint-table row'), failures.join('\n'));
  });
});

describe('the ordering premise', () => {
  it('accepts the delivered worker', () => {
    const { failures, fail } = collector();
    checkOrderingPremise(REPO_ROOT, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a worker whose required status is no longer ACCEPTED', () => {
    const root = rootWith({
      associationResolver: file('associationResolver').replace(
        "const REQUIRED_ASSET_STATUS = 'ACCEPTED';",
        "const REQUIRED_ASSET_STATUS = 'UPLOADED';",
      ),
    });
    const { failures, fail } = collector();
    checkOrderingPremise(root, fail);
    assert.ok(mentions(failures, "no longer 'ACCEPTED'"), failures.join('\n'));
  });

  it('rejects a worker that stopped comparing the status at all', () => {
    const root = rootWith({
      associationResolver: file('associationResolver').replaceAll(
        'status !== REQUIRED_ASSET_STATUS',
        'false',
      ),
    });
    const { failures, fail } = collector();
    checkOrderingPremise(root, fail);
    assert.ok(mentions(failures, 'the status comparison'), failures.join('\n'));
  });

  it('rejects a worker that no longer raises the terminal verdict', () => {
    const root = rootWith({
      associationResolver: file('associationResolver').replaceAll(
        "normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE')",
        'new Error("nope")',
      ),
    });
    const { failures, fail } = collector();
    checkOrderingPremise(root, fail);
    assert.ok(mentions(failures, 'terminal verdict is no longer raised'), failures.join('\n'));
  });

  it('rejects a missing resolver rather than passing vacuously', () => {
    const root = rootWith();
    rmSync(join(root, CANONICAL_FILES.associationResolver));
    const { failures, fail } = collector();
    checkOrderingPremise(root, fail);
    assert.ok(mentions(failures, 'missing'), failures.join('\n'));
  });
});

describe('the storage port', () => {
  it('accepts the delivered six-method port', () => {
    const { failures, fail } = collector();
    checkStoragePortUnchanged(REPO_ROOT, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a seventh method', () => {
    const port = file('storagePort').replace(
      '  deleteObject(',
      '  presignPut(reference: ObjectReference): Promise<string>;\n  deleteObject(',
    );
    const { failures, fail } = collector();
    checkStoragePortUnchanged(rootWith({ storagePort: port }), fail);
    assert.ok(mentions(failures, 'a capability was added'), failures.join('\n'));
  });

  it('rejects a presign capability even when the method count is preserved', () => {
    const port = file('storagePort').replace('  deleteObject(', '  getSignedUrl(');
    const { failures, fail } = collector();
    checkStoragePortUnchanged(rootWith({ storagePort: port }), fail);
    assert.ok(mentions(failures, 'a presign capability appeared'), failures.join('\n'));
  });

  it('does not mistake the port comment explaining the absence for a presence', () => {
    assert.match(file('storagePort'), /there is \*\*no\*\* presign operation/);
    const { failures, fail } = collector();
    checkStoragePortUnchanged(REPO_ROOT, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a presign export from the package barrel', () => {
    const index = `${file('storageIndex')}\nexport { presignPut } from './presign';\n`;
    const { failures, fail } = collector();
    checkStoragePortUnchanged(rootWith({ storageIndex: index }), fail);
    assert.ok(mentions(failures, 'exports a presign capability'), failures.join('\n'));
  });
});

describe('the two consistent worlds', () => {
  const undelivered = '\nAPP3-B06B = BLOCKED_BY_APP3-B06A_APP3-W01C_AND_APP3-B07\n';
  const delivered = '\nAPP3-B06B = COMPLETE — REVIEW_DELIVERED\n';

  it('accepts the current world, in which nothing is implemented', () => {
    const { failures, fail } = collector();
    checkNoImplementation(REPO_ROOT, undelivered, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a route that appears before B06B is recorded', () => {
    const openapi = openapiWithSessionRoute();
    const { failures, fail } = collector();
    checkNoImplementation(rootWith({ openapi }), undelivered, fail);
    assert.ok(mentions(failures, 'a design-session route exists before'), failures.join('\n'));
  });

  it('rejects a composed design module before B06B is recorded', () => {
    const appModule = `${file('appModule')}\n// DesignModule\n`;
    const { failures, fail } = collector();
    checkNoImplementation(rootWith({ appModule }), undelivered, fail);
    assert.ok(mentions(failures, 'a design module is composed before'), failures.join('\n'));
  });

  it('rejects a path-count drift in the undelivered world', () => {
    const document = JSON.parse(file('openapi'));
    delete document.paths[Object.keys(document.paths)[0]];
    const { failures, fail } = collector();
    checkNoImplementation(rootWith({ openapi: JSON.stringify(document) }), undelivered, fail);
    assert.ok(mentions(failures, 'expected the accepted 19'), failures.join('\n'));
  });

  it('rejects the delivered world when the route is still absent', () => {
    const { failures, fail } = collector();
    checkNoImplementation(REPO_ROOT, delivered, fail);
    assert.ok(mentions(failures, 'publishes no route'), failures.join('\n'));
    assert.ok(mentions(failures, 'is not composed'), failures.join('\n'));
  });

  it('accepts the delivered world once route and composition are both present', () => {
    const openapi = openapiWithSessionRoute();
    const appModule = `${file('appModule')}\n// DesignModule\n`;
    const { failures, fail } = collector();
    checkNoImplementation(rootWith({ openapi, appModule }), delivered, fail);
    assert.deepEqual(failures, []);
  });
});

describe('governance', () => {
  const status = statusBlock(file('phase'));

  it('accepts the delivered repository', () => {
    const { failures, fail } = collector();
    checkGovernance(REPO_ROOT, status, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a closed parameter follow-up', () => {
    const { failures, fail } = collector();
    checkGovernance(
      REPO_ROOT,
      status.replace(
        'FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = OPEN',
        'FU-PLATFORM-ZOD-DTO-OPENAPI-PARAMETERS-01 = COMPLETE',
      ),
      fail,
    );
    assert.ok(mentions(failures, 'not recorded open'), failures.join('\n'));
  });

  it('rejects a thirty-first root script', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts['check:extra'] = 'node tools/nothing.mjs';
    const { failures, fail } = collector();
    checkGovernance(rootWith({ rootManifest: JSON.stringify(manifest) }), status, fail);
    assert.ok(mentions(failures, 'root scripts, expected 30'), failures.join('\n'));
  });

  it('rejects a G08 root script by name, not only by count', () => {
    const manifest = JSON.parse(file('rootManifest'));
    delete manifest.scripts[Object.keys(manifest.scripts)[0]];
    manifest.scripts['check:app3-g08'] = 'node tools/check-app3-g08.mjs';
    const { failures, fail } = collector();
    checkGovernance(rootWith({ rootManifest: JSON.stringify(manifest) }), status, fail);
    assert.ok(mentions(failures, 'added a root script'), failures.join('\n'));
  });

  it('rejects an unindexed command', () => {
    for (const id of ['CMD-CHECK-APP3-G08', 'CMD-TEST-APP3-G08']) {
      const index = file('commandIndex').replaceAll(`\`${id}\``, '`CMD-REMOVED`');
      const { failures, fail } = collector();
      checkGovernance(rootWith({ commandIndex: index }), status, fail);
      assert.ok(mentions(failures, `${id} is not indexed`), id);
    }
  });
});

describe('the tooling soft caps', () => {
  it('accepts the delivered checker and test', () => {
    const { failures, fail } = collector();
    checkFileSizes(REPO_ROOT, fail);
    assert.deepEqual(failures, []);
  });

  it('rejects a checker above the 450-line soft cap', () => {
    const bloated = `${file('tools/check-app3-g08.mjs')}\n${'//\n'.repeat(500)}`;
    const { failures, fail } = collector();
    checkFileSizes(rootWith({ 'tools/check-app3-g08.mjs': bloated }), fail);
    assert.ok(mentions(failures, 'above the 450 soft cap'), failures.join('\n'));
  });

  it('rejects a test above the 700-line soft cap', () => {
    const bloated = `${file('tools/check-app3-g08.test.mjs')}\n${'//\n'.repeat(800)}`;
    const { failures, fail } = collector();
    checkFileSizes(rootWith({ 'tools/check-app3-g08.test.mjs': bloated }), fail);
    assert.ok(mentions(failures, 'above the 700 soft cap'), failures.join('\n'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3G08(REPO_ROOT), []);
  });
});
