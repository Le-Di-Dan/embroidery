#!/usr/bin/env node
/**
 * `APP12-U01-C1` Stage-1 preflight — proves the manual UAT world is safe and
 * reachable before it is handed to the Human Product Owner (brief §5, §7, §8).
 *
 * **Read-only, always.** It issues `select`s under read-only session
 * characteristics, HTTP `GET`s and S3 `ListObjectsV2`. It never creates a
 * customer, never requests a code and never touches an order: the customer and
 * operator journeys are the Human PO's alone (§18), and a green preflight is not
 * a PASS for any of them.
 *
 * Every result is a boolean or a public fact. No secret is read out: the shared
 * database URL reaches `probe` from `--env-file=.env` and is never printed.
 *
 * Usage: `U01_RUN_FILE=… node --env-file=.env tools/uat-app12-u01-preflight.mjs`
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { loadE2EConfig } from '../packages/e2e-testing/support/orchestration/config.mjs';
import { assertDisposableTarget } from './uat-app12-u01-clone.mjs';
import { databaseUrl as sharedDatabaseUrl, probe } from './uat-app12-u01-integrity.mjs';

/** Every PUBLISHED G03 Product with an order-eligible, in-stock, priced SKU. */
const SELLABLE_SQL = `
  select p.slug, p.name, v.color_name, v.size_label, s.code,
         coalesce(s.price_override_amount, p.base_price_amount)::text as unit_price,
         coalesce(s.currency_code, p.currency_code) as currency,
         st.quantity_on_hand as stock
  from products p
  join product_variants v on v.product_id = p.id and v.is_active
  join skus s on s.product_variant_id = v.id and s.is_active
  join sku_stocks st on st.sku_id = s.id
  where p.status = 'PUBLISHED' and p.slug like 'uat-%' and st.quantity_on_hand > 0
  order by p.slug, s.code`;

/** The representative Product the checklist names; the first sellable one otherwise. */
const PREFERRED_SLUG = 'uat-non-luoi-trai-theu-logo';

const storageRequire = createRequire(
  new URL('../packages/object-storage/package.json', import.meta.url),
);
const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);

async function readOnlyQuery(url, sql) {
  const { Client } = databaseRequire('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('set session characteristics as transaction read only');
    return (await client.query(sql)).rows;
  } finally {
    await client.end();
  }
}

async function get(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return { status: response.status, body: await response.text() };
}

async function countObjects(storage, bucket) {
  const { S3Client, ListObjectsV2Command } = storageRequire('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: storage.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  });
  let count = 0;
  let token;
  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
      );
      count += page.KeyCount ?? 0;
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
  } finally {
    client.destroy();
  }
  return count;
}

/** A built artifact is fresh when it is newer than HEAD and its sources are clean. */
function freshness(repoRoot, app, artifact) {
  const headSeconds = Number(
    execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  );
  const dirty = execFileSync('git', ['status', '--porcelain', '--', `apps/${app}`, 'packages'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.includes('packages/e2e-testing/'));
  const builtSeconds = statSync(join(repoRoot, 'apps', app, artifact)).mtimeMs / 1000;
  return { builtAfterHead: builtSeconds >= headSeconds, sourceClean: dirty.length === 0 };
}

async function main() {
  const runFile = process.env['U01_RUN_FILE'];
  if (runFile === undefined) throw new Error('U01_RUN_FILE must name the run descriptor path.');
  const descriptor = JSON.parse(readFileSync(runFile, 'utf8'));
  const world = JSON.parse(readFileSync(`${runFile}.world.json`, 'utf8'));
  const config = loadE2EConfig();
  const databaseName = assertDisposableTarget(descriptor.databaseName);
  const cloneUrl =
    `postgres://${config.db.user}:${config.db.password}` +
    `@localhost:${String(config.ports.postgres)}/${databaseName}`;
  const { storefront, admin } = config.baseUrls;

  const [shared, clone] = [await probe(sharedDatabaseUrl()), await probe(cloneUrl)];
  const sellable = await readOnlyQuery(cloneUrl, SELLABLE_SQL);
  // The deepest-stocked SKU of the preferred Product, so one UAT order cannot sell it out.
  const chosen =
    sellable.filter((row) => row.slug === PREFERRED_SLUG).sort((a, b) => b.stock - a.stock)[0] ??
    sellable[0];

  // The gateway's self-health lives on its default server, not on either vhost.
  const gatewayHealth = await get(
    `http://localhost:${String(config.ports.gateway)}/gateway/healthz`,
  );
  const apiViaGateway = await get(`${storefront}/api/health/readiness`);
  const storefrontHome = await get(`${storefront}/`);
  const adminLogin = await get(`${admin}/login`);
  const variants = chosen
    ? await get(`${storefront}/api/public/products/${chosen.slug}/variants`)
    : undefined;
  const detail = chosen ? await get(`${storefront}/san-pham/${chosen.slug}`) : undefined;

  const storefrontBuildId = readFileSync(
    join(config.repoRoot, 'apps/storefront/.next/BUILD_ID'),
    'utf8',
  ).trim();
  const adminBuildId = readFileSync(
    join(config.repoRoot, 'apps/admin/.next/BUILD_ID'),
    'utf8',
  ).trim();

  let workerAlive = false;
  try {
    process.kill(world.workerPid, 0);
    workerAlive = true;
  } catch {
    workerAlive = false;
  }

  const objects = {
    originals: await countObjects(config.storage, config.storage.originalsBucket),
    derivatives: await countObjects(config.storage, config.storage.derivativesBucket),
  };

  const checks = {
    disposableDatabase: databaseName.startsWith('embroidery_db7_u01_'),
    cloneCarriesG03Truth: clone.censusDigest === shared.censusDigest,
    cloneTables: clone.tables,
    gatewayHealthy: gatewayHealth.status === 200,
    apiHealthyThroughGateway:
      apiViaGateway.status === 200 && JSON.parse(apiViaGateway.body)?.status === 'ready',
    storefrontReachable: storefrontHome.status === 200,
    adminReachable: adminLogin.status === 200,
    storefrontServesCurrentBuild: storefrontHome.body.includes(storefrontBuildId),
    adminServesCurrentBuild: adminLogin.body.includes(adminBuildId),
    workerAlive,
    workerTransportSmtp: world.workerTransportSmtp === true,
    workerRecordingTransportAbsent: world.recordingTransportWarned === false,
    workerReady: world.workerReady === true,
    smtpConfigPresent: world.smtpConfigPresent === true,
    envelopeKeyConfigured: world.envelopeKeyConfigured === true,
    undispatchedNotificationsAtStart: world.undispatchedNotificationsAtStart,
    sellableSkuCount: sellable.length,
    chosenProductPublicVariants200: variants?.status === 200,
    chosenProductDetail200: detail?.status === 200,
    objectStoreDisposable:
      config.storage.endpoint === `http://localhost:${String(config.ports.minio)}`,
    objectStoreClonedCountsMatch:
      objects.originals === descriptor.objects[0]?.objects &&
      objects.derivatives === descriptor.objects[1]?.objects,
  };
  const build = {
    api: freshness(config.repoRoot, 'api', 'dist/main.js'),
    worker: freshness(config.repoRoot, 'worker', 'dist/main.js'),
    storefront: freshness(config.repoRoot, 'storefront', '.next/BUILD_ID'),
    admin: freshness(config.repoRoot, 'admin', '.next/BUILD_ID'),
  };
  const buildFresh = Object.values(build).every((b) => b.builtAfterHead && b.sourceClean);
  const pass =
    buildFresh &&
    checks.undispatchedNotificationsAtStart === 0 &&
    checks.sellableSkuCount > 0 &&
    Object.entries(checks).every(([, value]) => typeof value !== 'boolean' || value);

  process.stdout.write(
    `${JSON.stringify(
      {
        pass,
        checks,
        build,
        objects,
        chosen,
        sellableProducts: [...new Set(sellable.map((row) => row.slug))],
        sharedCommercial: shared.commercial,
        sharedCensusDigest: shared.censusDigest,
      },
      null,
      2,
    )}\n`,
  );
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
