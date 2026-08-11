#!/usr/bin/env node
/**
 * `APP3-S01` §26 — the disposable Studio fixtures the browser proof needs.
 *
 * Every statement targets the **development** database, and every row it writes
 * carries a run-scoped id prefix so `revert` removes exactly what `seed`
 * created and nothing else. This is fixture setup, not a command: it runs no
 * publication readiness evaluation, honours no concurrency token, writes no
 * Audit or Outbox row, and nothing here calls itself publish.
 *
 * It exists because the development database contains **no published Product at
 * all** — every Product there is `DRAFT` or `ARCHIVED` — and no published Design
 * Template, so the Studio route would have nothing to render.
 *
 * The Templates are synthetic; the **bytes are not**. The Template artwork's
 * `NORMALIZED` derivative points at an object that really exists in MinIO, put
 * there by `APP3-W01A` when the operator uploaded the Side background, so the
 * browser fetches real WebP bytes through the real `APP3-B05A` route and the
 * server's size reconciliation is a real comparison.
 *
 * `TEMPLATE_SOURCE` intake has no production surface —
 * `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` is open — which is exactly why the
 * artwork Asset is seeded here rather than uploaded. Inventing an intake API to
 * make a browser run possible is the thing that follow-up exists to prevent.
 *
 * Usage:
 *   node tools/smoke-app3-s01-fixtures.mjs seed
 *   node tools/smoke-app3-s01-fixtures.mjs revert
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTAINER = 'embroidery-dev-postgres-1';
const DB_USER = 'embroidery';
const DB_NAME = 'embroidery';

export function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      CONTAINER,
      'psql',
      '-U',
      DB_USER,
      '-d',
      DB_NAME,
      '-v',
      'ON_ERROR_STOP=1',
      '-tAF|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

/** The existing development placement this run publishes. */
export const PRODUCT_ID = '019fb93e-2b75-71d7-8485-32e76283f99f';
export const PRODUCT_SLUG = 'a03-live-check-redirect';
export const SIDE_ONE = '019fe415-2538-7a33-86d7-b5ac02792b1b';
export const AREA_ONE = '019fe491-1d24-7856-8cc9-ad397c7e4342';
const BACKGROUND_ASSET = '019fe413-4e6d-7ba6-9269-713bbf026404';

/**
 * The object `APP3-W01A` really wrote, copied to the Template artwork's own
 * key so the browser proof streams real bytes.
 *
 * A copy rather than a second row pointing at the same object: the schema
 * enforces one derivative per storage key, and it is right to — an address that
 * two rows claim is an address neither of them owns. The copy runs through the
 * S3 API inside the API container, which already holds the storage credentials
 * in its process environment.
 */
const SOURCE_OBJECT_KEY = `development/derivatives/${BACKGROUND_ASSET}/NORMALIZED.webp`;
const REAL_OBJECT_BYTES = 10100;

/** Run-scoped ids. Everything this file creates starts with this prefix. */
/**
 * `GENERATION` bumps when a re-seed needs **new** rows.
 *
 * A published `design_template_versions` row is frozen by a database
 * immutability trigger and can be neither updated nor deleted — correctly, and
 * that rule is not this tool's to work around. So a fixture whose document has
 * to change gets a new id rather than an edited one, and `revert` sweeps every
 * generation by the shared `FAMILY` prefix.
 */
const FAMILY = '019fe70';
const GENERATION = '4';

/** Every generation ever seeded, so `revert` sweeps the objects of all of them. */
const GENERATIONS = ['0', '1', '2', '3', '4'];
const PREFIX = `${FAMILY}${GENERATION}`;
const id = (n) => `${PREFIX}-0000-7000-8000-${String(n).padStart(12, '0')}`;

/**
 * Placement rows keep **generation-independent** ids.
 *
 * A Side or Area referenced by a Design Session is protected by the database
 * and can only be retired, never deleted — so a second generation must reuse
 * the same rows rather than try to insert a second Side under the same
 * `(product, code)`. Only the Templates, their frozen versions and the artwork
 * Asset vary by generation.
 */
const stable = (n) => `${FAMILY}0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const SIDE_TWO = stable(1);
const AREA_TWO = stable(2);
const AREA_ONE_B = stable(3);
const ARTWORK_ASSET = id(10);
const ARTWORK_DERIVATIVE = id(11);
const ARTWORK_OBJECT_KEY = `development/derivatives/${ARTWORK_ASSET}/NORMALIZED.webp`;

const API_CONTAINER = 'embroidery-dev-api-1';
const OBJECT_SCRIPT = new URL('./smoke-app3-s01-object-copy.cjs', import.meta.url);

/** Runs the object-storage step inside the API container. */
function object(...args) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      API_CONTAINER,
      'sh',
      '-c',
      `cd /app/packages/object-storage && node - ${args.join(' ')}`,
    ],
    { encoding: 'utf8', input: readFileSync(OBJECT_SCRIPT, 'utf8') },
  ).trim();
}

/** Twelve is one page, so fourteen guarantees real keyset continuation. */
const TEMPLATE_COUNT = 14;
const templateId = (n) => id(100 + n);
const versionId = (n) => id(200 + n);
const associationId = (n) => id(300 + n);

const TEMPLATE_NAMES = [
  'Hoa sen mùa hạ',
  'Sóng biển Nha Trang',
  'Cúc họa mi tháng Mười',
  'Chỉ vàng viền tay áo',
  'Thỏ trắng của Mai',
  'Vườn hồng tháng Tư',
  'Lá cọ Tây Nguyên',
  'Mèo mướp ngủ trưa',
  'Đèn lồng Hội An',
  'Nhành mai vàng',
  'Cá chép hoá rồng',
  'Trống đồng cách điệu',
  'Chữ thêu tay',
  'Bụi tre sau nhà',
];

/** The one Template with no image element: a text-only Template is valid. */
const TEXT_ONLY_INDEX = 12;

function documentFor(index) {
  const placement = {
    pxPerMm: 1,
    canvasWidthPx: 400,
    canvasHeightPx: 400,
    physicalWidthMm: 400,
    physicalHeightMm: 400,
    productSideId: SIDE_ONE,
    embroideryAreaId: AREA_ONE,
  };
  const text = {
    id: 'element-text',
    type: 'text',
    text: TEMPLATE_NAMES[index],
    fill: '#101010',
    fontId: 'inter',
    fontSizePx: 16,
    fontStyle: 'normal',
    fontWeight: 400,
    textAlign: 'left',
    locked: false,
    opacity: 1,
    visible: true,
    transform: { x: 110, y: 150, width: 80, height: 20, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  };
  const image = {
    id: 'element-image',
    type: 'image',
    assetId: ARTWORK_ASSET,
    derivativeId: ARTWORK_DERIVATIVE,
    intrinsicWidthPx: 600,
    intrinsicHeightPx: 600,
    locked: false,
    opacity: 1,
    visible: true,
    transform: { x: 110, y: 110, width: 80, height: 30, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  };
  return {
    schemaVersion: 1,
    placement,
    elements: index === TEXT_ONLY_INDEX ? [text] : [image, text],
  };
}

function literal(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function seed() {
  // The Product becomes publicly visible. Its category is already public.
  sql(`update products set status = 'PUBLISHED' where id = '${PRODUCT_ID}'`);

  // A second Side and a second Area on the first Side, so both halves of
  // IMP-D041's "customer selects" branch are exercised in a real browser.
  sql(`
    insert into product_sides (id, product_id, name, code, background_asset_id, image_width_px,
      image_height_px, physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values ('${SIDE_TWO}', '${PRODUCT_ID}', 'Mặt sau', 'mat-sau', '${BACKGROUND_ASSET}',
      400, 400, 400, 400, 1, 1)
    on conflict (id) do update set retired_at = null;

    insert into embroidery_areas (id, product_side_id, name, code, bound_x_px, bound_y_px,
      bound_width_px, bound_height_px, display_order)
    values ('${AREA_TWO}', '${SIDE_TWO}', 'Lưng', 'lung', 100, 100, 200, 200, 0),
           ('${AREA_ONE_B}', '${SIDE_ONE}', 'Tay áo', 'tay-ao', 220, 100, 80, 80, 1)
    on conflict (id) do update set retired_at = null;
  `);

  // Real bytes under the artwork's own key, copied from the object APP3-W01A
  // wrote. The row below records that key, so nothing is invented.
  object('copy', SOURCE_OBJECT_KEY, ARTWORK_OBJECT_KEY);

  // The Template artwork. Kind, classification and status are exactly what
  // `APP3-B05A` requires; the derivative is READY, NORMALIZED, unwatermarked
  // and carries the whole quartet, pointing at a real object.
  sql(`
    insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
    values ('${ARTWORK_ASSET}', 'TEMPLATE_SOURCE', 'PRODUCTION_SENSITIVE',
      'development/originals/${ARTWORK_ASSET}/original.webp', 'image/webp', ${REAL_OBJECT_BYTES}, 'ACCEPTED')
    on conflict (id) do nothing;

    insert into asset_derivatives (id, asset_id, kind, status, storage_key, is_watermarked,
      width_px, height_px, media_type, byte_size)
    values ('${ARTWORK_DERIVATIVE}', '${ARTWORK_ASSET}', 'NORMALIZED', 'READY',
      '${ARTWORK_OBJECT_KEY}', false, 600, 600, 'image/webp', ${REAL_OBJECT_BYTES})
    on conflict (id) do nothing;
  `);

  for (let index = 0; index < TEMPLATE_COUNT; index += 1) {
    const template = templateId(index);
    const slug = `s01-g${GENERATION}-mau-${String(index + 1).padStart(2, '0')}`;
    sql(`
      insert into design_templates (id, name, slug, status, current_version, product_id,
        product_side_id, embroidery_area_id)
      values ('${template}', '${TEMPLATE_NAMES[index].replaceAll("'", "''")}', '${slug}',
        'PUBLISHED', 1, '${PRODUCT_ID}', '${SIDE_ONE}', '${AREA_ONE}')
      on conflict (id) do nothing;

      insert into design_template_versions (id, design_template_id, version, design_document,
        document_schema_version, published_at)
      values ('${versionId(index)}', '${template}', 1, ${literal(documentFor(index))}, 1, now())
      on conflict (id) do nothing;
    `);
    if (index === TEXT_ONLY_INDEX) continue;
    // The durable association. `APP3-B05A` requires it **in addition to** the
    // document reference, so a Template without one is a Template whose preview
    // is correctly refused.
    sql(`
      insert into design_template_assets (id, design_template_id, asset_id)
      values ('${associationId(index)}', '${template}', '${ARTWORK_ASSET}')
      on conflict (id) do nothing;
    `);
  }

  report();
}

function revert() {
  // Templates are **archived**, not deleted: their published versions are
  // frozen rows the database refuses to remove, and forcing that open would be
  // defeating an invariant rather than cleaning up after a fixture. Archived is
  // enough — an archived Template is invisible to every public read.
  sql(`delete from design_template_assets where id::text like '${FAMILY}%'`);
  sql(`
    update design_templates set status = 'ARCHIVED', archived_at = now()
    where id::text like '${FAMILY}%' and archived_at is null
  `);
  for (const generation of GENERATIONS) {
    const key = `development/derivatives/${FAMILY}${generation}-0000-7000-8000-000000000010/NORMALIZED.webp`;
    try {
      object('delete', key);
    } catch {
      // A generation that was never seeded has no object to remove.
    }
  }
  sql(`delete from asset_derivatives where id::text like '${FAMILY}%'`);
  sql(`delete from assets where id::text like '${FAMILY}%'`);
  // Sides and Areas are **retired**, not deleted, for the same reason: the
  // database refuses to delete a placement row a Design Session references, and
  // says so in as many words. Retired is what the manifest already treats as
  // absent.
  sql(`
    update embroidery_areas set retired_at = now()
    where id::text like '${FAMILY}%' and retired_at is null;
    update product_sides set retired_at = now()
    where id::text like '${FAMILY}%' and retired_at is null;
  `);
  sql(`update products set status = 'DRAFT' where id = '${PRODUCT_ID}'`);
  console.log('APP3-S01 fixtures reverted; the development database is back to DRAFT.');
}

function report() {
  const published = sql(`select count(*) from products where status = 'PUBLISHED'`);
  const templates = sql(
    `select count(*) from design_templates where status = 'PUBLISHED' and product_id = '${PRODUCT_ID}'`,
  );
  const sides = sql(
    `select count(*) from product_sides where product_id = '${PRODUCT_ID}' and retired_at is null`,
  );
  console.log(
    [
      `published products = ${published}`,
      `published templates on the fixture placement = ${templates}`,
      `active sides = ${sides}`,
      `studio route = /san-pham/${PRODUCT_SLUG}/thiet-ke`,
    ].join('\n'),
  );
}

// Only when run directly. This module also *exports* the placement it seeds, so
// that `APP3-S07`'s benchmark fixtures hang off the same Side and Area rather
// than a second copy of the ids — and an import must not seed anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'seed') seed();
  else if (command === 'revert') revert();
  else if (command === 'report') report();
  else {
    console.error('usage: smoke-app3-s01-fixtures.mjs <seed|revert|report>');
    process.exitCode = 1;
  }
}
