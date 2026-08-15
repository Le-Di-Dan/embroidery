/**
 * The single canonical E2E environment owner. Nothing else — and no Playwright
 * spec — may start a process, a container, or a database. It provisions the
 * disposable database (canonical harness), starts the API and both Next apps as
 * host processes from built artifacts, brings up the real Nginx gateway, and
 * registers every teardown on one LIFO `CleanupStack` so failures at any stage
 * unwind cleanly.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { CleanupStack } from './cleanup-stack.mjs';
import { composeEnv } from './config.mjs';
import { assertDockerAvailable, composeDown, composeUp, waitForHealthy } from './docker.mjs';
import { provisionDisposableDatabase, proveSchemaBaseline } from './database.mjs';
import { startProcess } from './processes.mjs';
import { createApiService } from './api-service.mjs';
import { startApiControlServer } from './api-control-server.mjs';
import { redactUrl } from './redact.mjs';
import { assertPortsFree, httpGetWithHost, waitForHttp, waitForPort } from './net.mjs';

function resolveNextBin(appDir) {
  const require = createRequire(join(appDir, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

/**
 * Fault-injection seam for the required failure-path proof. Set `E2E_FAULT` to a
 * stage name (e.g. `after-db`, `after-api`) to force a mid-setup failure and
 * exercise the cleanup unwind against a real environment. Never triggers in
 * normal runs.
 */
function maybeFault(stage) {
  if (process.env['E2E_FAULT'] === stage) {
    throw new Error(`Injected fault at stage "${stage}" (E2E_FAULT).`);
  }
}

/**
 * Runs the canonical staff-bootstrap CLI (ADR-APP1-001 §8) once against the
 * disposable database to seed the single Admin the cross-layer suite logs in as.
 * It uses the accepted create-or-reuse mechanism exactly as Compose does — no
 * test-only seeding path — under `NODE_ENV=test` (the strict development policy),
 * and asserts the machine-parseable `result=CREATED` line. Credentials come from
 * the caller and are passed only through the child's environment; nothing is
 * logged (only the status and admin id).
 * @param {{ config: object, databaseUrl: string, credentials: { email: string, password: string, displayName: string }, log: (msg: string) => void }} params
 */
export async function bootstrapAdmin({ config, databaseUrl, credentials, log, extraEnv = {} }) {
  const cliPath = join(config.repoRoot, 'apps', 'api', 'dist', 'cli', 'staff-bootstrap.js');
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: join(config.repoRoot, 'apps', 'api'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        DATABASE_SSL_MODE: 'disable',
        API_DOCS_ENABLED: 'false',
        STAFF_BOOTSTRAP_EMAIL: credentials.email,
        STAFF_BOOTSTRAP_PASSWORD: credentials.password,
        STAFF_BOOTSTRAP_DISPLAY_NAME: credentials.displayName,
        // This CLI creates a full `AppModule` context, so everything AppModule
        // needs in order to be *constructed*, it needs too — the object-storage
        // block below, APP3's Design pepper and the APP4 secret material in
        // `extraEnv`. Compose's own `staff-bootstrap` service carries the same
        // blocks for the same reason. Constructing the S3 client opens no
        // socket, so pointing at this run's MinIO costs nothing here.
        OBJECT_STORAGE_PROVIDER: 's3',
        OBJECT_STORAGE_ENDPOINT: config.storage.endpoint,
        OBJECT_STORAGE_REGION: 'us-east-1',
        OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
        OBJECT_STORAGE_ACCESS_KEY_ID: config.storage.accessKeyId,
        OBJECT_STORAGE_SECRET_ACCESS_KEY: config.storage.secretAccessKey,
        OBJECT_STORAGE_ORIGINALS_BUCKET: config.storage.originalsBucket,
        OBJECT_STORAGE_DERIVATIVES_BUCKET: config.storage.derivativesBucket,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    child.stderr.on('data', (chunk) => (out += chunk.toString()));
    child.once('error', reject);
    child.once('exit', (code) => {
      const match = out.match(/result=([A-Z_]+)/);
      const status = match?.[1] ?? 'UNKNOWN';
      if (code === 0 && (status === 'CREATED' || status === 'REUSED_EXISTING')) {
        log(`admin bootstrap ${status}`);
        resolve(status);
      } else {
        // Include the child's own output, or the failure is unactionable: the
        // CLI boots a full AppModule and its refusals are configuration
        // messages. The password is redacted first — the CLI never prints it,
        // and this guarantees a future one could not either.
        const safeOutput = out.split(credentials.password).join('***').trim().slice(-1200);
        reject(
          new Error(
            `Admin bootstrap failed (exit ${code}, status ${status}).\nbootstrap output:\n${safeOutput}`,
          ),
        );
      }
    });
  });
}

/**
 * Starts the full environment. On success returns handles plus the populated
 * `cleanup` stack for the caller to run in its own `finally`. On any failure it
 * unwinds everything started so far and rethrows.
 *
 * When `withAdmin` credentials are supplied (the APP1-E01 cross-layer suite),
 * the disposable database is seeded with one bootstrap Admin and the API is
 * configured with the staff-auth environment (allowed browser origins, non-secure
 * dev cookie) and the Admin app with its internal API base URL, so real staff
 * login, session and logout journeys run end-to-end through the gateway.
 * @param {{ runId: string, config: object, log: (msg: string) => void, withAdmin?: { email: string, password: string, displayName: string } }} params
 */
export async function startEnvironment({ runId, config, log, withAdmin, withApp4 }) {
  const cleanup = new CleanupStack();
  const projectName = `emb-e2e-${runId}`;
  const cEnv = composeEnv(config);
  // Browser origins the API must accept for state-changing staff requests
  // (ADR-APP1-001 §6): the gateway hostname on both the host-published and the
  // Compose-internal gateway ports, so login works from either runner.
  const adminOrigins = [
    `http://${config.hosts.admin}:${config.ports.gateway}`,
    `http://${config.hosts.admin}:8080`,
  ].join(',');

  try {
    await assertDockerAvailable();
    await assertPortsFree([
      { port: config.ports.postgres, label: 'postgres' },
      { port: config.ports.api, label: 'api' },
      { port: config.ports.storefront, label: 'storefront' },
      { port: config.ports.admin, label: 'admin' },
      { port: config.ports.gateway, label: 'gateway' },
      { port: config.ports.minio, label: 'minio' },
    ]);

    // 1. Ephemeral PostgreSQL and MinIO (both tmpfs) — cleanup drops the whole
    //    compose project. MinIO is started here because the API verifies its
    //    private buckets before it listens (APP2-I03); the API's own bootstrap
    //    still owns whether those buckets exist.
    log('starting ephemeral postgres and minio');
    await composeUp({
      projectName,
      file: config.composeFile,
      services: ['postgres', 'minio'],
      env: cEnv,
    });
    cleanup.push('compose down', () =>
      composeDown({ projectName, file: config.composeFile, env: cEnv }),
    );
    await waitForPort(config.ports.postgres, { label: 'postgres', timeoutMs: 60_000 });
    await waitForHealthy({ projectName, file: config.composeFile, service: 'postgres', env: cEnv });
    await waitForPort(config.ports.minio, { label: 'minio', timeoutMs: 60_000 });
    await waitForHealthy({ projectName, file: config.composeFile, service: 'minio', env: cEnv });

    // 2. Disposable database via the canonical DB7/T01 harness.
    log('provisioning disposable database');
    process.env['DATABASE_URL'] = config.db.baseDatabaseUrl;
    process.env['DATABASE_SSL_MODE'] = 'disable';
    const database = await provisionDisposableDatabase(`e2e_${runId}`);
    cleanup.push('drop disposable database', () => database.drop());
    log(`disposable database ${database.name} @ ${redactUrl(database.url)}`);

    // 3. Schema baseline proof (tables + fingerprint).
    const schema = await proveSchemaBaseline(database.url);
    if (!schema.passed) {
      throw new Error('Disposable database failed the schema-baseline verification.');
    }
    maybeFault('after-db');

    // 3b. Seed the single bootstrap Admin (E01 only) via the accepted CLI.
    if (withAdmin !== undefined) {
      log('bootstrapping admin');
      await bootstrapAdmin({
        config,
        databaseUrl: database.url,
        credentials: withAdmin,
        log,
        ...(withApp4 === undefined ? {} : { extraEnv: withApp4 }),
      });
    }

    // 4. API host process (built dist; NODE_ENV=test so the local, non-TLS
    //    disposable database with the dev password is permitted), owned by a
    //    lifecycle service so exactly this one process can be stopped/restarted
    //    for the initial server-side dependency-failure journey (E01-C1-J02).
    log('starting api');
    // `withApp4` (APP4-E01-H02) hands this process the run's ephemeral APP4
    // secret material, so the browser tier's requests are served by an API that
    // seals envelopes under the same key the in-process E01 contexts open them
    // with. Absent, the API env is byte-identical to what it always was.
    const apiService = createApiService({
      config,
      databaseUrl: database.url,
      adminOrigins,
      ...(withApp4 === undefined ? {} : { extraEnv: withApp4 }),
    });
    await apiService.start();
    cleanup.push('stop api', () => apiService.stop());
    maybeFault('after-api');

    // 4b. Loopback control seam for the API-unavailability journey — started
    //     only for the E01 cross-layer suite (`withAdmin`), so ordinary smoke
    //     runs expose no control surface. Torn down with everything else.
    let apiControlUrl;
    if (withAdmin !== undefined) {
      const control = await startApiControlServer({ apiService, log });
      apiControlUrl = control.url;
      cleanup.push('close api control server', () => control.close());
    }

    // 5. Next apps (production build via next start).
    const apps = [];
    for (const app of [
      {
        name: 'storefront',
        dir: join(config.repoRoot, 'apps', 'storefront'),
        port: config.ports.storefront,
      },
      {
        name: 'admin',
        dir: join(config.repoRoot, 'apps', 'admin'),
        port: config.ports.admin,
        // Server-to-server API base for the Admin's protected-route session
        // resolver (D-036); it reaches the host API process directly.
        env: { INTERNAL_API_BASE_URL: `http://localhost:${config.ports.api}/api` },
      },
    ]) {
      log(`starting ${app.name}`);
      const proc = startProcess({
        name: app.name,
        command: process.execPath,
        args: [
          resolveNextBin(app.dir),
          'start',
          '--hostname',
          '0.0.0.0',
          '--port',
          String(app.port),
        ],
        cwd: app.dir,
        env: { NODE_ENV: 'production', ...(app.env ?? {}) },
      });
      cleanup.push(`stop ${app.name}`, () => proc.stop());
      await waitForHttp(`http://localhost:${app.port}/healthz`, {
        label: `${app.name} healthz`,
        timeoutMs: 60_000,
      }).catch((error) => {
        throw new Error(`${error.message}\n${app.name} log tail:\n${proc.tail()}`);
      });
      apps.push(proc);
    }

    // 6. Real Nginx gateway (E2E template → host apps via host.docker.internal).
    log('starting gateway');
    await composeUp({ projectName, file: config.composeFile, services: ['gateway'], env: cEnv });
    await waitForHttp(`http://localhost:${config.ports.gateway}/gateway/healthz`, {
      label: 'gateway self-health',
      timeoutMs: 30_000,
    });
    // Preflight the real hostname routing (the browser proves it authoritatively).
    const routed = await httpGetWithHost(config.ports.gateway, '/healthz', config.hosts.storefront);
    if (routed.status !== 200) {
      throw new Error(
        `Gateway did not route ${config.hosts.storefront}/healthz (status ${routed.status}).`,
      );
    }

    return {
      runId,
      projectName,
      database,
      schema,
      baseUrls: config.baseUrls,
      api: apiService,
      apiControlUrl,
      apps,
      cleanup,
    };
  } catch (error) {
    await cleanup.run({ logger: log });
    throw error;
  }
}
