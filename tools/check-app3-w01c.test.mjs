/**
 * Regressions for the `APP3-W01C` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice all
 * look like simplifications: dropping the `DESIGN_SESSION_ASSET` condition so
 * "any pending Asset waits", adding `UPLOADED` next to `INSPECTING` because they
 * seem like siblings, moving the claim above the resolve, or swapping the error
 * class for one the runtime treats as always-terminal. Each would pass review as
 * tidying and each silently undoes the checkpoint.
 *
 * The sub-checks run through `checkApp3W01C` on a temp root; the predecessor
 * chain is proved once, against the real repository, in the last block. Mutation
 * cases assert on the presence of their own message, so unrelated chain noise in
 * a stripped-down root cannot mask a real failure.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, checkApp3W01C, code, read } from './check-app3-w01c.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';

function mentions(failures, needle) {
  return failures.some((failure) => failure.includes(needle));
}

/** One throwaway root holding exactly the files the gate reads. */
let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-w01c-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-w01c.mjs',
    'tools/check-app3-w01c.test.mjs',
    'apps/api/src/bootstrap/app.module.ts',
    'apps/worker/src/jobs/asset-normalization/infrastructure/persistence/sql-asset-normalization.repository.ts',
  ];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-w01c-case-'));
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

/** Runs the gate without the predecessor chain, which a stripped root cannot satisfy. */
function run(overrides = {}) {
  return checkApp3W01C(rootWith(overrides)).filter((failure) => !failure.includes('regression:'));
}

describe('the authority it implements', () => {
  it('accepts the delivered documents', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('IMP-D048') || failure.includes('status block')),
      [],
    );
  });

  it('rejects a phase that has not recorded G08 as accepted', () => {
    const failures = run({
      phase: file('phase').replace(
        'APP3-G08 = COMPLETE — REVIEW_ACCEPTED',
        'APP3-G08 = COMPLETE — REVIEW_DELIVERED',
      ),
    });
    assert.ok(mentions(failures, 'APP3-G08 = COMPLETE — REVIEW_ACCEPTED'), failures.join('\n'));
  });

  it('rejects an unlocked or absent IMP-D048', () => {
    const row = file('register')
      .split('\n')
      .find((line) => line.startsWith('| IMP-D048 |'));
    const unlocked = run({ register: row.replace('| LOCKED |', '| PROPOSED |') });
    assert.ok(mentions(unlocked, 'is not LOCKED'), unlocked.join('\n'));
    const absent = run({ register: '| IMP-D047 | other | LOCKED |' });
    assert.ok(mentions(absent, 'IMP-D048 is missing'), absent.join('\n'));
  });

  it('rejects a ruling that no longer routes the fix to this checkpoint', () => {
    const row = file('register')
      .split('\n')
      .find((line) => line.startsWith('| IMP-D048 |'));
    const failures = run({ register: row.replaceAll('APP3-W01C', 'APP3-B06B') });
    assert.ok(mentions(failures, 'does not route the ordering fix'), failures.join('\n'));
  });
});

describe('the transient status set', () => {
  it('accepts exactly INSPECTING', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('transient statuses')),
      [],
    );
  });

  it('rejects UPLOADED being admitted alongside it', () => {
    // The case the ruling names: a state a committed request cannot observe,
    // whose admission turns a real defect into a silent retry loop.
    const failures = run({
      pending: file('pending').replace(
        "Object.freeze(['INSPECTING'])",
        "Object.freeze(['INSPECTING', 'UPLOADED'])",
      ),
    });
    assert.ok(mentions(failures, 'expected exactly INSPECTING'), failures.join('\n'));
  });

  it('rejects widening to every non-accepted state', () => {
    const failures = run({
      pending: file('pending').replace(
        "Object.freeze(['INSPECTING'])",
        "Object.freeze(['INSPECTING', 'UPLOADED', 'REJECTED'])",
      ),
    });
    assert.ok(mentions(failures, 'expected exactly INSPECTING'), failures.join('\n'));
  });

  it('rejects a mutable set that a caller could push onto', () => {
    const failures = run({
      pending: file('pending').replace("Object.freeze(['INSPECTING'])", "['INSPECTING']"),
    });
    assert.ok(mentions(failures, 'not a frozen literal'), failures.join('\n'));
  });
});

describe('the retry signal', () => {
  it('accepts the delivered signal', () => {
    assert.deepEqual(
      run().filter((f) => f.includes('JOB_TRANSIENT_FAILURE') || f.includes('WorkerJobError')),
      [],
    );
  });

  it('rejects an always-terminal class in its place', () => {
    const failures = run({
      pending: file('pending').replace("'JOB_TRANSIENT_FAILURE'", "'JOB_INVARIANT_VIOLATION'"),
    });
    assert.ok(mentions(failures, 'not raised as a JOB_TRANSIENT_FAILURE'), failures.join('\n'));
  });

  it('rejects the runtime making that class always-terminal underneath it', () => {
    // The retry could be killed without touching this job at all.
    const failures = run({
      errors: file('errors').replace(
        "'JOB_INVARIANT_VIOLATION',\n]);",
        "'JOB_INVARIANT_VIOLATION',\n  'JOB_TRANSIENT_FAILURE',\n]);",
      ),
    });
    assert.ok(mentions(failures, 'retry is dead'), failures.join('\n'));
  });

  it('rejects the loss of the attempt-cap disposition', () => {
    const failures = run({
      errors: file('errors').replace(
        "attemptNo >= maxAttempts ? 'TERMINAL' : 'RETRYABLE'",
        "'RETRYABLE'",
      ),
    });
    assert.ok(mentions(failures, 'attempt-cap disposition is gone'), failures.join('\n'));
  });

  it('rejects an identity leaking into the operator-visible message', () => {
    const failures = run({
      pending: file('pending').replace(
        "'Asset inspection has not completed yet; normalization will be retried.'",
        '`Asset ${assetId} inspection has not completed yet.`',
      ),
    });
    assert.ok(mentions(failures, 'carries an identity'), failures.join('\n'));
  });
});

describe('the narrowing', () => {
  it('accepts the delivered resolver', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('association-resolution')),
      [],
    );
  });

  it('rejects dropping the DESIGN_SESSION_ASSET condition', () => {
    // "Any pending Asset waits" — one deleted clause, and a retired Product Side
    // retries to the dead-letter instead of being refused in one statement.
    const failures = run({
      resolver: file('resolver').replace(
        "reference.kind === 'DESIGN_SESSION_ASSET' && isSessionInspectionPending(source.status)",
        'isSessionInspectionPending(source.status)',
      ),
    });
    assert.ok(mentions(failures, 'not narrowed to DESIGN_SESSION_ASSET'), failures.join('\n'));
  });

  it('rejects ACCEPTED ceasing to be the status that proceeds', () => {
    const failures = run({
      resolver: file('resolver').replace(
        "const REQUIRED_ASSET_STATUS = 'ACCEPTED';",
        "const REQUIRED_ASSET_STATUS = 'INSPECTING';",
      ),
    });
    assert.ok(mentions(failures, 'no longer the status that proceeds'), failures.join('\n'));
  });

  it('rejects a missing or tombstoned Asset becoming non-terminal', () => {
    const failures = run({
      resolver: file('resolver').replace(
        'source === undefined || source.deleted',
        'source === undefined',
      ),
    });
    assert.ok(mentions(failures, 'no longer terminal'), failures.join('\n'));
  });

  it('rejects the lane check sliding below the status check', () => {
    // Order matters: a wrong-lane Asset must stay terminal however it is being
    // inspected, because waiting cannot make it belong to this profile.
    const resolver = file('resolver');
    const laneBlock =
      /if \(!LANE_BY_PROFILE\[profile\]\.includes\(source\.kind\)\) \{[\s\S]*?\n {4}\}\n/.exec(
        resolver,
      );
    assert.ok(laneBlock, 'lane block not found in the delivered resolver');
    const moved = resolver
      .replace(laneBlock[0], '')
      .replace(
        '    return { profile, source };',
        `${laneBlock[0]}\n    return { profile, source };`,
      );
    const failures = run({ resolver: moved });
    assert.ok(mentions(failures, 'no longer precedes the status check'), failures.join('\n'));
  });

  it('rejects widening the wait to Product Side or Template normalization', () => {
    for (const kind of ['PRODUCT_SIDE_BACKGROUND', 'DESIGN_TEMPLATE_ASSET']) {
      const failures = run({
        resolver: file('resolver').replace(
          "if (reference.kind === 'DESIGN_SESSION_ASSET' && isSessionInspectionPending(source.status)) {",
          `if (reference.kind === '${kind}' && inspectionPendingFailure && isSessionInspectionPending(source.status)) {`,
        ),
      });
      assert.ok(mentions(failures, 'widened to'), kind);
    }
  });

  it('rejects losing any of the four terminal context paths', () => {
    const failures = run({
      resolver: file('resolver').replaceAll(
        "normalizationRejection('NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE')",
        'undefined',
      ),
    });
    assert.ok(mentions(failures, 'terminal rejections, expected the four'), failures.join('\n'));
  });
});

describe('the claim order', () => {
  it('accepts the delivered use case', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('usecase')),
      [],
    );
  });

  it('rejects the claim being taken before the context is resolved', () => {
    // If the claim moved first, every waiting attempt would strand a PROCESSING
    // row that the next one has to take over.
    const useCase = file('useCase');
    const resolveCall =
      /const \{ profile, source \} = await this\.associations\.resolve\([\s\S]*?\);\n/.exec(
        useCase,
      );
    assert.ok(resolveCall, 'resolve call not found in the delivered use case');
    const moved = useCase
      .replace(resolveCall[0], '')
      .replace('    if (prepared.kind === ', `${resolveCall[0]}    if (prepared.kind === `);
    const failures = run({ useCase: moved });
    assert.ok(mentions(failures, 'claim now precedes the context resolve'), failures.join('\n'));
  });

  it('rejects a retryable failure being swallowed into a completed job', () => {
    // Only `normalize`'s own catch is replaced; the finalize path keeps its
    // `throw error;`, which is exactly the case a looser check would miss.
    const useCase = file('useCase');
    const guard = /      await this\.releaseClaim\(payload\.assetId\);\n      throw error;\n/.exec(
      useCase,
    );
    assert.ok(guard, 'normalize catch not found in the delivered use case');
    const failures = run({
      useCase: useCase.replace(
        guard[0],
        '      return { outcome: "REJECTED", code: "X", detail: "" };\n',
      ),
    });
    assert.ok(mentions(failures, 'no longer propagates to the runtime'), failures.join('\n'));
  });
});

describe('the mechanisms it must not add', () => {
  it('accepts the delivered sources', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('introduces')),
      [],
    );
  });

  it('rejects a sleep or polling primitive', () => {
    const failures = run({
      pending: `${file('pending')}\nexport const wait = () => setTimeout(() => undefined, 1000);\n`,
    });
    assert.ok(mentions(failures, 'a sleep or polling primitive'), failures.join('\n'));
  });

  it('rejects a scheduler, cron or sweep', () => {
    const failures = run({
      resolver: `${file('resolver')}\nconst scheduler = null;\n`,
    });
    assert.ok(mentions(failures, 'a scheduler, cron or sweep'), failures.join('\n'));
  });

  it('rejects an event append from the consumer', () => {
    const failures = run({
      useCase: `${file('useCase')}\nconst x = () => this.outbox.append({});\n`,
    });
    assert.ok(mentions(failures, 'an event append'), failures.join('\n'));
  });

  it('rejects a changed job kind', () => {
    const failures = run({
      handler: file('handler').replace(
        'readonly jobKind = ASSET_PROCESSING;',
        'readonly jobKind = OTHER;',
      ),
    });
    assert.ok(mentions(failures, 'job kind changed'), failures.join('\n'));
  });

  it('does not mistake the prose describing a refusal for the thing itself', () => {
    // The sources explain at length that there is no scheduler and no sleep.
    assert.match(file('pending'), /no sweep, no second event/i);
    assert.deepEqual(
      run().filter((failure) => failure.includes('introduces')),
      [],
    );
    assert.ok(!/setTimeout/.test(code(file('pending'))));
  });
});

describe('the convergence proof', () => {
  it('accepts the delivered suites', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('does not prove')),
      [],
    );
  });

  it('rejects a suite that stops proving convergence after ACCEPTED', () => {
    const failures = run({
      convergenceSpec: file('convergenceSpec').replaceAll("'ACCEPTED'", "'PENDING'"),
    });
    assert.ok(mentions(failures, 'inspection completing'), failures.join('\n'));
  });

  it('rejects a suite that stops proving termination after REJECTED', () => {
    const failures = run({
      convergenceSpec: file('convergenceSpec').replaceAll("'REJECTED'", "'OTHER'"),
    });
    assert.ok(mentions(failures, 'inspection refusing the file'), failures.join('\n'));
  });

  it('rejects a suite that no longer proves association removal is terminal', () => {
    const failures = run({
      convergenceSpec: file('convergenceSpec').replaceAll(
        'delete from design_session_assets',
        'select 1 from design_session_assets',
      ),
    });
    assert.ok(mentions(failures, 'association removal while waiting'), failures.join('\n'));
  });

  it('rejects a missing runtime-disposition proof in the unit suite', () => {
    const failures = run({
      resolverSpec: file('resolverSpec').replaceAll(
        "dispositionOf('JOB_TRANSIENT_FAILURE'",
        'noop(',
      ),
    });
    assert.ok(mentions(failures, 'runtime disposition of the signal'), failures.join('\n'));
  });

  it('rejects a missing convergence suite outright', () => {
    const root = rootWith();
    rmSync(join(root, CANONICAL_FILES.convergenceSpec));
    const failures = checkApp3W01C(root).filter((f) => !f.includes('regression:'));
    assert.ok(mentions(failures, 'missing'), failures.join('\n'));
  });
});

describe('the boundary', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(
      run().filter(
        (f) => f.includes('root scripts') || f.includes('migrations') || f.includes('paths'),
      ),
      [],
    );
  });

  it('rejects a thirty-first root script', () => {
    const manifest = JSON.parse(file('rootManifest'));
    manifest.scripts['check:extra'] = 'node tools/nothing.mjs';
    const failures = run({ rootManifest: JSON.stringify(manifest) });
    assert.ok(mentions(failures, 'root scripts, expected 30'), failures.join('\n'));
  });

  it('rejects a W01C root script by name, not only by count', () => {
    const manifest = JSON.parse(file('rootManifest'));
    delete manifest.scripts[Object.keys(manifest.scripts)[0]];
    manifest.scripts['check:app3-w01c'] = 'node tools/check-app3-w01c.mjs';
    const failures = run({ rootManifest: JSON.stringify(manifest) });
    assert.ok(mentions(failures, 'added a root script'), failures.join('\n'));
  });

  it('rejects a retry or scheduling dependency', () => {
    const manifest = JSON.parse(file('workerManifest'));
    manifest.dependencies['p-retry'] = '^6.0.0';
    const failures = run({ workerManifest: JSON.stringify(manifest) });
    assert.ok(mentions(failures, 'retry or scheduling dependency'), failures.join('\n'));
  });

  it('rejects an HTTP surface appearing in a worker checkpoint', () => {
    const document = JSON.parse(file('openapi'));
    document.paths['/public/design-sessions/{sessionId}/assets'] = { post: {} };
    const failures = run({ openapi: JSON.stringify(document) });
    assert.ok(mentions(failures, 'publishes no HTTP surface'), failures.join('\n'));
  });

  it('rejects an unindexed command', () => {
    for (const id of ['CMD-CHECK-APP3-W01C', 'CMD-TEST-APP3-W01C']) {
      const failures = run({
        commandIndex: file('commandIndex').replaceAll(`\`${id}\``, '`CMD-REMOVED`'),
      });
      assert.ok(mentions(failures, `${id} is not indexed`), id);
    }
  });

  it('rejects a successor checkpoint having been started', () => {
    const failures = run({
      'apps/api/src/bootstrap/app.module.ts': `${file('apps/api/src/bootstrap/app.module.ts')}\n// DesignModule\n`,
    });
    assert.ok(mentions(failures, 'B06A/B06B started'), failures.join('\n'));
  });
});

describe('file sizes', () => {
  it('accepts the delivered files', () => {
    assert.deepEqual(
      run().filter((failure) => failure.includes('lines, above')),
      [],
    );
  });

  it('rejects an application source above 400 lines', () => {
    const failures = run({ resolver: `${file('resolver')}\n${'//\n'.repeat(420)}` });
    assert.ok(mentions(failures, 'above the 400 limit'), failures.join('\n'));
  });

  it('rejects a test above 600 lines', () => {
    const failures = run({ convergenceSpec: `${file('convergenceSpec')}\n${'//\n'.repeat(620)}` });
    assert.ok(mentions(failures, 'above the 600 limit'), failures.join('\n'));
  });

  it('rejects a checker above the 450-line soft cap', () => {
    const failures = run({
      'tools/check-app3-w01c.mjs': `${file('tools/check-app3-w01c.mjs')}\n${'//\n'.repeat(500)}`,
    });
    assert.ok(mentions(failures, 'above the 450 limit'), failures.join('\n'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes, chain and all', () => {
    assert.deepEqual(checkApp3W01C(REPO_ROOT), []);
  });
});
