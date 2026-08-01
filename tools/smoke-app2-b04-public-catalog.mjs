#!/usr/bin/env node
/**
 * `APP2-B04` §22 — the public catalog queries through the real Nginx gateway,
 * against the ordinary development stack.
 *
 * What this proves that the API suites cannot: the two operations are reachable
 * through the **gateway**, on the storefront host, over the generic `/api/`
 * proxy, with no catalog-specific location and no credential anywhere in the
 * path. The integration suites own correctness; this one owns the topology.
 *
 * ## How publication state is arranged, stated plainly
 *
 * By writing `products.status` directly on the development database, and
 * putting it back in `finally`. That is fixture setup, not a Product command:
 * it runs no readiness evaluation, honours no concurrency token, and records no
 * Audit or Outbox row — which is also why the counts recorded before and after
 * are expected to be identical. Arranging a PUBLISHED product through the
 * sanctioned `APP2-B03` operations would need an Admin session, and asking for
 * an operator credential to set up a *read* test is not warranted. The entry
 * status is captured first and restored on success and on failure alike.
 *
 * Run: pnpm smoke:app2-b04-public-catalog
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { envelopeOf, gatewayRequest } from './smoke-app2-t01-gateway-http.mjs';
import {
  GATEWAY_ADMIN_HOST,
  GATEWAY_STOREFRONT_HOST,
  POSTGRES_CONTAINER,
} from './smoke-app2-t01-public-media.mjs';
import { mediaUrlsIn } from './smoke-app2-b04-public-catalog-scenarios.mjs';

export const LIST_PATH = '/api/public/products';

/** The single restore step, expressed as data so teardown is identical. */
export function restorePlan({ productId, originalStatus }) {
  if (productId === undefined || originalStatus === undefined) return [];
  return [{ step: 'restore-product-status', productId, status: originalStatus }];
}

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${JSON.stringify(detail)}`);
}

function psql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      'embroidery',
      '-d',
      'embroidery',
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
  const [audit, outbox] = psql(
    'select (select count(*) from audit_events), (select count(*) from outbox_events)',
  ).split('|');
  return { audit, outbox };
}

function slugsIn(body) {
  return (body?.data?.items ?? []).map((item) => item.slug);
}

async function main() {
  let productId;
  let originalStatus;

  try {
    record('gateway healthy', json('/healthz', GATEWAY_ADMIN_HOST).status === 200);

    const row = psql(`
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
      throw new Error('No development product has a deliverable THUMBNAIL association.');
    }
    const [id, slug, status] = row.split('|');
    productId = id;
    originalStatus = status;

    const before = evidenceCounts();

    psql(`update products set status = 'DRAFT' where id = '${productId}'`);
    const draftList = json(LIST_PATH);
    record(
      'a DRAFT product is absent from list and detail',
      draftList.status === 200 &&
        !slugsIn(draftList.body).includes(slug) &&
        json(`${LIST_PATH}/${slug}`).status === 404,
      { listStatus: draftList.status },
    );

    psql(`update products set status = 'ARCHIVED' where id = '${productId}'`);
    record(
      'an ARCHIVED product is hidden with the same safe 404',
      !slugsIn(json(LIST_PATH).body).includes(slug) && json(`${LIST_PATH}/${slug}`).status === 404,
    );

    psql(`update products set status = 'PUBLISHED' where id = '${productId}'`);
    const list = json(LIST_PATH);
    record(
      'the list succeeds anonymously through the gateway',
      list.status === 200 && list.body?.code === 'PUBLIC_PRODUCT_LIST_READ',
      { status: list.status, items: slugsIn(list.body).length },
    );
    record('the PUBLISHED product is listed', slugsIn(list.body).includes(slug));

    const detail = json(`${LIST_PATH}/${slug}`);
    record(
      'the detail succeeds anonymously through the gateway',
      detail.status === 200 && detail.body?.code === 'PUBLIC_PRODUCT_DETAIL_READ',
      { status: detail.status },
    );
    record(
      'both payloads carry the locked cache policy',
      list.headers['cache-control'] === 'no-store' &&
        detail.headers['cache-control'] === 'no-store',
    );
    record(
      'the canonical request id header is present',
      typeof list.headers['x-request-id'] === 'string' &&
        typeof list.body?.meta?.requestId === 'string',
    );

    const urls = [...mediaUrlsIn(list.body?.data), ...mediaUrlsIn(detail.body?.data)];
    const mediaStatuses = urls.map(
      (url) => gatewayRequest({ path: url, host: GATEWAY_STOREFRONT_HOST }).status,
    );
    record(
      'every advertised media address resolves through the approved route',
      urls.length > 0 && mediaStatuses.every((code) => code === 200),
      { urls: urls.length, statuses: [...new Set(mediaStatuses)] },
    );

    record(
      'an unknown query parameter is rejected',
      json(`${LIST_PATH}?includeDraft=1`).status === 400,
    );
    record('a malformed cursor is rejected', json(`${LIST_PATH}?cursor=nope`).status === 400);

    const first = json(`${LIST_PATH}?limit=1`);
    record('a bounded page travels through the gateway', first.status === 200);
    const cursor = first.body?.data?.nextCursor;
    if (typeof cursor === 'string') {
      const second = json(`${LIST_PATH}?limit=1&cursor=${encodeURIComponent(cursor)}`);
      record(
        'the cursor travels and advances',
        second.status === 200 && slugsIn(second.body)[0] !== slugsIn(first.body)[0],
      );
    }
    record('the category filter travels', json(`${LIST_PATH}?categorySlug=khan`).status === 200);

    record(
      'the same address answers on the admin host',
      json(LIST_PATH, GATEWAY_ADMIN_HOST).status === 200,
    );
    record('minio is not exposed through the gateway', json('/minio/').status !== 200);
    record(
      'no Storefront product route exists',
      gatewayRequest({ path: `/san-pham/${slug}`, host: GATEWAY_STOREFRONT_HOST }).status !== 200,
    );

    const after = evidenceCounts();
    record(
      'the read routes wrote no audit or outbox row',
      before.audit === after.audit && before.outbox === after.outbox,
      { before, after },
    );
  } finally {
    for (const step of restorePlan({ productId, originalStatus })) {
      psql(`update products set status = '${step.status}' where id = '${step.productId}'`);
      const restored = psql(`select status from products where id = '${step.productId}'`);
      record('development product restored to its entry status', restored === originalStatus, {
        status: restored,
      });
    }
  }

  const passed = results.filter((entry) => entry.ok).length;
  console.log(`\n== summary: ${passed}/${results.length} passed ==`);
  if (passed !== results.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
) {
  await main();
}
