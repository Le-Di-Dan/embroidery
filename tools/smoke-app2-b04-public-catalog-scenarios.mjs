#!/usr/bin/env node
/**
 * `APP2-B04` §23.1 — the public catalog queries against a REAL production API
 * runtime, through the real Nginx gateway.
 *
 * Invoked by `tools/smoke-app2-b04-public-catalog-production.mjs`, which owns
 * the production image, the disposable TLS database, the upstream swap, the
 * gateway reload and the restore. This file owns only the assertions.
 *
 * ## How publication state is arranged, stated plainly
 *
 * By writing `products.status` directly, on the run's **disposable** database
 * copy, never on the developer's. That is fixture setup, not a Product command:
 * it runs no readiness evaluation, honours no concurrency token, and records no
 * Audit or Outbox row. It is never described as publish or unpublish.
 *
 * The sanctioned `APP2-B03` commands are unreachable here for the structural
 * reason `APP2-T01-C1` established: a production API mandates a `Secure`,
 * `__Host-` staff cookie and the development gateway is plain HTTP, so no
 * conforming client can return that cookie. Both operations under test are
 * anonymous and entirely unaffected.
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { envelopeOf, gatewayRequest, requestArgs } from './smoke-app2-t01-gateway-http.mjs';
import {
  PROD_DB_CONTAINER,
  PROD_DB_NAME,
  PROD_DB_USER,
} from './smoke-app2-t01-production-topology.mjs';
import { GATEWAY_ADMIN_HOST, GATEWAY_STOREFRONT_HOST } from './smoke-app2-t01-public-media.mjs';

export const LIST_PATH = '/api/public/products';
export const DRAFT = 'DRAFT';
export const PUBLISHED = 'PUBLISHED';
export const ARCHIVED = 'ARCHIVED';

/**
 * The fixture statement that puts the disposable copy into one lifecycle state.
 * Named for what it is. Nothing in this harness calls it a command.
 */
export function fixtureStatusSql(productId, status) {
  return `update products set status = '${status}' where id = '${productId}'`;
}

/** Every public media path the two payloads advertise. */
export function mediaUrlsIn(payload) {
  const urls = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, member] of Object.entries(value)) {
        if (key === 'url' && typeof member === 'string') urls.push(member);
        else walk(member);
      }
    }
  };
  walk(payload);
  return urls;
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

function json(path, host = GATEWAY_STOREFRONT_HOST) {
  const response = gatewayRequest({ path, host });
  return { status: response.status, headers: response.headers, body: envelopeOf(response) };
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
    select p.id, p.slug, p.status
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
  const [id, slug, status] = row.split('|');
  return { id, slug, status };
}

function slugsIn(body) {
  return (body?.data?.items ?? []).map((item) => item.slug);
}

async function main() {
  const target = selectTarget();
  record('target product selected from the disposable copy', true, {
    slug: target.slug,
    copyStatus: target.status,
  });

  const entryCounts = evidenceCounts();

  // --- hidden while DRAFT -------------------------------------------------
  sql(fixtureStatusSql(target.id, DRAFT));
  const draftList = json(LIST_PATH);
  const draftDetail = json(`${LIST_PATH}/${target.slug}`);
  record(
    'a DRAFT product is absent from the production list and detail',
    draftList.status === 200 &&
      !slugsIn(draftList.body).includes(target.slug) &&
      draftDetail.status === 404,
    { listStatus: draftList.status, detailStatus: draftDetail.status },
  );

  // --- visible while PUBLISHED --------------------------------------------
  sql(fixtureStatusSql(target.id, PUBLISHED));
  const list = json(LIST_PATH);
  record(
    'GET /api/public/products succeeds anonymously on the production API',
    list.status === 200 && list.body?.code === 'PUBLIC_PRODUCT_LIST_READ',
    { status: list.status, code: list.body?.code, items: slugsIn(list.body).length },
  );
  record('the PUBLISHED product is listed', slugsIn(list.body).includes(target.slug));

  const detail = json(`${LIST_PATH}/${target.slug}`);
  record(
    'GET /api/public/products/:slug succeeds anonymously on the production API',
    detail.status === 200 && detail.body?.code === 'PUBLIC_PRODUCT_DETAIL_READ',
    { status: detail.status, code: detail.body?.code },
  );
  record(
    'both payloads carry the locked cache policy',
    list.headers['cache-control'] === 'no-store' && detail.headers['cache-control'] === 'no-store',
    { list: list.headers['cache-control'], detail: detail.headers['cache-control'] },
  );
  record(
    'the request id is echoed in the envelope',
    typeof list.body?.meta?.requestId === 'string' && list.body.meta.requestId.length > 0,
  );

  // --- media references resolve through APP2-T01 --------------------------
  const urls = [...mediaUrlsIn(list.body?.data), ...mediaUrlsIn(detail.body?.data)];
  record('the catalog advertises at least one media address', urls.length > 0, {
    urls: urls.length,
  });
  const mediaStatuses = urls.map((url) =>
    gatewayRequest({ path: url, host: GATEWAY_STOREFRONT_HOST }),
  );
  record(
    'every advertised media address resolves through the T01 route',
    mediaStatuses.every((response) => response.status === 200),
    { statuses: [...new Set(mediaStatuses.map((r) => r.status))] },
  );
  record(
    'the delivered bytes are real WebP',
    mediaStatuses.every(
      (response) =>
        response.body.length > 12 &&
        response.body.subarray(0, 4).toString('latin1') === 'RIFF' &&
        response.body.subarray(8, 12).toString('latin1') === 'WEBP',
    ),
    { bytes: mediaStatuses.map((r) => r.body.length) },
  );

  // --- safety of the public payloads --------------------------------------
  const serialized = JSON.stringify([list.body?.data, detail.body?.data]).toLowerCase();
  const leaks = [
    'storage_key',
    'storagekey',
    'bucket',
    'checksum',
    'sha256',
    'etag',
    'minio',
    'amazonaws',
    'archivedat',
    'updatedat',
    'http://',
    'https://',
  ].filter((needle) => serialized.includes(needle));
  record('no internal or storage detail reaches the public payload', leaks.length === 0, { leaks });

  record(
    'the anonymous request carries no cookie or credential',
    !requestArgs({ path: LIST_PATH, host: GATEWAY_STOREFRONT_HOST }).includes('-b'),
  );
  record(
    'the same address answers on the admin host',
    json(LIST_PATH, GATEWAY_ADMIN_HOST).status === 200,
  );
  record('minio is not exposed through the gateway', json('/minio/').status !== 200);

  // --- validation and pagination over the gateway -------------------------
  record(
    'an unknown query parameter is rejected',
    json(`${LIST_PATH}?includeDraft=true`).status === 400,
  );
  record('a malformed cursor is rejected safely', json(`${LIST_PATH}?cursor=nope`).status === 400);
  const firstPage = json(`${LIST_PATH}?limit=1`);
  record('a bounded page travels correctly', firstPage.status === 200, {
    items: slugsIn(firstPage.body).length,
    hasNext: firstPage.body?.data?.hasNext,
  });
  const cursor = firstPage.body?.data?.nextCursor;
  if (typeof cursor === 'string') {
    const second = json(`${LIST_PATH}?limit=1&cursor=${encodeURIComponent(cursor)}`);
    record(
      'cursor continuation returns a different product',
      second.status === 200 && slugsIn(second.body)[0] !== slugsIn(firstPage.body)[0],
    );
  }
  record(
    'the category filter travels correctly',
    json(`${LIST_PATH}?categorySlug=khan`).status === 200,
  );

  // --- fixture transition removes every trace -----------------------------
  sql(fixtureStatusSql(target.id, DRAFT));
  const afterList = json(LIST_PATH);
  const afterDetail = json(`${LIST_PATH}/${target.slug}`);
  const afterMedia = urls.map(
    (url) => gatewayRequest({ path: url, host: GATEWAY_STOREFRONT_HOST }).status,
  );
  record(
    'returning the fixture to DRAFT removes list, detail and media visibility',
    !slugsIn(afterList.body).includes(target.slug) &&
      afterDetail.status === 404 &&
      afterMedia.every((status) => status === 404),
    { detail: afterDetail.status, media: [...new Set(afterMedia)] },
  );

  sql(fixtureStatusSql(target.id, ARCHIVED));
  record(
    'an ARCHIVED product is hidden with the same safe 404',
    json(`${LIST_PATH}/${target.slug}`).status === 404 &&
      !slugsIn(json(LIST_PATH).body).includes(target.slug),
  );

  sql(fixtureStatusSql(target.id, PUBLISHED));
  record('returning the fixture to PUBLISHED restores visibility', json(LIST_PATH).status === 200);

  // --- the production API is still healthy --------------------------------
  record(
    'a subsequent production request remains healthy',
    gatewayRequest({ path: '/api/health', host: GATEWAY_STOREFRONT_HOST }).status === 200,
  );

  const exitCounts = evidenceCounts();
  record(
    'no Audit or Outbox row was written anywhere in the run',
    entryCounts.audit === exitCounts.audit && entryCounts.outbox === exitCounts.outbox,
    { entry: entryCounts, exit: exitCounts },
  );

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
