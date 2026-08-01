/**
 * Docker-free tests for the `APP2-T01-C1` production media smoke (§9).
 *
 * These run in the ordinary `tools/*.test.mjs` aggregation, so the properties
 * that make the harness safe — the swap really is production, the override
 * never lands in the repository, the developer's stack is always restored, the
 * production database guards are satisfied rather than weakened, and the
 * fixture setup is never dressed up as a Product command — are checked on every
 * `pnpm test`, not only on the machine that happens to have Docker running.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  API_SERVICE,
  BUILD_TIMEOUT_MS,
  DEV_PROJECT,
  IMAGE_PREFIX,
  PG_IMAGE_PREFIX,
  POSTGRES_BASE_IMAGE,
  PROD_DB_CONTAINER,
  PROD_DB_SERVICE,
  WAIT_TIMEOUT_SECONDS,
  argsAreCredentialFree,
  buildArgs,
  buildPgArgs,
  classifyApiRuntime,
  cleanupPlan,
  composeArgs,
  databaseUpArgs,
  dockerignoreIsolatesBuildOutput,
  dumpArgs,
  gatewayReloadArgs,
  isOutsideRepository,
  pgDockerfile,
  pgImageTag,
  phasePlan,
  productionDatabaseUrl,
  productionImageTag,
  productionOverrideYaml,
  redactSecrets,
  removeDatabaseArgs,
  removeImageArgs,
  restoreArgs,
  restoreDumpArgs,
  swapArgs,
} from './smoke-app2-t01-production-topology.mjs';
import { requestArgs } from './smoke-app2-t01-gateway-http.mjs';
import { fixtureStatusSql, unhandledLogHits } from './smoke-app2-t01-public-media-scenarios.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOLS, '..');
const HARNESS = readFileSync(join(TOOLS, 'smoke-app2-t01-public-media-production.mjs'), 'utf8');
const TOPOLOGY = readFileSync(join(TOOLS, 'smoke-app2-t01-production-topology.mjs'), 'utf8');
const SCENARIOS = readFileSync(join(TOOLS, 'smoke-app2-t01-public-media-scenarios.mjs'), 'utf8');
const FACTS = readFileSync(join(TOOLS, 'smoke-app2-t01-docker-facts.mjs'), 'utf8');

/** Synthetic only — a real secret never appears in a fixture. */
const FAKE_SECRET = 'synthetic-not-a-real-password';
const OVERRIDE = productionOverrideYaml({
  imageTag: 'api:1',
  databaseImageTag: 'pg:1',
  databasePassword: FAKE_SECRET,
});

test('the smoke cannot run before the upstream has been swapped', () => {
  const plan = phasePlan();
  assert.ok(plan.indexOf('swap-upstream') < plan.indexOf('scenarios'));
  assert.ok(plan.indexOf('reload-gateway') < plan.indexOf('scenarios'));
  // And the run aborts rather than smoking a runtime it could not classify.
  assert.match(HARNESS, /refusing to smoke/);
  assert.match(HARNESS, /if \(prodFacts\.kind !== 'production'\)/);
});

test('production is asserted from the command, NODE_ENV and mount count', () => {
  assert.equal(
    classifyApiRuntime({ command: 'node dist/main.js', nodeEnv: 'production', mountCount: 0 }),
    'production',
  );
  // Each production condition is load-bearing on its own.
  assert.notEqual(
    classifyApiRuntime({ command: 'node dist/main.js', nodeEnv: 'development', mountCount: 0 }),
    'production',
  );
  assert.notEqual(
    classifyApiRuntime({ command: 'node dist/main.js', nodeEnv: 'production', mountCount: 1 }),
    'production',
  );
  assert.equal(
    classifyApiRuntime({
      command: 'pnpm --filter @embroidery/api dev',
      nodeEnv: 'development',
      mountCount: 1,
    }),
    'development',
  );
  assert.equal(classifyApiRuntime({ command: '', nodeEnv: '', mountCount: 0 }), 'unknown');
});

test('the override swaps the service alias the gateway actually proxies', () => {
  assert.match(OVERRIDE, new RegExp(`^ {2}${API_SERVICE}:$`, 'm'));
  assert.match(OVERRIDE, new RegExp(`^name: ${DEV_PROJECT}$`, 'm'));
  // The committed gateway configuration resolves this same name.
  const template = readFileSync(
    join(REPO_ROOT, 'infrastructure', 'nginx', 'templates', 'development.conf.template'),
    'utf8',
  );
  assert.match(template, new RegExp(`upstream api_upstream \\{\\s*server ${API_SERVICE}:4000;`));
});

test('the override runs an immutable image with no development sources', () => {
  assert.match(OVERRIDE, /^ {4}image: api:1$/m);
  assert.match(OVERRIDE, /^ {4}build: !reset null$/m);
  assert.match(OVERRIDE, /^ {4}volumes: !reset \[\]$/m);
  assert.match(OVERRIDE, /^ {6}NODE_ENV: production$/m);
});

test('the override satisfies the production guards instead of weakening them', () => {
  // TLS on, and a database that is not the development one.
  assert.match(OVERRIDE, /^ {6}DATABASE_SSL_MODE: require$/m);
  assert.match(OVERRIDE, new RegExp(`^ {6}DATABASE_URL: .*@${PROD_DB_SERVICE}:5432/`, 'm'));
  assert.doesNotMatch(OVERRIDE, /embroidery_dev_password/);
  // The Secure staff cookie production mandates.
  assert.match(OVERRIDE, /^ {6}STAFF_SESSION_COOKIE_SECURE: 'true'$/m);
  // And the guards themselves are untouched in the source tree.
  const dbConfig = readFileSync(
    join(REPO_ROOT, 'packages', 'database', 'src', 'config', 'database-config.ts'),
    'utf8',
  );
  assert.match(dbConfig, /DATABASE_SSL_MODE "disable" is not permitted when NODE_ENV=production/);
  assert.match(dbConfig, /development database password is not permitted when NODE_ENV=production/);
});

test('the disposable database is a pinned base with real TLS', () => {
  const dockerfile = pgDockerfile();
  assert.match(dockerfile, new RegExp(`^FROM ${POSTGRES_BASE_IMAGE.replace('.', '\\.')}$`, 'm'));
  assert.match(dockerfile, /ssl=on/);
  assert.match(dockerfile, /chmod 600 \/var\/lib\/postgresql\/tls\/server\.key/);
  // A key PostgreSQL would refuse, or a certificate that outlives the run, is
  // the difference between real TLS and a green assertion.
  assert.match(dockerfile, /-days 2/);
  assert.equal(buildPgArgs('pg:1', '/tmp/ctx').at(-1), '/tmp/ctx');
  assert.ok(pgImageTag('seed').startsWith(`${PG_IMAGE_PREFIX}:`));
});

test('the development database is read and never written', () => {
  const args = dumpArgs('embroidery-dev-postgres-1');
  assert.ok(args.includes('pg_dump'));
  assert.ok(args.includes('--no-owner'));
  // The restore targets the disposable container, never the development one.
  assert.ok(restoreDumpArgs().includes(PROD_DB_CONTAINER));
  assert.ok(!restoreDumpArgs().includes('embroidery-dev-postgres-1'));
  // Nothing in the harness writes to the development database.
  assert.doesNotMatch(HARNESS, /POSTGRES_CONTAINER[^)]*update |insert |delete /i);
});

test('every scenario statement targets the disposable database only', () => {
  // The scenarios import the disposable container name and nothing else; the
  // development PostgreSQL container is not even in scope for them.
  assert.match(SCENARIOS, /PROD_DB_CONTAINER/);
  assert.doesNotMatch(SCENARIOS, /POSTGRES_CONTAINER/);
});

test('fixture state is never described as a Product command', () => {
  assert.equal(
    fixtureStatusSql('abc', 'PUBLISHED'),
    "update products set status = 'PUBLISHED' where id = 'abc'",
  );
  // A direct status write is a fixture. Calling it publish/unpublish would be
  // the mislabelling this correction exists to remove. Case-sensitive on
  // purpose: `PUBLISHED` is the lifecycle *state* the fixture sets and is fine;
  // a lowercase verb in a result label would be the claim that is not.
  const labels = [...SCENARIOS.matchAll(/record\(\s*'([^']+)'/g)].map((match) => match[1]);
  assert.ok(labels.length > 10, `expected scenario labels, found ${labels.length}`);
  for (const label of labels) {
    assert.doesNotMatch(label, /\b(publish|unpublish)(es|ed|ing)?\b/);
  }
  assert.match(SCENARIOS, /not a publish command/i);
});

test('the temporary override is written outside the repository', () => {
  assert.equal(isOutsideRepository('/tmp/t01c1-abc/production-api.yml', REPO_ROOT), true);
  assert.equal(isOutsideRepository(join(REPO_ROOT, 'production-api.yml'), REPO_ROOT), false);
  assert.match(HARNESS, /mkdtempSync\(join\(tmpdir\(\)/);
});

test('the build context excludes mutable host build output', () => {
  const dockerignore = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8');
  assert.equal(dockerignoreIsolatesBuildOutput(dockerignore), true);
  assert.equal(dockerignoreIsolatesBuildOutput('**/node_modules\n'), false);
});

test('restore always comes from the tracked dev file alone', () => {
  const args = restoreArgs('/repo/.env');
  const files = args.filter((_, index) => args[index - 1] === '-f');
  assert.equal(files.length, 1);
  assert.match(files[0], /docker-compose\.dev\.yml$/);
  assert.ok(args.includes('--force-recreate'));
  assert.ok(args.includes(API_SERVICE));
});

test('restore and cleanup are structural, not conditional on success', () => {
  const plan = cleanupPlan({
    swapped: true,
    imageTag: 'api:1',
    databaseImageTag: 'pg:1',
    envFile: '/repo/.env',
  });
  assert.deepEqual(
    plan.map((entry) => entry.step),
    [
      'restore-dev-api',
      'reload-gateway',
      'remove-database',
      'remove-image',
      'remove-database-image',
    ],
  );
  // Nothing was swapped, so there is nothing to restore — but every temporary
  // artefact is still destroyed.
  const unswapped = cleanupPlan({
    swapped: false,
    imageTag: 'api:1',
    databaseImageTag: 'pg:1',
    envFile: '/e',
  }).map((entry) => entry.step);
  assert.ok(!unswapped.includes('restore-dev-api'));
  assert.ok(unswapped.includes('remove-database'));
  assert.match(HARNESS, /\} finally \{/);
});

test('the cleanup plan executes identically after a simulated failure', () => {
  const executed = [];
  const runPlan = () => {
    try {
      throw new Error('simulated scenario failure');
    } finally {
      for (const { step } of cleanupPlan({
        swapped: true,
        imageTag: 'api:1',
        databaseImageTag: 'pg:1',
        envFile: '/e',
      })) {
        executed.push(step);
      }
    }
  };
  assert.throws(runPlan, /simulated scenario failure/);
  assert.ok(executed.includes('restore-dev-api'));
  assert.ok(executed.includes('remove-database'));
  assert.ok(executed.includes('remove-image'));
  assert.ok(executed.includes('remove-database-image'));
});

test('every wait is bounded', () => {
  assert.ok(Number.isFinite(BUILD_TIMEOUT_MS) && BUILD_TIMEOUT_MS > 0);
  assert.ok(Number.isFinite(Number(WAIT_TIMEOUT_SECONDS)) && Number(WAIT_TIMEOUT_SECONDS) > 0);
  for (const args of [
    swapArgs(['/dev.yml'], '/e'),
    restoreArgs('/e'),
    databaseUpArgs(['/d'], '/e'),
  ]) {
    assert.ok(args.includes('--wait'));
    assert.equal(args[args.indexOf('--wait-timeout') + 1], WAIT_TIMEOUT_SECONDS);
  }
  assert.match(HARNESS, /\{ timeout: BUILD_TIMEOUT_MS \}/);
});

test('the image is built from the canonical production stage', () => {
  const args = buildArgs('x:1');
  assert.equal(args[args.indexOf('--target') + 1], 'runner');
  assert.match(args[args.indexOf('-f') + 1], /api\.Dockerfile$/);
});

test('the gateway is reloaded so it re-resolves the upstream name', () => {
  assert.deepEqual(gatewayReloadArgs(), [
    'exec',
    `${DEV_PROJECT}-gateway-1`,
    'nginx',
    '-s',
    'reload',
  ]);
});

test('temporary image, container and directory removal is complete', () => {
  assert.deepEqual(removeImageArgs('x:1'), ['image', 'rm', '-f', 'x:1']);
  assert.deepEqual(removeDatabaseArgs(), ['rm', '-f', '-v', PROD_DB_CONTAINER]);
  assert.ok(productionImageTag('seed').startsWith(`${IMAGE_PREFIX}:`));
  assert.match(HARNESS, /rmSync\(dir, \{ recursive: true, force: true \}\)/);
  // Residue is verified by asking Docker, not by assuming the plan worked.
  assert.match(FACTS, /reference=\$\{prefix\}/);
  assert.match(HARNESS, /imageIds\(prefix\)/);
  assert.match(HARNESS, /containerIds\(PROD_DB_CONTAINER\)/);
});

test('the generated password never reaches an argument vector', () => {
  const vectors = [
    ...swapArgs(['/dev.yml', '/tmp/override.yml'], '/repo/.env'),
    ...databaseUpArgs(['/dev.yml'], '/repo/.env'),
    ...restoreDumpArgs(),
    ...buildPgArgs('pg:1', '/tmp/ctx'),
  ];
  assert.equal(argsAreCredentialFree(vectors, [FAKE_SECRET]), true);
  assert.equal(argsAreCredentialFree(['--password', FAKE_SECRET], [FAKE_SECRET]), false);
  // It travels in the override file, which is what Compose reads.
  assert.ok(productionDatabaseUrl(FAKE_SECRET).includes(FAKE_SECRET));
  assert.ok(OVERRIDE.includes(FAKE_SECRET));
});

test('every printed line is redacted', () => {
  assert.equal(redactSecrets(`db up with ${FAKE_SECRET}`, [FAKE_SECRET]), 'db up with <redacted>');
  assert.match(HARNESS, /redactSecrets\(/);
  assert.doesNotMatch(HARNESS, /console\.log\([^)]*\$\{databasePassword\}/);
});

test('no operator credential appears anywhere in the harness', () => {
  // Scoped to the harness sources, not to this suite: naming the variable in
  // the assertion would make the check match itself — the same self-match that
  // has already cost this checkpoint two false failures.
  for (const source of [HARNESS, TOPOLOGY, SCENARIOS, FACTS]) {
    assert.doesNotMatch(source, /@gmail\.com/);
    assert.doesNotMatch(source, /SMOKE_ADMIN_/);
    assert.doesNotMatch(source, /cookieJar|Set-Cookie/i);
  }
});

test('an anonymous media request builds no cookie or credential flag', () => {
  const args = requestArgs({ path: '/api/public/products/x/media/y/thumbnail', host: 'h' });
  assert.ok(!args.includes('-b'));
  assert.ok(!args.includes('-c'));
  assert.ok(!args.some((arg) => /Authorization|Cookie/i.test(String(arg))));
});

test('the production log scan is narrow enough to mean something', () => {
  assert.deepEqual(unhandledLogHits('GET /api/public/... 200'), []);
  assert.deepEqual(unhandledLogHits('{"level":"info","msg":"no error here"}'), []);
  assert.deepEqual(unhandledLogHits('ERR_STREAM_PREMATURE_CLOSE thrown'), [
    'ERR_STREAM_PREMATURE_CLOSE',
  ]);
});

test('the correction starts no downstream checkpoint', () => {
  for (const source of [HARNESS, TOPOLOGY, SCENARIOS, FACTS]) {
    for (const forbidden of ['APP2-B04', 'APP2-S01', 'APP2-S02', 'APP2-E01', 'APP2-X01']) {
      assert.doesNotMatch(source, new RegExp(forbidden));
    }
    assert.doesNotMatch(source, /publicProduct_(list|detail)/);
  }
});

test('compose invocations always carry the project env file', () => {
  const args = composeArgs(['/a.yml', '/b.yml'], '/repo/.env');
  assert.deepEqual(args, ['compose', '--env-file', '/repo/.env', '-f', '/a.yml', '-f', '/b.yml']);
});
