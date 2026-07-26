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
 * Runs the canonical staff-bootstrap CLI (ADR-APP1-001 §8) once against the
 * disposable database to seed the single Admin the cross-layer suite logs in as.
 * It uses the accepted create-or-reuse mechanism exactly as Compose does — no
 * test-only seeding path — under `NODE_ENV=test` (the strict development policy),
 * and asserts the machine-parseable `result=CREATED` line. Credentials come from
 * the caller and are passed only through the child's environment; nothing is
 * logged (only the status and admin id).
 * @param {{ config: object, databaseUrl: string, credentials: { email: string, password: string, displayName: string }, log: (msg: string) => void }} params
 */
export async function bootstrapAdmin({ config, databaseUrl, credentials, log }) {
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
        reject(new Error(`Admin bootstrap failed (exit ${code}, status ${status}).`));
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
export async function startEnvironment({ runId, config, log, withAdmin }) {
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

    // 3b. Seed the single bootstrap Admin (E01 only) via the accepted CLI.
    if (withAdmin !== undefined) {
      log('bootstrapping admin');
      await bootstrapAdmin({ config, databaseUrl: database.url, credentials: withAdmin, log });
    }

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
        // Staff-auth wiring so real browser login works through the gateway
        // (ADR-APP1-001 §5–§6). Non-secure dev cookie (`adm_session`) over plain
        // HTTP; the browser origin(s) allowlisted for the login/logout mutations.
        STAFF_SESSION_COOKIE_SECURE: 'false',
        STAFF_ALLOWED_ORIGINS: adminOrigins,
        // The IDENTIFIER limit (the E01-J04 boundary under test) stays at the
        // locked default (5 / 15 min). The IP and global ceilings are raised so
        // the single-host harness — where every browser request shares one source
        // IP — does not couple otherwise-independent journeys; those ceilings are
        // orthogonal abuse guards, not the policy verified here.
        STAFF_LOGIN_RATE_LIMIT_IP_MAX: '1000',
        STAFF_LOGIN_RATE_LIMIT_GLOBAL_MAX: '1000',
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

    return { runId, projectName, database, schema, baseUrls: config.baseUrls, api, apps, cleanup };
  } catch (error) {
    await cleanup.run({ logger: log });
    throw error;
  }
}
