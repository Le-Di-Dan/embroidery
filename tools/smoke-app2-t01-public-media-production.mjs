#!/usr/bin/env node
/**
 * `APP2-T01-C1` — real, isolated production-runtime evidence for the public
 * catalog media route (`APP2-T01`).
 *
 * WHY THIS EXISTS
 * ---------------
 * T01 proved the API production build succeeds and then ran its gateway smoke
 * against the ordinary development stack. A green build plus a dev-runtime
 * smoke cannot show production startup, production dependency resolution,
 * production `StreamableFile` behaviour, production object-storage wiring, or
 * gateway-to-production upstream behaviour. This harness closes that gap.
 *
 * ISOLATION MODEL
 * ---------------
 * The production runtime is an ephemeral IMAGE built from the canonical
 * `api.Dockerfile` `runner` stage. `.dockerignore` excludes `**\/node_modules`,
 * `**\/dist` and `**\/.next`, so the compile happens entirely inside image
 * layers: no mutable host build output enters the context. The service swap is
 * a Compose override written to a temp directory and deleted afterwards — no
 * tracked Nginx or Compose file changes. The override targets the SAME Compose
 * project, so the gateway keeps proxying its `api` upstream by service name and
 * that name now resolves to the production container: a gateway proof rather
 * than a host-port proof.
 *
 * WHY A DISPOSABLE DATABASE
 * -------------------------
 * `packages/database` refuses to start under `NODE_ENV=production` with
 * `DATABASE_SSL_MODE=disable`, and refuses the documented development
 * password. Both guards are correct, and neither may be weakened to make a
 * smoke pass — so a genuine production API cannot attach to the development
 * database at all. This run therefore brings up a disposable, TLS-enabled
 * PostgreSQL with a password it generates for itself, loaded with a copy of the
 * development database so `storage_key` values still resolve to objects that
 * really exist in the development MinIO. The developer's PostgreSQL is read
 * once with `pg_dump` and never written; the copy is destroyed at teardown.
 *
 * CREDENTIALS
 * -----------
 * This run needs none. The route under test is anonymous, and the sanctioned
 * `APP2-B03` publish/unpublish commands are unreachable here for a structural
 * reason: a production API mandates a `Secure`, `__Host-` staff cookie, and the
 * development gateway is plain HTTP, so no conforming client can return that
 * cookie. Publication state is therefore arranged as fixture state on the
 * disposable copy, and never described as a Product command. Nothing is read
 * from a repository `.env` (CLAUDE.md §8a, docs/09 §9a); the only secret in
 * play is the password this process generated, which is redacted from output
 * and reaches the containers by file, never by argument.
 *
 *   pnpm smoke:app2-t01-public-media:production
 *
 * The topology this executes — override, restore, reload, classification and
 * teardown — is `smoke-app2-t01-production-topology.mjs`, and the scenarios are
 * `smoke-app2-t01-public-media-scenarios.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  API_CONTAINER,
  BUILD_TIMEOUT_MS,
  DEV_FILE,
  GATEWAY_CONTAINER,
  IMAGE_PREFIX,
  MINIO_CONTAINER,
  PG_IMAGE_PREFIX,
  POSTGRES_CONTAINER,
  PROD_DB_CONTAINER,
  REPO_ROOT,
  argsAreCredentialFree,
  buildArgs,
  buildPgArgs,
  cleanupPlan,
  databaseUpArgs,
  dockerignoreIsolatesBuildOutput,
  dumpArgs,
  gatewayReloadArgs,
  isOutsideRepository,
  pgDockerfile,
  pgImageTag,
  productionImageTag,
  productionOverrideYaml,
  redactSecrets,
  restoreDumpArgs,
  swapArgs,
} from './smoke-app2-t01-production-topology.mjs';
import { createDockerFacts } from './smoke-app2-t01-docker-facts.mjs';

const SCENARIO_SCRIPT = join(REPO_ROOT, 'tools', 'smoke-app2-t01-public-media-scenarios.mjs');

const SECRETS = [];
const results = [];
const { run, apiRuntimeFacts, containerHealth, imageIds, containerIds } =
  createDockerFacts(SECRETS);

function record(label, ok, detail = {}) {
  results.push({ label, ok, detail });
  console.log(
    redactSecrets(`[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`, SECRETS),
  );
}

/** Phases 1–2: the stack this run depends on, and the isolation preconditions. */
function verifyEntryState(overrideFile) {
  const devFacts = apiRuntimeFacts();
  const health = {
    gateway: containerHealth(GATEWAY_CONTAINER),
    postgres: containerHealth(POSTGRES_CONTAINER),
    minio: containerHealth(MINIO_CONTAINER),
  };
  record(
    'development stack healthy at entry',
    Object.values(health).every((state) => state === 'healthy') && devFacts.kind === 'development',
    { ...health, apiRuntime: devFacts.kind, apiImageId: devFacts.imageId },
  );
  record(
    'build context excludes mutable host build output',
    dockerignoreIsolatesBuildOutput(readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8')),
    { excluded: ['**/node_modules', '**/dist'] },
  );
  record(
    'temporary override is outside the repository',
    isOutsideRepository(overrideFile, REPO_ROOT),
    { insideRepo: false },
  );
  return devFacts;
}

/**
 * Phase 3b: the disposable, TLS-enabled database the production runtime needs.
 *
 * It is loaded with a copy of the development database so `storage_key` values
 * resolve to objects that really exist in the development MinIO. `pg_dump` is
 * the only thing this run does to the developer's PostgreSQL, and it reads.
 */
function prepareDatabase({ files, envFile }) {
  const up = run(databaseUpArgs(files, envFile));
  record('disposable TLS database is healthy', up.status === 0, { exit: up.status });
  if (up.status !== 0) {
    console.error(up.stderr.slice(-4000));
    console.error(run(['logs', '--tail', '100', PROD_DB_CONTAINER]).stdout.slice(-4000));
    throw new Error(`disposable database failed to start (${up.status})`);
  }

  const tls = run([
    'exec',
    PROD_DB_CONTAINER,
    'psql',
    '-U',
    'embroidery',
    '-d',
    'embroidery',
    '-tAc',
    'show ssl',
  ]);
  record('the disposable database really serves TLS', tls.stdout.trim() === 'on', {
    ssl: tls.stdout.trim(),
  });

  const dump = spawnSync('docker', dumpArgs(POSTGRES_CONTAINER), {
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
  });
  record('development database read (never written)', dump.status === 0 && dump.stdout.length > 0, {
    exit: dump.status,
    bytes: dump.stdout?.length ?? 0,
  });
  if (dump.status !== 0) throw new Error('pg_dump of the development database failed');

  const restore = spawnSync('docker', restoreDumpArgs(), {
    cwd: REPO_ROOT,
    input: dump.stdout,
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024,
  });
  const restoreStderr = (restore.stderr ?? Buffer.alloc(0)).toString('utf8');
  record('disposable copy loaded', restore.status === 0, {
    exit: restore.status,
    stderr: restoreStderr.slice(-300),
  });
  if (restore.status !== 0) throw new Error('loading the disposable copy failed');
}

/** Phases 4–5: swap the upstream, then re-resolve it in the running gateway. */
function swapUpstream({ overrideFile, envFile, devFacts, files }) {
  const up = run(swapArgs(files, envFile));
  if (up.status !== 0) {
    // A production container that never became healthy is the whole point of
    // this correction: print its own startup output rather than leaving the
    // operator with a bare Compose exit code.
    console.error(up.stderr.slice(-4000));
    console.error(run(['logs', '--tail', '200', API_CONTAINER]).stdout.slice(-8000));
    console.error(run(['logs', '--tail', '200', API_CONTAINER]).stderr.slice(-8000));
  }

  const reload = run(gatewayReloadArgs());
  record('gateway reloaded onto the new upstream address', reload.status === 0, {
    exit: reload.status,
  });

  const facts = apiRuntimeFacts();
  record(
    'gateway upstream is the production API runtime',
    up.status === 0 && facts.kind === 'production',
    {
      upExit: up.status,
      runtime: facts.kind,
      command: facts.command,
      nodeEnv: facts.nodeEnv,
      image: facts.image,
      imageId: facts.imageId,
    },
  );
  record('development source bind mounts are absent', facts.mountCount === 0, {
    mounts: facts.mounts,
    devMounts: devFacts.mounts,
  });
  record('the development API runtime is no longer running', facts.imageId !== devFacts.imageId, {
    devImageId: devFacts.imageId,
    productionImageId: facts.imageId,
  });
  return facts;
}

/**
 * Phase 6: the scenarios, in a child process. The route under test is
 * anonymous, so nothing secret is handed over — the child receives no
 * credential in its arguments and none in its environment.
 */
function runScenarios() {
  const scenarioArgs = [SCENARIO_SCRIPT];
  record('no secret in the scenario arguments', argsAreCredentialFree(scenarioArgs, SECRETS), {
    argc: scenarioArgs.length,
  });
  const scenarios = spawnSync(process.execPath, scenarioArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  console.log(redactSecrets(scenarios.stdout ?? '', SECRETS));
  if (scenarios.stderr) console.error(redactSecrets(scenarios.stderr, SECRETS));
  record('production media scenarios', scenarios.status === 0, { exit: scenarios.status ?? 1 });
}

/** Phases 7–8: restore the developer's stack and remove every temporary artefact. */
function restoreAndCleanup({ swapped, imageTag, databaseImageTag, envFile, dir }) {
  for (const { step, args } of cleanupPlan({ swapped, imageTag, databaseImageTag, envFile })) {
    const res = run(args);
    if (step === 'restore-dev-api') {
      record('dev API restored', res.status === 0, { exit: res.status });
    }
  }
  if (swapped) {
    const restored = apiRuntimeFacts();
    record('restored runtime is the development API', restored.kind === 'development', {
      runtime: restored.kind,
      imageId: restored.imageId,
      mountCount: restored.mountCount,
    });
    record(
      'gateway and API healthy after restore',
      containerHealth(GATEWAY_CONTAINER) === 'healthy' &&
        containerHealth(API_CONTAINER) === 'healthy',
      { gateway: containerHealth(GATEWAY_CONTAINER), api: containerHealth(API_CONTAINER) },
    );
  }
  rmSync(dir, { recursive: true, force: true });
  const images = [IMAGE_PREFIX, PG_IMAGE_PREFIX].flatMap((prefix) => imageIds(prefix));
  const containers = containerIds(PROD_DB_CONTAINER);
  record('no temporary residue', images.length === 0 && containers.length === 0, {
    residualImages: images.length,
    residualContainers: containers.length,
    temporaryDirectoryRemoved: !existsSync(dir),
  });
}

async function main() {
  const seed = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const imageTag = productionImageTag(seed);
  const databaseImageTag = pgImageTag(seed);
  // Generated, used by this run only, and destroyed with the container it
  // belongs to. It is not a rotation of anything: no existing credential is
  // read, replaced or re-seeded. It exists because `packages/database` refuses
  // the documented development password under NODE_ENV=production, correctly.
  const databasePassword = `t01c1${randomBytes(18).toString('hex')}`;
  const dir = mkdtempSync(join(tmpdir(), 't01c1-'));
  const overrideFile = join(dir, 'production-api.yml');
  const pgContextDir = join(dir, 'pg-tls');
  const envFile = join(REPO_ROOT, '.env');
  const files = [DEV_FILE, overrideFile];
  let swapped = false;

  SECRETS.push(databasePassword);
  console.log('== APP2-T01-C1 isolated production public-media smoke ==');

  try {
    const devFacts = verifyEntryState(overrideFile);

    const build = run(buildArgs(imageTag), { timeout: BUILD_TIMEOUT_MS });
    record('production API image built', build.status === 0, { tag: imageTag, exit: build.status });
    if (build.status !== 0) {
      console.error(build.stderr.slice(-4000));
      throw new Error(`production image build failed (${build.status})`);
    }

    mkdirSync(pgContextDir, { recursive: true });
    writeFileSync(join(pgContextDir, 'Dockerfile'), pgDockerfile(), 'utf8');
    const pgBuild = run(buildPgArgs(databaseImageTag, pgContextDir), { timeout: BUILD_TIMEOUT_MS });
    record('disposable TLS database image built', pgBuild.status === 0, {
      tag: databaseImageTag,
      exit: pgBuild.status,
    });
    if (pgBuild.status !== 0) {
      console.error(pgBuild.stderr.slice(-4000));
      throw new Error(`disposable database image build failed (${pgBuild.status})`);
    }

    // The override is written once and serves both the database and the swap.
    writeFileSync(
      overrideFile,
      productionOverrideYaml({ imageTag, databaseImageTag, databasePassword }),
      'utf8',
    );
    record(
      'the generated password never reaches a command line',
      argsAreCredentialFree(
        [...swapArgs(files, envFile), ...buildPgArgs(databaseImageTag, pgContextDir)],
        SECRETS,
      ),
      { channel: 'compose override file → container environment' },
    );

    prepareDatabase({ files, envFile });

    swapped = true;
    const prodFacts = swapUpstream({ overrideFile, envFile, devFacts, files });
    if (prodFacts.kind !== 'production') {
      throw new Error('the api service is not the production runtime; refusing to smoke');
    }

    runScenarios();
  } finally {
    // Restore and cleanup are structural: they run after success AND failure,
    // driven by the same plan the Docker-free tests assert against.
    restoreAndCleanup({ swapped, imageTag, databaseImageTag, envFile, dir });
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
