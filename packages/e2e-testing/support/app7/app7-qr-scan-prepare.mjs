/**
 * `APP7-E01-U01` — prepare exactly one real bank-transfer QR for the human scan.
 *
 * The last gate `APP7-E01` §10 leaves open cannot be automated: only a person
 * with a Vietnamese banking application can say whether the PNG the delivered
 * encoder produces actually pre-fills the intended bank, the exact amount and
 * the exact transfer content. This module prepares that one artifact and
 * nothing else.
 *
 * ### What is real and what is synthetic
 *
 * ```text
 * merchant bank / account   REAL      — the operator's own `.env`, read, never printed
 * customer, order, deposit  SYNTHETIC — a disposable acceptance chain
 * deposit amount            SYNTHETIC — the fixture's 1 166 667 VND
 * transfer reference        SYNTHETIC — but derived by REAL APP7 code from the order code
 * the QR itself             REAL      — `publicOrderDeposit_qr` over real HTTP
 * ```
 *
 * No customer data of any kind is real, no transfer is made, and no money moves.
 * The PNG is written to an ignored path and is never committed: it carries the
 * real merchant destination.
 *
 * ### Why the whole topology is not started
 *
 * The question is "does the delivered B03 operation produce a scannable payload
 * against the real merchant account". That needs PostgreSQL, the API HTTP
 * process, and the two in-process Nest graphs that own the conversion and the
 * grant issuer. It does not need a browser, the gateway or either Next app, so
 * this rides the lean `startApp4Environment` topology rather than the E01 one.
 *
 * **The six E01 cases are not re-executed.** Nothing here asserts a payment
 * outcome; it builds one order far enough to have a `DEPOSIT` obligation and a
 * live secure link, and then asks for the image.
 *
 * ### Secrecy
 *
 * The four merchant values are read from `.env` into this process's memory and
 * handed to the API child through its environment. They are never printed,
 * never logged, never written to a report and never returned. The only things
 * this module prints are booleans, an HTTP status, a content type and the local
 * file path.
 *
 * Test-only. Never imported by application code.
 */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  PACKAGE_ROOT,
  REPO_ROOT,
  app4SecretEnv,
  createApp4SecretConfig,
  createRunId,
  loadE2EConfig,
  merchantBankEnv,
} from '../orchestration/config.mjs';
import { startApp4Environment } from '../app4/app4-environment.mjs';
import { createApp7World } from './app7-world.mjs';
import { createApp7Control } from './app7-control.mjs';
import { createApp7Evidence } from './app7-evidence.mjs';

/** The four `APP7-G01` §3 names. Read as names; the values are never surfaced. */
const MERCHANT_NAMES = [
  'PAYMENT_MERCHANT_BANK_BIN',
  'PAYMENT_MERCHANT_ACCOUNT_NUMBER',
  'PAYMENT_MERCHANT_ACCOUNT_NAME',
  'PAYMENT_MERCHANT_BANK_DISPLAY_NAME',
];

/** Ignored by `.gitignore` (`.e2e-state/`) and cleared by this package's `clean`. */
const OUTPUT_DIR = join(PACKAGE_ROOT, '.e2e-state');
const OUTPUT_FILE = 'app7-e01-qr-scan.png';

/**
 * The four values out of the repository-root `.env`.
 *
 * A deliberately minimal reader rather than a dependency: it takes `NAME=value`
 * lines, trims one layer of surrounding quotes, and ignores everything else.
 * `.env` is only ever **read** here — `CLAUDE.md` §8a forbids writing it, and
 * nothing in this module does.
 */
async function readMerchantEnv() {
  let raw;
  try {
    raw = await readFile(join(REPO_ROOT, '.env'), 'utf8');
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null || !MERCHANT_NAMES.includes(match[1])) {
      continue;
    }
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/**
 * Presence and shape, decided by the **production loader**.
 *
 * Not a second opinion about what a valid account looks like: if
 * `loadMerchantBankConfig` accepts it, the deposit surface will compose, and if
 * it refuses, the message names the variable and never the value. The returned
 * report carries booleans and names only.
 */
function inspectMerchantEnv(values) {
  const missing = MERCHANT_NAMES.filter(
    (name) => values[name] === undefined || values[name] === '',
  );
  if (missing.length > 0) {
    return { present: false, shapeValid: false, missing };
  }
  // Resolved through the API's own compiled config so the harness cannot drift
  // from the rule the running server enforces.
  const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));
  const { loadMerchantBankConfig } = requireFromApi(
    './dist/modules/payment/config/merchant-bank.config.js',
  );
  try {
    loadMerchantBankConfig(values);
    return { present: true, shapeValid: true, missing: [] };
  } catch (error) {
    // The loader's message names only the variable, so it is safe to surface.
    return { present: true, shapeValid: false, missing: [], reason: error.message };
  }
}

/**
 * Publishes the delivered `app4` policy set, on a real resolved Admin.
 *
 * `SecureGrantIssuer` reads the grant policy through `SecureGrantPolicyReader`
 * and refuses with `SECURE_GRANT_POLICY_UNAVAILABLE` when nothing has published
 * one. In the full E01 topology the accepted `staff-bootstrap` CLI does this;
 * the lean topology does not run it, so the **same delivered publisher** is
 * called here with a real Admin id — the precedent `APP6-E01`'s harness set.
 * No policy value is invented: `PublishApp4PolicyUseCase` writes production's.
 */
async function publishGrantPolicy(runtime, databaseUrl) {
  const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));
  const { createDatabaseClient, executeRaw, newId, sql } = requireFromApi('@embroidery/database');
  const { PublishApp4PolicyUseCase } = requireFromApi(
    './dist/platform/policy/publish-app4-policy.use-case.js',
  );
  const { evidenceClientConfig } = await import('../app4/db-evidence.mjs');

  const client = createDatabaseClient(evidenceClientConfig(databaseUrl));
  const adminId = newId();
  try {
    // `uq_admin_accounts__status__active` permits a single ACTIVE account; this
    // disposable database has none.
    await executeRaw(
      client.db,
      sql`INSERT INTO admin_accounts (id, email, display_name, status)
          VALUES (${adminId}, ${`app7-u01-${adminId}@example.test`},
                  'APP7-E01-U01 Scan Operator', 'ACTIVE')`,
    );
  } finally {
    await client.close?.();
  }
  await runtime.apiContext.get(PublishApp4PolicyUseCase).publish(adminId);
}

/** One JSON POST to the API HTTP process, returning status, type and bytes. */
async function postForBytes(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

export async function prepareQrForScan({ log = () => {} } = {}) {
  const merchantValues = await readMerchantEnv();
  const inspection = inspectMerchantEnv(merchantValues);
  if (!inspection.present || !inspection.shapeValid) {
    return { ok: false, stage: 'MERCHANT_ENV', inspection };
  }

  const config = loadE2EConfig();
  const runId = createRunId();
  const app4 = createApp4SecretConfig(runId);
  const merchantEnv = merchantBankEnv({
    bankBin: merchantValues['PAYMENT_MERCHANT_BANK_BIN'],
    accountNumber: merchantValues['PAYMENT_MERCHANT_ACCOUNT_NUMBER'],
    accountName: merchantValues['PAYMENT_MERCHANT_ACCOUNT_NAME'],
    bankDisplayName: merchantValues['PAYMENT_MERCHANT_BANK_DISPLAY_NAME'],
  });

  // The in-process `AppModule` composes `CustomerDepositModule` too, so it needs
  // the same four values to be constructible at all. In memory only.
  const restoreEnv = [];
  for (const [name, value] of Object.entries(merchantEnv)) {
    const previous = process.env[name];
    process.env[name] = value;
    restoreEnv.push(() => {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    });
  }

  let env;
  let runtime;
  let world;
  let evidence;
  try {
    env = await startApp4Environment({
      runId,
      config,
      app4,
      log,
      // The API child is started with the run's APP4 universe **and** the real
      // merchant destination — the whole point of this preparation.
      extraEnv: { ...app4SecretEnv(app4), ...merchantEnv },
    });
    log(`api ready @ ${env.apiBaseUrl}`);

    const { createApp4E01Runtime } = await import('../app4/app4-runtime.mjs');
    runtime = await createApp4E01Runtime({
      runId,
      app4,
      databaseUrl: env.database.url,
      apiBaseUrl: env.apiBaseUrl,
      label: `app7-u01-${runId}`,
      log,
    });

    await publishGrantPolicy(runtime, env.database.url);
    world = await createApp7World(runtime, { databaseUrl: env.database.url });
    evidence = await createApp7Evidence(env.database.url);
    const control = createApp7Control(runtime);

    // The smallest truthful path to a DEPOSIT obligation: the APP6 hand-off
    // fixture, then the **real** `design.approved` conversion. No order,
    // obligation, attempt or amount is written by hand.
    const handoff = await world.seedApprovedHandoff({ branch: 'CATALOG', suffix: 'scan' });
    await world.appendDesignApproved(handoff);
    await control.drainJobs();
    const orders = await evidence.listOrdersForRequest(handoff.customRequestId);
    if (orders.length !== 1) {
      return { ok: false, stage: 'CONVERSION', orderCount: orders.length };
    }
    const deposit = await evidence.findObligation(orders[0].id, 'DEPOSIT');
    if (deposit === undefined) {
      return { ok: false, stage: 'DEPOSIT_OBLIGATION' };
    }

    // A real grant, minted by the production issuer.
    const link = await world.issueSecureLink(handoff);

    // The delivered operation, over real HTTP, against the API process that was
    // started with the real merchant destination.
    const qr = await postForBytes(`${env.apiBaseUrl}/api/public/orders/deposit/qr`, {
      token: link.rawToken,
    });
    if (qr.status !== 200 || !qr.contentType.includes('image/png')) {
      return { ok: false, stage: 'QR', status: qr.status, contentType: qr.contentType };
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    const pngPath = join(OUTPUT_DIR, OUTPUT_FILE);
    await writeFile(pngPath, qr.bytes);

    return {
      ok: true,
      status: qr.status,
      contentType: qr.contentType,
      byteLength: qr.bytes.byteLength,
      pngPath,
      // Safe shape facts only. No amount, no reference, no account.
      depositIsPending: deposit.status === 'PENDING',
      orderIsAwaitingDeposit: orders[0].status === 'AWAITING_DEPOSIT',
    };
  } finally {
    await evidence?.close().catch(() => {});
    await world?.close().catch(() => {});
    await runtime?.close().catch(() => {});
    if (env !== undefined) {
      log('tearing down the scan topology');
      await env.cleanup.run({ logger: log });
    }
    for (const restore of restoreEnv.reverse()) {
      restore();
    }
  }
}
