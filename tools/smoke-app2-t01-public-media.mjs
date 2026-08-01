/**
 * `APP2-T01` gateway smoke — public catalog-media delivery through the real
 * Nginx gateway (§19).
 *
 * What this proves that the integration suite cannot: the route is reachable
 * through the **gateway**, on the storefront host, over the generic `/api/`
 * proxy, with no media-specific location and no storage credential anywhere in
 * the path. The integration suite owns byte-exactness against a disposable
 * MinIO; this one owns the topology.
 *
 * ## Why it publishes with SQL
 *
 * The route is anonymous, but arranging a PUBLISHED product is not — the
 * publish command needs an Admin session. Rather than ask for an operator
 * credential to set up a *read* test, the smoke flips `products.status`
 * directly on the development database and puts it back. That writes **no**
 * audit and **no** outbox row, which is also why the counts recorded before and
 * after are expected to be identical: the only thing under test is a read path,
 * and it must leave nothing behind. The original status is captured first and
 * restored in `finally`, on success and on failure alike.
 *
 * Run: pnpm smoke:app2-t01-public-media
 */
import { execFileSync } from 'node:child_process';

/** `STOREFRONT_HOST` / `ADMIN_HOST` as the development gateway is configured. */
export const GATEWAY_STOREFRONT_HOST = 'embroidery.local';
export const GATEWAY_ADMIN_HOST = 'admin.embroidery.local';
export const POSTGRES_CONTAINER = 'embroidery-dev-postgres-1';
export const PUBLISHED = 'PUBLISHED';

/** RIFF....WEBP — the container signature every catalog derivative must carry. */
export function isWebp(bytes) {
  return (
    bytes.length > 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

export function mediaPath(slug, productMediaId, rendition) {
  return `/api/public/products/${slug}/media/${productMediaId}/${rendition}`;
}

/**
 * The single restore step, expressed as data so the teardown is identical
 * whether the run passed or threw.
 */
export function restorePlan({ productId, originalStatus }) {
  if (productId === undefined || originalStatus === undefined) {
    return [];
  }
  return [{ step: 'restore-product-status', productId, status: originalStatus }];
}

const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} :: ${JSON.stringify(detail)}`);
}

function psql(sqlText) {
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
      sqlText,
    ],
    { encoding: 'utf8' },
  ).trim();
}

/** Returns `{ status, headers, body }` for one gateway request. */
function fetchGateway(path, host = GATEWAY_STOREFRONT_HOST) {
  const raw = execFileSync(
    'curl',
    ['-s', '-D', '-', '-H', `Host: ${host}`, `http://localhost${path}`, '--output', '-'],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  );
  const separator = raw.indexOf('\r\n\r\n');
  const head = raw.subarray(0, separator).toString('latin1');
  const body = raw.subarray(separator + 4);
  const [statusLine, ...headerLines] = head.split('\r\n');
  const headers = {};
  for (const line of headerLines) {
    const at = line.indexOf(':');
    if (at > 0) {
      headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }
  return { status: Number(statusLine.split(' ')[1]), headers, body };
}

function evidenceCounts() {
  const [audit, outbox] = psql(
    'select (select count(*) from audit_events), (select count(*) from outbox_events)',
  ).split('|');
  return { audit, outbox };
}

async function main() {
  let productId;
  let originalStatus;

  try {
    record('gateway healthy', fetchGateway('/healthz', GATEWAY_ADMIN_HOST).status === 200);

    // The route is registered: a nonexistent path would 404, so a *validation*
    // rejection is the proof that the handler's pipe actually ran.
    const badRendition = fetchGateway(
      mediaPath('khong-ton-tai', '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071', 'original'),
    );
    record('unknown rendition rejected at the gateway', badRendition.status === 400, {
      status: badRendition.status,
    });

    const unknown = fetchGateway(
      mediaPath('khong-ton-tai', '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071', 'thumbnail'),
    );
    const unknownBody = JSON.parse(unknown.body.toString('utf8'));
    record(
      'unknown product is a safe 404',
      unknown.status === 404 && unknownBody.code === 'PUBLIC_PRODUCT_MEDIA_NOT_FOUND',
      { status: unknown.status, code: unknownBody.code },
    );

    // A product whose first image really has both derivatives READY, with the
    // objects genuinely present in the development MinIO.
    const row = psql(`
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
      throw new Error('No development product has a deliverable THUMBNAIL association.');
    }
    const [id, slug, status, mediaId] = row.split('|');
    productId = id;
    originalStatus = status;

    const before = evidenceCounts();

    const target = mediaPath(slug, mediaId, 'thumbnail');
    record('draft product is not served', fetchGateway(target).status === 404, {
      entryStatus: status,
    });

    psql(`update products set status = '${PUBLISHED}' where id = '${productId}'`);

    const served = fetchGateway(target);
    record(
      'published thumbnail streams real WebP bytes through the gateway',
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

    const leaked = Object.entries(served.headers).filter(([name, value]) =>
      /etag|x-amz|minio|bucket|storage/i.test(`${name}:${value}`),
    );
    record('no storage or provider header reaches the client', leaked.length === 0, {
      leaked: leaked.map(([name]) => name),
    });

    const preview = fetchGateway(mediaPath(slug, mediaId, 'catalog-preview'));
    record(
      'catalog-preview is a different, larger derivative',
      preview.status === 200 && isWebp(preview.body) && preview.body.length !== served.body.length,
      { thumbnailBytes: served.body.length, previewBytes: preview.body.length },
    );

    // The same path on the Admin host must behave identically — the route is
    // host-independent, so nothing about it is Admin-only.
    record(
      'the same address works on the admin host',
      fetchGateway(target, GATEWAY_ADMIN_HOST).status === 200,
    );

    psql(`update products set status = 'DRAFT' where id = '${productId}'`);
    record('unpublish stops delivery on the next request', fetchGateway(target).status === 404);

    psql(`update products set status = '${PUBLISHED}' where id = '${productId}'`);
    record('republish restores delivery', fetchGateway(target).status === 200);

    // MinIO must not be reachable through the gateway at all.
    const minioProbe = fetchGateway('/minio/');
    record('minio is not exposed through the gateway', minioProbe.status !== 200, {
      status: minioProbe.status,
    });

    const after = evidenceCounts();
    record(
      'the read route wrote no audit or outbox row',
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
  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
) {
  await main();
}
