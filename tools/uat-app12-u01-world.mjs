#!/usr/bin/env node
/**
 * `APP12-U01-C1` disposable UAT world — the long-lived **application** process.
 *
 * Business UAT is not a test run: the Human Product Owner works the product as a
 * customer and as an operator across many separate sittings, so the world has to
 * stand until it is told to stop. This process owns everything that is not a
 * container — the API host process, the **real worker process**, and both Next
 * apps from their production builds — then prints `U01_WORLD_READY` and waits.
 *
 * Containers (the ephemeral PostgreSQL that holds the clone, the ephemeral MinIO
 * that holds the copied objects, and the real Nginx gateway) belong to
 * `uat-app12-u01-infra.mjs`, which runs the clone first and writes the run
 * descriptor this process reads.
 *
 * ## What changed in C1, and why
 *
 * Base `APP12-U01` ran the worker *inside* this process on the recording
 * adapter and exposed `GET /verification-code` so a driver could read the OTP
 * back out of memory. The Product Owner rejected that as acceptance evidence
 * (brief §1): a code the run reads from itself proves nothing about a customer.
 *
 * So there is no in-process worker, no recording adapter and no control seam any
 * more. The worker is the built `apps/worker/dist/main.js`, started as its own
 * process with `NOTIFICATION_TRANSPORT=SMTP`, running its own poll loop — the
 * same composition a deployment runs. The OTP and the `ORDER_ACCESS` link leave
 * through the real SMTP path to the inbox the Human PO typed, and nothing in
 * this repository can read either of them.
 *
 * SMTP settings arrive the way `CLAUDE.md` §8a allows: `node --env-file=.env`
 * hands them file → process → child. This file tests only that each one is
 * *present* and never reads, prints or stores a value.
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
import { delay, waitForHttp } from '../packages/e2e-testing/support/orchestration/net.mjs';
import { bootstrapAdmin } from '../packages/e2e-testing/support/orchestration/environment.mjs';
import { assertDisposableTarget } from './uat-app12-u01-clone.mjs';

/** Present-or-not only. The values go to the worker's environment untouched. */
const SMTP_VARIABLES = Object.freeze([
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USERNAME',
  'SMTP_PASSWORD',
  'EMAIL_FROM_ADDRESS',
  'EMAIL_FROM_NAME',
]);

/** The factory's own line on the branch that returns `SmtpNotificationChannelAdapter`. */
const WORKER_SMTP_LINE = 'NOTIFICATION_TRANSPORT=SMTP via';
const WORKER_READY_LINE = 'Worker readiness: ready';

function log(message) {
  process.stdout.write(`[u01] ${message}\n`);
}

function resolveNextBin(appDir) {
  const require = createRequire(join(appDir, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

function databaseClient(url) {
  const databaseRequire = createRequire(
    new URL('../packages/database/package.json', import.meta.url),
  );
  const { Client } = databaseRequire('pg');
  return new Client({ connectionString: url });
}

/**
 * Read-only facts the world needs before it starts anything that can send mail.
 *
 * The clone inherits the shared world's outbox. A `notification.delivery`
 * event still due there would be claimed by this run's real worker and mailed
 * to a real person, so the world refuses to start one while any is undispatched.
 * The credential column of `admin_accounts` is never selected.
 */
async function cloneFacts(url) {
  const client = databaseClient(url);
  await client.connect();
  try {
    await client.query('set session characteristics as transaction read only');
    const admin = await client.query(
      `select email from admin_accounts where status = 'ACTIVE' order by created_at limit 1`,
    );
    const due = await client.query(
      `select count(*)::int as n from outbox_events
       where event_type = 'notification.delivery.requested' and status <> 'DISPATCHED'`,
    );
    return { activeAdminEmail: admin.rows[0]?.email, undispatchedNotifications: due.rows[0].n };
  } finally {
    await client.end();
  }
}

/** Waits until `needle` appears in a child's log, failing fast if it exits. */
async function waitForLogLine(proc, needle, { label, timeoutMs = 90_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.tail().includes(needle)) return;
    if (proc.child.exitCode !== null) {
      throw new Error(`${label}: process exited (${String(proc.child.exitCode)}).`);
    }
    await delay(500);
  }
  throw new Error(`${label}: "${needle}" not seen within ${String(timeoutMs)}ms.`);
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
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

  const missingSmtp = SMTP_VARIABLES.filter((name) => (process.env[name] ?? '') === '');
  if (missingSmtp.length > 0) {
    throw new Error(`SMTP configuration absent: ${missingSmtp.join(', ')} (names only).`);
  }

  // One per-run secret universe for the API and the worker: an envelope the API
  // seals must open in the worker, and the peppers must agree on both sides.
  const app4 = createApp4SecretConfig(descriptor.runId);
  // IMP-D050: the link the worker renders must be the origin the Human PO's
  // browser can actually reach — this run's gateway, never a lookalike.
  app4.storefrontOrigin = config.baseUrls.storefront;
  // A synthetic merchant: BIN 970000 is `.env.example`'s placeholder and no real
  // acquirer's, so the FULL-payment QR cannot move real money (brief §11).
  const merchant = createMerchantBankConfig();
  const appModuleEnv = { ...app4SecretEnv(app4), ...merchantBankEnv(merchant) };
  const operator = {
    email: `u01-operator-${descriptor.runId}@uat.example.test`,
    password: `U01-${randomBytes(18).toString('base64url')}`,
    displayName: 'UAT Operator',
  };

  try {
    const facts = await cloneFacts(databaseUrl);
    if (facts.undispatchedNotifications !== 0) {
      throw new Error(
        `The clone holds ${String(facts.undispatchedNotifications)} undispatched notification ` +
          'deliveries; a real worker would mail them. Refusing to start.',
      );
    }
    if (facts.activeAdminEmail === undefined) {
      log('no active admin in the clone — bootstrapping this run’s operator');
      await bootstrapAdmin({
        config,
        databaseUrl,
        credentials: operator,
        log,
        extraEnv: appModuleEnv,
      });
    } else {
      // The system permits exactly one active admin, so the clone's own operator
      // is the one the Human PO signs in as. Its credential is never read here.
      operator.email = facts.activeAdminEmail;
      operator.password = undefined;
      log('the Human PO signs in with the operator account the clone already carries');
    }

    const adminOrigins = [
      `http://${config.hosts.admin}:${String(config.ports.gateway)}`,
      `http://${config.hosts.admin}:8080`,
    ].join(',');
    log('starting api');
    const apiService = createApiService({
      config,
      databaseUrl,
      adminOrigins,
      extraEnv: appModuleEnv,
    });
    await apiService.start();
    cleanup.push('stop api', () => apiService.stop());

    log('starting the real worker process (SMTP)');
    const worker = startProcess({
      name: 'worker',
      command: process.execPath,
      args: ['dist/main.js'],
      cwd: join(config.repoRoot, 'apps', 'worker'),
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl,
        DATABASE_SSL_MODE: 'disable',
        // The dev worker keeps 9464 inside its container; nothing here scrapes.
        METRICS_ENABLED: 'false',
        NOTIFICATION_TRANSPORT: 'SMTP',
        ...objectStorageEnv(config.storage),
        ...appModuleEnv,
      },
    });
    cleanup.push('stop worker', () => worker.stop());
    await waitForLogLine(worker, WORKER_SMTP_LINE, { label: 'worker transport' });
    await waitForLogLine(worker, WORKER_READY_LINE, { label: 'worker readiness' });
    worker.child.once('exit', (code) => log(`WORKER EXITED (${String(code)}) — mail will stop`));

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

    // Booleans and public facts only: this file is read by the preflight and
    // quoted by the preparation report.
    const status = {
      runId: descriptor.runId,
      databaseName,
      storefront: config.baseUrls.storefront,
      admin: config.baseUrls.admin,
      apiBaseUrl: `http://localhost:${String(config.ports.api)}/api`,
      workerPid: worker.pid,
      workerTransportSmtp: worker.tail().includes(WORKER_SMTP_LINE),
      workerReady: worker.tail().includes(WORKER_READY_LINE),
      recordingTransportWarned: worker.tail().includes('NOTIFICATION_TRANSPORT=RECORDING'),
      smtpConfigPresent: missingSmtp.length === 0,
      envelopeKeyConfigured: (appModuleEnv.NOTIFICATION_DELIVERY_ENVELOPE_KEY ?? '') !== '',
      undispatchedNotificationsAtStart: facts.undispatchedNotifications,
      operatorEmailMasked: maskEmail(operator.email),
      operatorBootstrapped: operator.password !== undefined,
      merchantBankBin: merchant.bankBin,
    };
    writeFileSync(`${runFile}.world.json`, JSON.stringify(status, null, 2), 'utf8');

    // Only when the clone had no operator: the password then reaches the Human
    // PO through this run's scratch file, never a log line, argv or report.
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

    process.stdout.write(`U01_WORLD_READY ${JSON.stringify(status)}\n`);

    await new Promise((resolve) => {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => resolve(signal));
      }
      // A detached background process cannot be signalled on every platform, so
      // a file that disappears is the second stop mechanism.
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
