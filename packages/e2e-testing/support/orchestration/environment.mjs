/**
 * The single canonical E2E environment owner. Nothing else — and no Playwright
 * spec — may start a process, a container, or a database. It provisions the
 * disposable database (canonical harness), starts the API and both Next apps as
 * host processes from built artifacts, brings up the real Nginx gateway, and
 * registers every teardown on one LIFO `CleanupStack` so failures at any stage
 * unwind cleanly.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { CleanupStack } from './cleanup-stack.mjs';
import { composeEnv } from './config.mjs';
import { assertDockerAvailable, composeDown, composeUp, waitForHealthy } from './docker.mjs';
import { provisionDisposableDatabase, proveSchemaBaseline } from './database.mjs';
import { startProcess } from './processes.mjs';
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

async function readyPredicate(res) {
  if (res.status !== 200) {
    return false;
  }
  try {
    const body = await res.clone().json();
    return body?.status === 'ready';
  } catch {
    return false;
  }
}

/**
 * Starts the full environment. On success returns handles plus the populated
 * `cleanup` stack for the caller to run in its own `finally`. On any failure it
 * unwinds everything started so far and rethrows.
 * @param {{ runId: string, config: object, log: (msg: string) => void }} params
 */
export async function startEnvironment({ runId, config, log }) {
  const cleanup = new CleanupStack();
  const projectName = `emb-e2e-${runId}`;
  const cEnv = composeEnv(config);

  try {
    await assertDockerAvailable();
    await assertPortsFree([
      { port: config.ports.postgres, label: 'postgres' },
      { port: config.ports.api, label: 'api' },
      { port: config.ports.storefront, label: 'storefront' },
      { port: config.ports.admin, label: 'admin' },
      { port: config.ports.gateway, label: 'gateway' },
    ]);

    // 1. Ephemeral PostgreSQL (tmpfs) — cleanup drops the whole compose project.
    log('starting ephemeral postgres');
    await composeUp({ projectName, file: config.composeFile, services: ['postgres'], env: cEnv });
    cleanup.push('compose down', () =>
      composeDown({ projectName, file: config.composeFile, env: cEnv }),
    );
    await waitForPort(config.ports.postgres, { label: 'postgres', timeoutMs: 60_000 });
    await waitForHealthy({ projectName, file: config.composeFile, service: 'postgres', env: cEnv });

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

    // 4. API host process (built dist; NODE_ENV=test so the local, non-TLS
    //    disposable database with the dev password is permitted).
    log('starting api');
    const api = startProcess({
      name: 'api',
      command: process.execPath,
      args: ['dist/main.js'],
      cwd: join(config.repoRoot, 'apps', 'api'),
      env: {
        NODE_ENV: 'test',
        API_PORT: String(config.ports.api),
        DATABASE_URL: database.url,
        DATABASE_SSL_MODE: 'disable',
        API_DOCS_ENABLED: 'false',
      },
    });
    cleanup.push('stop api', () => api.stop());
    await waitForHttp(`http://localhost:${config.ports.api}/api/health/readiness`, {
      predicate: readyPredicate,
      label: 'api readiness',
      timeoutMs: 60_000,
    }).catch((error) => {
      throw new Error(`${error.message}\napi log tail:\n${api.tail()}`);
    });
    maybeFault('after-api');

    // 5. Next apps (production build via next start).
    const apps = [];
    for (const app of [
      {
        name: 'storefront',
        dir: join(config.repoRoot, 'apps', 'storefront'),
        port: config.ports.storefront,
      },
      { name: 'admin', dir: join(config.repoRoot, 'apps', 'admin'), port: config.ports.admin },
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
        env: { NODE_ENV: 'production' },
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

    return { runId, projectName, database, schema, baseUrls: config.baseUrls, api, apps, cleanup };
  } catch (error) {
    await cleanup.run({ logger: log });
    throw error;
  }
}
