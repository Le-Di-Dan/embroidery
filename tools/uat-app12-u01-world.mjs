#!/usr/bin/env node
/**
 * `APP12-U01` disposable UAT world — the long-lived **application** process.
 *
 * Business UAT is not a test run: an operator and a customer work the product
 * across many separate turns, so the world has to stand until it is told to
 * stop. This process owns everything that is not a container — the API host
 * process, both Next apps from their production builds, and the in-process API
 * and worker contexts — then prints `U01_WORLD_READY` and waits.
 *
 * Containers (the ephemeral PostgreSQL that holds the clone, the ephemeral
 * MinIO that holds the copied objects, and the real Nginx gateway) belong to
 * `uat-app12-u01-infra.mjs`, which runs the clone first and writes the run
 * descriptor this process reads.
 *
 * ## Why the worker runs *here*
 *
 * `RecordingNotificationChannelAdapter` is the repository's only notification
 * channel and it is deliberately memory-only, so the process that executes a
 * delivery must be the process that can read it. A containerised worker delivers
 * to nobody readable (`APP12-H07`). The control server beside it is the seam the
 * driver uses; see `uat-app12-u01-control.mjs` for what may cross it.
 *
 * Usage: `U01_RUN_FILE=… node --env-file=.env tools/uat-app12-u01-world.mjs`
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { CleanupStack } from '../packages/e2e-testing/support/orchestration/cleanup-stack.mjs';
import {
  app4SecretEnv,
  createApp4SecretConfig,
  createMerchantBankConfig,
  loadE2EConfig,
  merchantBankEnv,
  objectStorageEnv,
} from '../packages/e2e-testing/support/orchestration/config.mjs';
import { createApiService } from '../packages/e2e-testing/support/orchestration/api-service.mjs';
import { startProcess } from '../packages/e2e-testing/support/orchestration/processes.mjs';
import { waitForHttp } from '../packages/e2e-testing/support/orchestration/net.mjs';
import { bootstrapAdmin } from '../packages/e2e-testing/support/orchestration/environment.mjs';
import { createApp4E01Runtime } from '../packages/e2e-testing/support/app4/app4-runtime.mjs';
import { createWorkerControl } from '../packages/e2e-testing/support/app4/worker-control.mjs';
import { assertDisposableTarget } from './uat-app12-u01-clone.mjs';
import { startControlServer } from './uat-app12-u01-control.mjs';

const CONTROL_PORT = 4499;

function log(message) {
  process.stdout.write(`[u01] ${message}\n`);
}

function resolveNextBin(appDir) {
  const require = createRequire(join(appDir, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

/**
 * The email of the clone's single active admin, or `undefined`.
 *
 * A read, and only a read: the credential column is never selected, and nothing
 * in this process ever learns the operator's password.
 */
async function activeAdminEmail(url) {
  const databaseRequire = createRequire(
    new URL('../packages/database/package.json', import.meta.url),
  );
  const { Client } = databaseRequire('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select email from admin_accounts where status = 'ACTIVE' order by created_at limit 1`,
    );
    return rows[0]?.email;
  } finally {
    await client.end();
  }
}

async function main() {
  const runFile = process.env['U01_RUN_FILE'];
  if (runFile === undefined) throw new Error('U01_RUN_FILE must name the run descriptor path.');
  const descriptor = JSON.parse(readFileSync(runFile, 'utf8'));
  const config = loadE2EConfig();
  const cleanup = new CleanupStack();
  const databaseName = assertDisposableTarget(descriptor.databaseName);
  const databaseUrl =
    `postgres://${config.db.user}:${config.db.password}` +
    `@localhost:${String(config.ports.postgres)}/${databaseName}`;

  const app4 = createApp4SecretConfig(descriptor.runId);
  // The customer opens the real delivered link, so the origin the worker renders
  // it against must be the origin this run's browser can actually reach
  // (IMP-D050 — never a lookalike, always the configured public origin).
  app4.storefrontOrigin = config.baseUrls.storefront;
  const merchant = createMerchantBankConfig();
  const operator = {
    email: `u01-operator-${descriptor.runId}@uat.example.test`,
    password: `U01-${randomBytes(18).toString('base64url')}`,
    displayName: 'UAT Operator',
  };
  const appModuleEnv = { ...app4SecretEnv(app4), ...merchantBankEnv(merchant) };

  try {
    // The clone carries whatever staff account the shared world holds, and the
    // system permits exactly one active admin (`ADMIN_ACCOUNT_ALREADY_ACTIVE`).
    // So the run reuses that operator rather than minting a second one: its
    // credential is never read, written or rotated here — the driver types it
    // into the real login form, which is the journey U01 is meant to observe.
    const existing = await activeAdminEmail(databaseUrl);
    if (existing === undefined) {
      log('no active admin in the clone — bootstrapping this run’s operator');
      await bootstrapAdmin({ config, databaseUrl, credentials: operator, log, extraEnv: appModuleEnv });
    } else {
      operator.email = existing;
      operator.password = undefined;
      log('reusing the operator account the clone already carries');
    }

    const adminOrigins = [
      `http://${config.hosts.admin}:${String(config.ports.gateway)}`,
      `http://${config.hosts.admin}:8080`,
    ].join(',');
    log('starting api');
    const apiService = createApiService({ config, databaseUrl, adminOrigins, extraEnv: appModuleEnv });
    await apiService.start();
    cleanup.push('stop api', () => apiService.stop());

    for (const app of [
      {
        name: 'storefront',
        dir: join(config.repoRoot, 'apps', 'storefront'),
        port: config.ports.storefront,
        env: {
          INTERNAL_API_BASE_URL: `http://localhost:${String(config.ports.api)}/api`,
          STOREFRONT_PUBLIC_ORIGIN: config.baseUrls.storefront,
        },
      },
      {
        name: 'admin',
        dir: join(config.repoRoot, 'apps', 'admin'),
        port: config.ports.admin,
        env: { INTERNAL_API_BASE_URL: `http://localhost:${String(config.ports.api)}/api` },
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
        env: { NODE_ENV: 'production', ...app.env },
      });
      cleanup.push(`stop ${app.name}`, () => proc.stop());
      await waitForHttp(`http://localhost:${String(app.port)}/healthz`, {
        label: `${app.name} healthz`,
        timeoutMs: 120_000,
      }).catch((error) => {
        throw new Error(`${error.message}\n${app.name} log tail:\n${proc.tail()}`);
      });
    }

    log('booting the in-process api and worker contexts');
    Object.assign(process.env, objectStorageEnv(config.storage), merchantBankEnv(merchant));
    const runtime = await createApp4E01Runtime({
      runId: descriptor.runId,
      app4,
      databaseUrl,
      apiBaseUrl: `http://localhost:${String(config.ports.api)}/api`,
      label: `u01-${descriptor.runId}`,
      log,
    });
    cleanup.push('close in-process runtime', () => runtime.close());
    const worker = createWorkerControl(runtime);

    const control = await startControlServer({
      worker,
      port: CONTROL_PORT,
      log,
      state: () => ({
        runId: descriptor.runId,
        databaseName,
        postgresContainer: descriptor.postgresContainer,
        objects: descriptor.objects,
        dumpBytes: descriptor.dumpBytes,
        storefront: config.baseUrls.storefront,
        admin: config.baseUrls.admin,
        apiBaseUrl: `http://localhost:${String(config.ports.api)}/api`,
        operatorEmail: operator.email,
        merchant: {
          bankBin: merchant.bankBin,
          accountNumber: merchant.accountNumber,
          accountName: merchant.accountName,
          bankDisplayName: merchant.bankDisplayName,
        },
      }),
    });
    cleanup.push('close control server', () => control.close());

    // The operator's password reaches the driver through this run's own scratch
    // file — never a log line, never argv, never the report.
    const credentialsPath = process.env['U01_CREDENTIALS_PATH'];
    if (credentialsPath !== undefined && operator.password !== undefined) {
      writeFileSync(credentialsPath, JSON.stringify(operator), 'utf8');
      cleanup.push('remove credentials file', () => {
        try {
          unlinkSync(credentialsPath);
        } catch {
          /* already gone */
        }
      });
    }

    process.stdout.write(
      `U01_WORLD_READY ${JSON.stringify({
        runId: descriptor.runId,
        databaseName,
        storefront: config.baseUrls.storefront,
        admin: config.baseUrls.admin,
        control: control.url,
      })}\n`,
    );

    await new Promise((resolve) => {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => resolve(signal));
      }
      // The driver cannot deliver a signal to a detached background process on
      // every platform, so a file that disappears is the second stop mechanism.
      const stopFile = process.env['U01_STOP_FILE'];
      if (stopFile !== undefined) {
        const timer = setInterval(() => {
          try {
            readFileSync(stopFile);
          } catch {
            clearInterval(timer);
            resolve('stop-file');
          }
        }, 2_000);
        writeFileSync(stopFile, 'running', 'utf8');
      }
    });
    log('shutdown requested');
  } finally {
    const failures = await cleanup.run({ logger: log });
    process.stdout.write(
      `U01_WORLD_TORN_DOWN ${JSON.stringify({ failures: failures.map((f) => f.name) })}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
