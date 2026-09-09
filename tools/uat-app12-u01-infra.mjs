#!/usr/bin/env node
/**
 * `APP12-U01` disposable-world **infrastructure** CLI — everything that talks to
 * Docker.
 *
 * Split from the long-lived world process on purpose. The world has to outlive
 * many separate driver turns (business UAT is worked by an operator and a
 * customer over hours, not in one test run), and the only process able to run
 * that long in this environment cannot reach the Docker socket. So the two
 * concerns are separated by capability rather than by taste: containers here,
 * host processes and the in-process worker in `uat-app12-u01-world.mjs`.
 *
 * ```text
 * up        ephemeral postgres + minio, clone the shared DB and object store
 * gateway   the real Nginx edge (after the host apps are listening)
 * down      drop the disposable database and the whole Compose project
 * ```
 *
 * `up` writes a run descriptor to `U01_RUN_FILE`, which the world process reads.
 * The shared development world is opened read-only, and only by `pg_dump` and by
 * the object-store lister.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
  composeEnv,
  createRunId,
  loadE2EConfig,
} from '../packages/e2e-testing/support/orchestration/config.mjs';
import {
  assertDockerAvailable,
  composeDown,
  composeUp,
  waitForHealthy,
} from '../packages/e2e-testing/support/orchestration/docker.mjs';
import {
  assertPortsFree,
  httpGetWithHost,
  waitForHttp,
  waitForPort,
} from '../packages/e2e-testing/support/orchestration/net.mjs';
import {
  assertDisposableTarget,
  cloneDatabase,
  cloneObjectStore,
  composeContainerId,
} from './uat-app12-u01-clone.mjs';

/** The shared development stack this run derives from, and never writes to. */
const SHARED = Object.freeze({
  container: 'embroidery-dev-postgres-1',
  minioContainer: 'embroidery-dev-minio-1',
  user: 'embroidery',
  database: 'embroidery',
  originalsBucket: 'embroidery-dev-originals',
  derivativesBucket: 'embroidery-dev-derivatives',
});

/** Loopback port the copy reaches the shared MinIO on, for the copy only. */
const BRIDGE_PORT = 9600;

function log(message) {
  process.stdout.write(`[u01-infra] ${message}\n`);
}

function runFile() {
  const path = process.env['U01_RUN_FILE'];
  if (path === undefined) throw new Error('U01_RUN_FILE must name the run descriptor path.');
  return path;
}

/**
 * The shared MinIO's own login, read out of the running dev API container.
 *
 * It is that container's configuration, it stays in this process's memory, and
 * it is never printed, logged or written to the descriptor.
 */
function sharedStorageCredentials() {
  const result = spawnSync('docker', ['exec', 'embroidery-dev-api-1', 'env'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error('Could not read the shared stack object-storage configuration.');
  }
  const values = new Map(
    result.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  const accessKeyId = values.get('OBJECT_STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = values.get('OBJECT_STORAGE_SECRET_ACCESS_KEY');
  if (accessKeyId === undefined || secretAccessKey === undefined) {
    throw new Error('The shared API container publishes no object-storage credentials.');
  }
  return { accessKeyId, secretAccessKey };
}

/**
 * Publishes the shared MinIO on loopback for the duration of the copy.
 *
 * The development MinIO deliberately publishes no host port (`APP2-I03`) and
 * this run must not change that, so a throwaway `socat` container on the dev
 * network forwards it, and is removed the moment the copy is done.
 */
function bridgeName(runId) {
  return `emb-u01-${runId}-shared-minio-bridge`;
}

async function startBridge(runId) {
  const network = String(
    spawnSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}',
        SHARED.minioContainer,
      ],
      { encoding: 'utf8' },
    ).stdout,
  ).trim();
  spawnSync('docker', ['rm', '-f', bridgeName(runId)], { stdio: 'ignore' });
  const started = spawnSync('docker', [
    'run',
    '-d',
    '--name',
    bridgeName(runId),
    '--network',
    network,
    '-p',
    `127.0.0.1:${String(BRIDGE_PORT)}:9000`,
    'alpine/socat:1.8.0.0',
    'TCP-LISTEN:9000,fork,reuseaddr',
    'TCP:minio:9000',
  ]);
  if (started.status !== 0) {
    throw new Error(`Could not bridge the shared MinIO: ${String(started.stderr)}`);
  }
  await waitForPort(BRIDGE_PORT, { label: 'shared minio bridge', timeoutMs: 60_000 });
  return `http://127.0.0.1:${String(BRIDGE_PORT)}`;
}

async function up() {
  const runId = createRunId();
  const config = loadE2EConfig();
  const projectName = `emb-u01-${runId}`;
  const cEnv = composeEnv(config);
  const databaseName = assertDisposableTarget(`embroidery_db7_u01_${runId}`);

  await assertDockerAvailable();
  await assertPortsFree([
    { port: config.ports.postgres, label: 'postgres' },
    { port: config.ports.api, label: 'api' },
    { port: config.ports.storefront, label: 'storefront' },
    { port: config.ports.admin, label: 'admin' },
    { port: config.ports.gateway, label: 'gateway' },
    { port: config.ports.minio, label: 'minio' },
  ]);

  log('starting ephemeral postgres and minio (both tmpfs)');
  await composeUp({
    projectName,
    file: config.composeFile,
    services: ['postgres', 'minio'],
    env: cEnv,
  });
  await waitForPort(config.ports.postgres, { label: 'postgres', timeoutMs: 120_000 });
  await waitForHealthy({ projectName, file: config.composeFile, service: 'postgres', env: cEnv });
  await waitForPort(config.ports.minio, { label: 'minio', timeoutMs: 120_000 });
  await waitForHealthy({ projectName, file: config.composeFile, service: 'minio', env: cEnv });

  const postgresContainer = await composeContainerId({
    projectName,
    file: config.composeFile,
    service: 'postgres',
    env: cEnv,
  });
  const clone = await cloneDatabase({
    sourceContainer: SHARED.container,
    sourceUser: SHARED.user,
    sourceDatabase: SHARED.database,
    targetContainer: postgresContainer,
    targetUser: config.db.user,
    targetDatabase: databaseName,
    log,
  });

  const sourceEndpoint = await startBridge(runId);
  let objects;
  try {
    objects = await cloneObjectStore({
      source: { endpoint: sourceEndpoint, ...sharedStorageCredentials() },
      target: {
        endpoint: config.storage.endpoint,
        accessKeyId: config.storage.accessKeyId,
        secretAccessKey: config.storage.secretAccessKey,
      },
      buckets: [
        { from: SHARED.originalsBucket, to: config.storage.originalsBucket },
        { from: SHARED.derivativesBucket, to: config.storage.derivativesBucket },
      ],
      log,
    });
  } finally {
    spawnSync('docker', ['rm', '-f', bridgeName(runId)], { stdio: 'ignore' });
  }

  const descriptor = {
    runId,
    projectName,
    databaseName,
    postgresContainer,
    dumpBytes: clone.bytes,
    objects,
    ports: config.ports,
    hosts: config.hosts,
    baseUrls: config.baseUrls,
  };
  writeFileSync(runFile(), JSON.stringify(descriptor, null, 2), 'utf8');
  log(`descriptor written; database ${databaseName}`);
  process.stdout.write(`U01_INFRA_READY ${JSON.stringify(descriptor)}\n`);
}

async function gateway() {
  const config = loadE2EConfig();
  const { projectName } = JSON.parse(readFileSync(runFile(), 'utf8'));
  const cEnv = composeEnv(config);
  log('starting the real Nginx gateway');
  await composeUp({ projectName, file: config.composeFile, services: ['gateway'], env: cEnv });
  await waitForHttp(`http://localhost:${String(config.ports.gateway)}/gateway/healthz`, {
    label: 'gateway self-health',
    timeoutMs: 60_000,
  });
  for (const host of [config.hosts.storefront, config.hosts.admin]) {
    const routed = await httpGetWithHost(config.ports.gateway, '/healthz', host);
    if (routed.status !== 200) {
      throw new Error(`Gateway did not route ${host}/healthz (${String(routed.status)}).`);
    }
    log(`gateway routes ${host} -> 200`);
  }
  process.stdout.write('U01_GATEWAY_READY\n');
}

async function down() {
  const config = loadE2EConfig();
  const descriptor = JSON.parse(readFileSync(runFile(), 'utf8'));
  const cEnv = composeEnv(config);
  const drop = spawnSync(
    'docker',
    [
      'exec',
      descriptor.postgresContainer,
      'psql',
      '-U',
      config.db.user,
      '-d',
      'postgres',
      '-c',
      `drop database if exists ${descriptor.databaseName} with (force)`,
    ],
    { encoding: 'utf8' },
  );
  log(`drop database: ${drop.status === 0 ? 'ok' : String(drop.stderr).trim()}`);
  spawnSync('docker', ['rm', '-f', bridgeName(descriptor.runId)], { stdio: 'ignore' });
  await composeDown({ projectName: descriptor.projectName, file: config.composeFile, env: cEnv });
  log('compose project removed with its volumes');
  const remaining = spawnSync(
    'docker',
    ['ps', '-a', '--filter', `name=${descriptor.projectName}`, '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  process.stdout.write(
    `U01_INFRA_DOWN ${JSON.stringify({
      database: descriptor.databaseName,
      residualContainers: String(remaining.stdout).trim().split(/\r?\n/).filter(Boolean),
    })}\n`,
  );
}

const COMMANDS = { up, gateway, down };
const command = COMMANDS[process.argv[2] ?? ''];
if (command === undefined) {
  process.stderr.write(`usage: uat-app12-u01-infra.mjs <${Object.keys(COMMANDS).join('|')}>\n`);
  process.exitCode = 1;
} else {
  command().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
