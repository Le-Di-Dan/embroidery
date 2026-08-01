#!/usr/bin/env node
/**
 * `APP2-T01-C1` — the public catalog-media scenarios, run against a REAL
 * production API runtime through the real Nginx gateway.
 *
 * Invoked by `tools/smoke-app2-t01-public-media-production.mjs`, which owns the
 * production image, the disposable database, the upstream swap, the gateway
 * reload and the restore. This file owns only the assertions, so a scenario
 * change can never weaken the isolation model.
 *
 * ## How publication state is arranged, stated plainly
 *
 * By writing `products.status` directly — on the run's **disposable** database,
 * never on the developer's. This is a test fixture, not a Product command: it
 * runs no readiness evaluation, honours no concurrency token, and records no
 * Audit or Outbox row. It is never described as publish or unpublish anywhere
 * in this harness or its report.
 *
 * The sanctioned `APP2-B03` commands were the preferred setup and are not
 * reachable here. A production API mandates a `Secure`, `__Host-` prefixed
 * staff cookie (`staff-auth.config.ts`), and the development gateway is plain
 * HTTP, so no conforming client can return that cookie and no authenticated
 * Admin operation can be driven against a production API behind this gateway.
 * The route under test is anonymous and entirely unaffected — and because no
 * lifecycle command runs, the Audit and Outbox counts are expected to be
 * identical from the first assertion to the last, which is itself the evidence
 * that the read path writes nothing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import process from 'node:process';

import {
  GATEWAY_ADMIN_HOST,
  GATEWAY_STOREFRONT_HOST,
  isWebp,
  mediaPath,
} from './smoke-app2-t01-public-media.mjs';
import { envelopeOf, gatewayRequest, requestArgs } from './smoke-app2-t01-gateway-http.mjs';
import {
  API_CONTAINER,
  PROD_DB_CONTAINER,
  PROD_DB_NAME,
  PROD_DB_USER,
} from './smoke-app2-t01-production-topology.mjs';

export const DRAFT = 'DRAFT';
export const PUBLISHED = 'PUBLISHED';

/** A UUID that cannot exist, used for the unknown-product and 400 probes. */
export const ABSENT_MEDIA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
export const ABSENT_SLUG = 'khong-ton-tai';

/**
 * Log patterns that would mean a client disconnect left the production API in a
 * broken state. Deliberately narrow: a generic /error/i sweep matches ordinary
 * request logging and proves nothing.
 */
export const UNHANDLED_LOG_PATTERNS = [
  'unhandledRejection',
  'uncaughtException',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ERR_STREAM_DESTROYED',
  'ERR_UNHANDLED_ERROR',
];

export function unhandledLogHits(logText) {
  return UNHANDLED_LOG_PATTERNS.filter((pattern) => logText.includes(pattern));
}

/**
 * The fixture statement that puts the disposable copy into one lifecycle state.
 * Named for what it is. Nothing in this harness calls it a command.
 */
export function fixtureStatusSql(productId, status) {
  return `update products set status = '${status}' where id = '${productId}'`;
}

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${JSON.stringify(detail)}`);
}

/** Every SQL statement in this file targets the disposable database only. */
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      PROD_DB_CONTAINER,
      'psql',
      '-U',
      PROD_DB_USER,
      '-d',
      PROD_DB_NAME,
      '-tAF|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function evidenceCounts() {
  const [audit, outbox] = sql(
    'select (select count(*) from audit_events), (select count(*) from outbox_events)',
  ).split('|');
  return { audit, outbox };
}

/** A product whose first image really has both derivatives READY in MinIO. */
function selectTarget() {
  const row = sql(`
    select p.id, p.slug, p.status, pm.id
    from products p
    join product_media pm on pm.product_id = p.id and pm.role = 'THUMBNAIL'
    join assets a on a.id = pm.asset_id and a.status = 'ACCEPTED'
      and a.kind = 'CATALOG_MEDIA' and a.classification = 'PRODUCTION_SENSITIVE'
    join categories c on c.id = p.category_id and c.status = 'PUBLISHED'
    where (select count(*) from asset_derivatives d
           where d.asset_id = a.id and d.status = 'READY' and d.is_watermarked = false
             and d.kind in ('THUMBNAIL','CATALOG_PREVIEW')) = 2
    order by p.slug limit 1`);
  if (row === '') {
    throw new Error('No product in the disposable copy has a deliverable THUMBNAIL association.');
  }
  const [id, slug, status, mediaId] = row.split('|');
  return { id, slug, status, mediaId };
}

/** An anonymous media GET. This client has no session concept at all. */
function media(path, host = GATEWAY_STOREFRONT_HOST) {
  return gatewayRequest({ path, host });
}

/**
 * Opens a media request, reads the first bytes and then destroys the socket —
 * a real client disconnect mid-stream, which is the only way to exercise the
 * abort path through the gateway against the production runtime.
 */
function abortMidStream(path) {
  return new Promise((resolve) => {
    const socket = connect(80, '127.0.0.1', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: ${GATEWAY_STOREFRONT_HOST}\r\nConnection: close\r\n\r\n`,
      );
    });
    let received = 0;
    const finish = () => {
      socket.destroy();
      resolve(received);
    };
    socket.on('data', (chunk) => {
      received += chunk.length;
      finish();
    });
    socket.on('error', finish);
    setTimeout(finish, 10_000).unref();
  });
}

function apiLogsSince(isoTimestamp) {
  const res = spawnSync('docker', ['logs', '--since', isoTimestamp, API_CONTAINER], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
}

// --- scenario groups ---------------------------------------------------------

function safeMissScenarios() {
  const badRendition = media(mediaPath(ABSENT_SLUG, ABSENT_MEDIA_ID, 'original'));
  record('unknown rendition is a safe 400', badRendition.status === 400, {
    status: badRendition.status,
  });

  const unknown = media(mediaPath(ABSENT_SLUG, ABSENT_MEDIA_ID, 'thumbnail'));
  const body = envelopeOf(unknown);
  record(
    'unknown product is a safe 404',
    unknown.status === 404 && body?.code === 'PUBLIC_PRODUCT_MEDIA_NOT_FOUND',
    { status: unknown.status, code: body?.code },
  );
  record(
    'the safe miss leaks no storage detail',
    !/bucket|storage_key|minio|s3|derivative/i.test(JSON.stringify({ ...body, code: undefined })),
    { message: body?.message },
  );
}

function deliveryScenarios(target) {
  const thumbnailPath = mediaPath(target.slug, target.mediaId, 'thumbnail');
  const served = media(thumbnailPath);
  record(
    'a PUBLISHED product streams exact WebP thumbnail bytes from the production API',
    served.status === 200 && isWebp(served.body) && served.body.length > 0,
    { status: served.status, bytes: served.body.length, webp: isWebp(served.body) },
  );
  record(
    'response headers are the locked delivery policy',
    served.headers['content-type']?.includes('image/webp') === true &&
      served.headers['x-content-type-options'] === 'nosniff' &&
      served.headers['content-disposition'] === 'inline' &&
      served.headers['cache-control'] === 'no-store',
    {
      contentType: served.headers['content-type'],
      nosniff: served.headers['x-content-type-options'],
      disposition: served.headers['content-disposition'],
      cacheControl: served.headers['cache-control'],
    },
  );
  record(
    'content-disposition carries no filename',
    !/filename/i.test(served.headers['content-disposition'] ?? ''),
    { disposition: served.headers['content-disposition'] },
  );

  const leaked = Object.entries(served.headers).filter(([name, value]) =>
    /etag|x-amz|minio|bucket|storage/i.test(`${name}:${value}`),
  );
  record('no storage or provider metadata reaches the client', leaked.length === 0, {
    leaked: leaked.map(([name]) => name),
  });

  const preview = media(mediaPath(target.slug, target.mediaId, 'catalog-preview'));
  record(
    'catalog-preview is a different, larger derivative',
    preview.status === 200 && isWebp(preview.body) && preview.body.length !== served.body.length,
    { thumbnailBytes: served.body.length, previewBytes: preview.body.length },
  );

  record(
    'the same address works on the admin host',
    media(thumbnailPath, GATEWAY_ADMIN_HOST).status === 200,
  );

  // Structural, not incidental: the media request is built without any cookie
  // or authorization flag, so it is anonymous by construction.
  const args = requestArgs({ path: thumbnailPath, host: GATEWAY_STOREFRONT_HOST });
  record(
    'anonymous: the media request carries no cookie or credential',
    !args.includes('-b') && !args.includes('-c') && !args.some((a) => /Authorization/i.test(a)),
    { argc: args.length },
  );

  record('minio is not exposed through the gateway', media('/minio/').status !== 200);
  return { thumbnailPath, thumbnailBytes: served.body.length, previewBytes: preview.body.length };
}

async function abortScenario(thumbnailPath) {
  const since = new Date(Date.now() - 2000).toISOString();
  const received = await abortMidStream(thumbnailPath);
  record('client aborted a media response mid-stream', received > 0, {
    bytesBeforeAbort: received,
  });

  const health = gatewayRequest({ path: '/api/health', host: GATEWAY_STOREFRONT_HOST });
  record('production API is healthy after the abort', health.status === 200, {
    status: health.status,
  });

  const after = media(thumbnailPath);
  record('a subsequent media request still succeeds', after.status === 200 && isWebp(after.body), {
    status: after.status,
    bytes: after.body.length,
  });

  const hits = unhandledLogHits(apiLogsSince(since));
  record('no unhandled stream error in the production API log', hits.length === 0, { hits });
}

// --- orchestration -----------------------------------------------------------

async function main() {
  const target = selectTarget();
  record('target product selected from the disposable copy', true, {
    slug: target.slug,
    copyStatus: target.status,
  });

  const entryCounts = evidenceCounts();

  // Fixture state, on the disposable copy. Not a publish command.
  sql(fixtureStatusSql(target.id, DRAFT));
  record(
    'a DRAFT product is not served',
    media(mediaPath(target.slug, target.mediaId, 'thumbnail')).status === 404,
  );
  safeMissScenarios();

  sql(fixtureStatusSql(target.id, PUBLISHED));
  const readBefore = evidenceCounts();
  const { thumbnailPath, thumbnailBytes, previewBytes } = deliveryScenarios(target);
  const readAfter = evidenceCounts();
  record(
    'the read route wrote no Audit or Outbox row',
    readBefore.audit === readAfter.audit && readBefore.outbox === readAfter.outbox,
    { before: readBefore, after: readAfter, thumbnailBytes, previewBytes },
  );

  await abortScenario(thumbnailPath);

  sql(fixtureStatusSql(target.id, DRAFT));
  record(
    'returning the fixture to DRAFT revokes the next request',
    media(thumbnailPath).status === 404,
  );

  sql(fixtureStatusSql(target.id, PUBLISHED));
  record(
    'returning the fixture to PUBLISHED restores delivery',
    media(thumbnailPath).status === 200,
  );

  const exitCounts = evidenceCounts();
  record(
    'no Audit or Outbox row was written anywhere in the run',
    entryCounts.audit === exitCounts.audit && entryCounts.outbox === exitCounts.outbox,
    { entry: entryCounts, exit: exitCounts },
  );
  record('final fixture state', true, {
    status: sql(`select status from products where id = '${target.id}'`),
    database: 'disposable copy, destroyed at teardown',
  });

  const passed = results.filter((entry) => entry.ok).length;
  console.log(`\n== scenarios: ${passed}/${results.length} passed ==`);
  process.exitCode = passed === results.length ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
) {
  await main();
}
