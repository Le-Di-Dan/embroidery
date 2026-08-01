#!/usr/bin/env node
/**
 * `APP2-B04` §23.1 — isolated production-runtime evidence for the two public
 * catalog queries.
 *
 * An API build plus a development-gateway smoke does not establish production
 * startup, production dependency resolution, production serialisation or
 * gateway-to-production behaviour. `APP2-T01-C1` established that the hard way,
 * finding a production image that could not start at all. B04 therefore runs
 * the same proof for its own operations.
 *
 * The topology is the accepted `APP2-T01-C1` one, imported rather than
 * reimplemented: the same canonical `api.Dockerfile` runner image, the same
 * temporary Compose override, the same disposable TLS PostgreSQL (a production
 * API may not attach to the development database — the TLS and password guards
 * correctly forbid it), the same private MinIO, the same bounded waits, the
 * same structural `finally` restore, and the same gateway reload after both the
 * swap and the restore. Nothing about that topology is redefined here; only the
 * scenarios differ.
 *
 * No credential is used. Both operations under test are anonymous, and the
 * production Secure-cookie guard makes authenticated Admin commands unreachable
 * over the plain-HTTP development gateway — so lifecycle state is arranged as
 * fixture setup inside the disposable copy and is never called a command.
 *
 *   pnpm smoke:app2-b04-public-catalog:production
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

const SCENARIO_SCRIPT = join(REPO_ROOT, 'tools', 'smoke-app2-b04-public-catalog-scenarios.mjs');

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

/** The disposable, TLS-enabled database the production runtime requires. */
function prepareDatabase({ files, envFile }) {
  const up = run(databaseUpArgs(files, envFile));
  record('disposable TLS database is healthy', up.status === 0, { exit: up.status });
  if (up.status !== 0) {
    console.error(up.stderr.slice(-4000));
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
  record('disposable copy loaded', restore.status === 0, { exit: restore.status });
  if (restore.status !== 0) throw new Error('loading the disposable copy failed');
}

/** Swap the upstream, then re-resolve it in the running gateway. */
function swapUpstream({ envFile, devFacts, files }) {
  const up = run(swapArgs(files, envFile));
  if (up.status !== 0) {
    console.error(up.stderr.slice(-4000));
    console.error(run(['logs', '--tail', '200', API_CONTAINER]).stdout.slice(-8000));
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

/** The scenarios, in a child process. Nothing secret is handed over. */
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
  record('production catalog scenarios', scenarios.status === 0, { exit: scenarios.status ?? 1 });
}

/** Restore the developer's stack and remove every temporary artefact. */
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
  // Generated for this run's throwaway container and destroyed with it. Not a
  // rotation: no existing credential is read, replaced or re-seeded.
  const databasePassword = `b04${randomBytes(18).toString('hex')}`;
  const dir = mkdtempSync(join(tmpdir(), 'b04-'));
  const overrideFile = join(dir, 'production-api.yml');
  const pgContextDir = join(dir, 'pg-tls');
  const envFile = join(REPO_ROOT, '.env');
  const files = [DEV_FILE, overrideFile];
  let swapped = false;

  SECRETS.push(databasePassword);
  console.log('== APP2-B04 isolated production public-catalog smoke ==');

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
    record('disposable TLS database image built', pgBuild.status === 0, { exit: pgBuild.status });
    if (pgBuild.status !== 0) {
      console.error(pgBuild.stderr.slice(-4000));
      throw new Error(`disposable database image build failed (${pgBuild.status})`);
    }

    writeFileSync(
      overrideFile,
      productionOverrideYaml({ imageTag, databaseImageTag, databasePassword }),
      'utf8',
    );
    record(
      'the generated password never reaches a command line',
      argsAreCredentialFree(
        [...swapArgs(files, envFile), ...databaseUpArgs(files, envFile)],
        SECRETS,
      ),
      { channel: 'compose override file → container environment' },
    );

    prepareDatabase({ files, envFile });

    swapped = true;
    const prodFacts = swapUpstream({ envFile, devFacts, files });
    if (prodFacts.kind !== 'production') {
      throw new Error('the api service is not the production runtime; refusing to smoke');
    }

    runScenarios();
  } finally {
    restoreAndCleanup({ swapped, imageTag, databaseImageTag, envFile, dir });
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
