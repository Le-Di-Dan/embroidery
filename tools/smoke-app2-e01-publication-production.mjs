#!/usr/bin/env node
/**
 * `APP2-E01` — the complete publication journey across every production layer.
 *
 *   Admin login → upload → worker inspection → draft → media + price →
 *   readiness → publish → Discover → Product Detail → unpublish → revocation →
 *   republish → final unpublish
 *
 * WHY THIS EXISTS
 * ---------------
 * Every APP2 checkpoint proved its own slice against a production runtime, but
 * always with the neighbouring layers left in development. `APP2-A04-C1` could
 * not even log into a production Admin, because the API refuses to start in
 * production without a `Secure` staff cookie and the tracked gateway speaks only
 * HTTP. This run closes that: it terminates TLS at the gateway for the duration
 * of the journey, from a certificate generated into a temporary directory and
 * destroyed with the run, so a real browser performs a real login and the
 * browser itself returns the cookie.
 *
 * ISOLATION
 * ---------
 * Disposable TLS PostgreSQL, disposable MinIO, production API, worker, Admin and
 * Storefront images built from the canonical `runner` stages, all behind the real
 * gateway. The shared development database and object store are never written.
 * No tracked Nginx or Compose file changes — every override lives in a temporary
 * directory that `finally` deletes.
 *
 * CREDENTIALS
 * -----------
 * The staff identity and the storage keys are generated for this run, reach the
 * containers only through a Compose override file or `docker exec --env`, are
 * never placed on a command line, never printed, and are redacted from every
 * line this tool emits. Nothing is read from the repository `.env` (CLAUDE.md
 * §8a).
 *
 *   pnpm smoke:app2-e01-publication:production
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { createDockerFacts } from './smoke-app2-t01-docker-facts.mjs';
import {
  BUILD_TIMEOUT_MS,
  DEV_FILE,
  REPO_ROOT,
  argsAreCredentialFree,
  buildArgs,
  buildPgArgs,
  POSTGRES_CONTAINER,
  databaseUpArgs,
  dumpArgs,
  restoreDumpArgs,
  pgDockerfile,
  pgImageTag,
  productionDatabaseUrl,
  productionImageTag,
  productionOverrideYaml,
  redactSecrets,
  swapArgs,
} from './smoke-app2-t01-production-topology.mjs';
import {
  buildStorefrontArgs,
  storefrontImageTag,
  storefrontOverrideYaml,
  swapStorefrontArgs,
} from './smoke-app2-s01-storefront-topology.mjs';
import {
  ADMIN_SERVICE,
  WORKER_SERVICE,
  adminImageTag,
  apiOriginEnvYaml,
  apiStorageEnvYaml,
  buildAdminArgs,
  buildWorkerArgs,
  e01OverrideYaml,
  removeStorageArgs,
  restoreArgs,
  storageUpArgs,
  swapAdminArgs,
  swapWorkerArgs,
  workerImageTag,
} from './smoke-app2-e01-topology.mjs';
import {
  ADMIN_HTTPS_BASE,
  GATEWAY_STOREFRONT_HOST,
  gatewayTlsOverrideYaml,
  gatewayUpArgs,
  generateCertificate,
  writeTlsTemplate,
} from './smoke-app2-e01-tls.mjs';
import { runJourney } from './smoke-app2-e01-journey.mjs';

const SECRETS = [];
const results = [];
const docker = createDockerFacts(SECRETS);

function record(label, ok, detail = {}) {
  results.push({ label, ok, detail });
  console.log(
    redactSecrets(`[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`, SECRETS),
  );
}

function buildImages(tags, pgContextDir) {
  const builds = [
    ['production API image', buildArgs(tags.api)],
    ['production Admin image', buildAdminArgs(tags.admin)],
    ['production worker image', buildWorkerArgs(tags.worker)],
    ['production Storefront image', buildStorefrontArgs(tags.storefront)],
  ];
  for (const [label, args] of builds) {
    const result = docker.run(args, { timeout: BUILD_TIMEOUT_MS });
    record(`${label} built from the canonical runner stage`, result.status === 0, {
      exit: result.status,
    });
    if (result.status !== 0) {
      console.error(result.stderr.slice(-6000));
      throw new Error(`${label} build failed (${result.status})`);
    }
  }

  mkdirSync(pgContextDir, { recursive: true });
  writeFileSync(join(pgContextDir, 'Dockerfile'), pgDockerfile(), 'utf8');
  const pg = docker.run(buildPgArgs(tags.database, pgContextDir), { timeout: BUILD_TIMEOUT_MS });
  record('disposable TLS database image built', pg.status === 0, { exit: pg.status });
  if (pg.status !== 0) throw new Error(`disposable database image build failed (${pg.status})`);
}

async function main() {
  const seed = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const tags = {
    api: productionImageTag(seed),
    admin: adminImageTag(seed),
    worker: workerImageTag(seed),
    storefront: storefrontImageTag(seed),
    database: pgImageTag(seed),
  };

  // Generated for this run's throwaway containers and destroyed with them. Not
  // a rotation: no existing credential is read, replaced or re-seeded.
  const databasePassword = `e01${randomBytes(18).toString('hex')}`;
  const storageAccessKey = `e01${randomBytes(8).toString('hex')}`;
  const storageSecretKey = `e01${randomBytes(24).toString('hex')}`;
  const staffPassword = `E01!${randomBytes(18).toString('hex')}`;
  const staffEmail = `e01-${seed}@example.test`;
  SECRETS.push(databasePassword, storageSecretKey, storageAccessKey, staffPassword);

  const dir = mkdtempSync(join(tmpdir(), 'e01-'));
  const certDir = join(dir, 'tls');
  const pgContextDir = join(dir, 'pg-tls');
  const overrideFile = join(dir, 'e01-production.yml');
  const envFile = join(REPO_ROOT, '.env');
  const files = [DEV_FILE, overrideFile];
  const swapped = { api: false, admin: false, worker: false, storefront: false, gateway: false };

  console.log('== APP2-E01 isolated production publication journey ==');

  try {
    const entry = docker.run(['ps', '--format', '{{.Names}}']);
    record('entry topology observed', entry.status === 0, {});

    buildImages(tags, pgContextDir);

    mkdirSync(certDir, { recursive: true });
    const cert = generateCertificate(certDir);
    record(
      'ephemeral TLS certificate generated into the temporary directory',
      {
        ok: cert.certPath.startsWith(dir),
      }.ok,
      { insideTempDir: true, tracked: false },
    );
    const templatePath = writeTlsTemplate(dir);

    writeFileSync(
      overrideFile,
      productionOverrideYaml({
        imageTag: tags.api,
        databaseImageTag: tags.database,
        databasePassword,
      }) +
        apiStorageEnvYaml(storageAccessKey, storageSecretKey) +
        apiOriginEnvYaml(ADMIN_HTTPS_BASE) +
        storefrontOverrideYaml(tags.storefront) +
        e01OverrideYaml({
          adminTag: tags.admin,
          workerTag: tags.worker,
          databaseUrl: productionDatabaseUrl(databasePassword),
          storageAccessKey,
          storageSecretKey,
        }) +
        gatewayTlsOverrideYaml({ certDir, templatePath }),
      'utf8',
    );

    record(
      'no generated credential reaches a command line',
      argsAreCredentialFree(
        [
          ...swapArgs(files, envFile),
          ...swapAdminArgs(files, envFile),
          ...swapWorkerArgs(files, envFile),
          ...swapStorefrontArgs(files, envFile),
          ...databaseUpArgs(files, envFile),
          ...storageUpArgs(files, envFile),
          ...gatewayUpArgs(files, envFile),
        ],
        SECRETS,
      ),
      { channel: 'compose override file → container environment' },
    );

    // --- disposable data plane ------------------------------------------------
    for (const [label, args] of [
      ['disposable TLS database', databaseUpArgs(files, envFile)],
      ['disposable private object store', storageUpArgs(files, envFile)],
    ]) {
      const up = docker.run(args);
      record(`${label} is healthy`, up.status === 0, { exit: up.status });
      if (up.status !== 0) {
        console.error(up.stderr.slice(-4000));
        throw new Error(`${label} failed to start`);
      }
    }

    // The disposable copy takes its **structure** from a read-only `pg_dump
    // --schema-only` of the development database — all 33 migrations, and not a
    // single row. Then exactly two migration-owned prerequisites are copied in:
    // the fixed categories and the `worker.runtime` policy.
    //
    // Schema-only rather than a full dump because a full one carries the
    // developer's own admin account, assets and products. Those cannot simply be
    // removed afterwards — `audit_events` holds a foreign key to that admin and
    // frozen evidence rows refuse `DELETE` outright — and more to the point, a
    // journey that must prove it *creates* an Asset and a Product should not
    // begin with somebody else's.
    const loadStep = (label, dumpFlags) => {
      const dumped = spawnSync('docker', [...dumpArgs(POSTGRES_CONTAINER), ...dumpFlags], {
        cwd: REPO_ROOT,
        maxBuffer: 512 * 1024 * 1024,
      });
      if (dumped.status !== 0) {
        console.error(String(dumped.stderr).slice(-2000));
        throw new Error(`${label}: pg_dump failed`);
      }
      const loaded = spawnSync('docker', restoreDumpArgs(), {
        cwd: REPO_ROOT,
        input: dumped.stdout,
        encoding: 'buffer',
        maxBuffer: 512 * 1024 * 1024,
      });
      if (loaded.status !== 0) {
        console.error(String(loaded.stderr).slice(-3000));
        throw new Error(`${label}: restore failed`);
      }
      record(label, true, { bytes: dumped.stdout.length });
    };

    loadStep('development schema read (never written) and loaded', ['--schema-only']);
    loadStep('migration-owned prerequisites copied (categories + worker policy)', [
      '--data-only',
      '--disable-triggers',
      '--table=categories',
      '--table=policy_configurations',
      '--table=policy_configuration_versions',
    ]);

    // --- production runtimes --------------------------------------------------
    for (const [key, label, args] of [
      ['api', 'production API', swapArgs(files, envFile)],
      ['worker', 'production worker', swapWorkerArgs(files, envFile)],
      ['admin', 'production Admin', swapAdminArgs(files, envFile)],
      ['storefront', 'production Storefront', swapStorefrontArgs(files, envFile)],
      ['gateway', 'gateway with the temporary TLS listener', gatewayUpArgs(files, envFile)],
    ]) {
      swapped[key] = true;
      const up = docker.run(args);
      record(`${label} started`, up.status === 0, { exit: up.status });
      if (up.status !== 0) {
        console.error(up.stderr.slice(-6000));
        throw new Error(`${label} failed to start`);
      }
    }

    await runJourney({
      record,
      docker,
      adminBaseUrl: ADMIN_HTTPS_BASE,
      storefrontBaseUrl: `http://${GATEWAY_STOREFRONT_HOST}`,
      staff: { email: staffEmail, password: staffPassword, displayName: 'E01 Operator' },
      fixtureDir: dir,
      runId: randomUUID(),
    });
  } finally {
    // --- restore and destroy --------------------------------------------------
    for (const [key, service] of [
      ['storefront', 'storefront'],
      ['admin', ADMIN_SERVICE],
      ['worker', WORKER_SERVICE],
      ['api', 'api'],
    ]) {
      if (!swapped[key]) continue;
      const restored = docker.run(restoreArgs(envFile, service));
      record(`development ${service} restored`, restored.status === 0, { exit: restored.status });
    }
    if (swapped.gateway) {
      const gateway = docker.run(restoreArgs(envFile, 'gateway'));
      record('development gateway restored without the TLS listener', gateway.status === 0, {
        exit: gateway.status,
      });
    }

    docker.run(removeStorageArgs(files, envFile));
    docker.run([
      'compose',
      '-p',
      'embroidery-dev',
      '-f',
      DEV_FILE,
      '-f',
      overrideFile,
      '--env-file',
      envFile,
      'rm',
      '-fsv',
      'api-db-t01c1',
    ]);
    for (const tag of Object.values(tags)) docker.run(['image', 'rm', '-f', tag]);
    rmSync(dir, { recursive: true, force: true });

    const residualImages = docker
      .run(['images', '--format', '{{.Repository}}:{{.Tag}}'])
      .stdout.split('\n')
      .filter((line) => line.includes('e01') || line.includes('t01c1')).length;
    const residualContainers = docker
      .run(['ps', '-a', '--format', '{{.Names}}'])
      .stdout.split('\n')
      .filter((line) => line.includes('e01') || line.includes('t01c1')).length;
    record('no temporary residue', residualImages === 0 && residualContainers === 0, {
      residualImages,
      residualContainers,
      temporaryDirectoryRemoved: true,
    });
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
