#!/usr/bin/env node
/**
 * `APP3-S03` — the three deterministic scenes the transform benchmark measures.
 *
 * Same shape as the `APP3-S07` fixtures and for the same reasons: real
 * published Design Templates that a real browser clones into a real Session, at
 * the sizes a production document can actually hold. `APP3-P01` caps a document
 * at `maxElements = 100`, so `L` is 100 and not the frozen `APP0-R01` 150 — a
 * 150-element document is refused by the server and no customer can ever have
 * one.
 *
 * Unlike S07's run, **`M` is measured too**: the whole question here is whether
 * a gesture's cost scales with the scene, and a benchmark that skipped the
 * middle could not answer it.
 *
 * Every element sits inside the Embroidery Area, derived from the persisted
 * rectangle rather than assumed — a Session refuses a document that leaves the
 * area, so a scene laid out on the canvas would simply fail to open.
 *
 * Usage:
 *   node tools/bench-app3-s03-fixtures.mjs seed
 *   node tools/bench-app3-s03-fixtures.mjs revert
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AREA_ONE, PRODUCT_ID, SIDE_ONE, sql } from './smoke-app3-s01-fixtures.mjs';

/** The L scene is 100 elements of canonical JSON; Windows refuses that argv. */
function sqlStdin(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'embroidery-dev-postgres-1',
      'psql',
      '-U',
      'embroidery',
      '-d',
      'embroidery',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAF|',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: statement },
  ).trim();
}

/** S, M and L. `L` is `DESIGN_DOCUMENT_LIMITS.maxElements`, the production cap. */
export const SCENE_ELEMENT_COUNTS = Object.freeze({ S: 10, M: 50, L: 100 });

const FAMILY = '019fe90';
/**
 * Bumped whenever a re-seed needs new rows. A published version is frozen and
 * the database refuses to delete one, so `revert` archives instead — and a
 * fixture whose document changed needs a new id, or `on conflict do nothing`
 * silently keeps the previous run's geometry.
 */
const GENERATION = '3';
const GENERATIONS = ['0', '1', '2', '3'];
const PREFIX = `${FAMILY}${GENERATION}`;

/** Room inside the area for the stroke envelope and the rotated cells. */
const MARGIN_PX = 4;

function id(index) {
  return `${PREFIX}-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

export function templateSlug(size) {
  return `s03-bench-g${GENERATION}-${size.toLowerCase()}`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** The persisted embroidery area, read rather than assumed. */
function areaBounds() {
  const row = sql(
    `select bound_x_px, bound_y_px, bound_width_px, bound_height_px
     from embroidery_areas where id = '${AREA_ONE}'`,
  );
  const [x, y, width, height] = row.split('|').map(Number);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error('APP3-S03 fixtures: the embroidery area could not be read.');
  }
  return { x, y, width, height };
}

/**
 * A grid of stroked rectangles, one of them rotated every seventh cell.
 *
 * Shapes rather than text or images: a text element would pull the controlled
 * font registry into the measurement and an image element would render the
 * `APP3-S02` placeholder, and a transform benchmark is about neither. The
 * rotated cells matter — they are the ones whose handles have to be placed on
 * the oriented box rather than on an axis-aligned one.
 */
function documentFor(count, area) {
  const perRow = Math.ceil(Math.sqrt(count));
  const stepX = (area.width - 2 * MARGIN_PX) / perRow;
  const stepY = (area.height - 2 * MARGIN_PX) / perRow;
  const size = Math.max(2, Math.min(stepX, stepY) * 0.5);
  const elements = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    elements.push({
      id: `bench-${String(index).padStart(3, '0')}`,
      type: 'shape',
      shape: 'rectangle',
      fill: index % 2 === 0 ? '#2b6cb0' : '#c05621',
      stroke: '#101010',
      strokeWidthPx: 1,
      locked: false,
      opacity: 1,
      visible: true,
      transform: {
        x: round(area.x + MARGIN_PX + column * stepX),
        y: round(area.y + MARGIN_PX + row * stepY),
        width: round(size),
        height: round(size),
        scaleX: 1,
        scaleY: 1,
        rotationDeg: index % 7 === 0 ? 15 : 0,
      },
    });
  }
  return {
    schemaVersion: 1,
    placement: {
      pxPerMm: 1,
      canvasWidthPx: 400,
      canvasHeightPx: 400,
      physicalWidthMm: 400,
      physicalHeightMm: 400,
      productSideId: SIDE_ONE,
      embroideryAreaId: AREA_ONE,
    },
    elements,
  };
}

function literal(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function seed() {
  sql(`update products set status = 'PUBLISHED' where id = '${PRODUCT_ID}'`);

  const area = areaBounds();
  let index = 0;
  for (const [size, count] of Object.entries(SCENE_ELEMENT_COUNTS)) {
    const template = id(index);
    const version = id(index + 50);
    sql(`
      insert into design_templates (id, name, slug, status, current_version, product_id,
        product_side_id, embroidery_area_id)
      values ('${template}', 'S03 benchmark ${size} (${String(count)})', '${templateSlug(size)}',
        'PUBLISHED', 1, '${PRODUCT_ID}', '${SIDE_ONE}', '${AREA_ONE}')
      on conflict (id) do nothing
    `);
    sqlStdin(`
      insert into design_template_versions (id, design_template_id, version, design_document,
        document_schema_version, published_at)
      values ('${version}', '${template}', 1, ${literal(documentFor(count, area))}, 1, now())
      on conflict (id) do nothing
    `);
    index += 1;
  }
  report();
}

function revert() {
  // Archived, not deleted, and `id::text` because the column is a `uuid`.
  for (const generation of GENERATIONS) {
    sql(
      `update design_templates set status = 'ARCHIVED', archived_at = now()
       where id::text like '${FAMILY}${generation}%' and status <> 'ARCHIVED'`,
    );
  }
  report();
}

function report() {
  for (const size of Object.keys(SCENE_ELEMENT_COUNTS)) {
    const count = sql(
      `select count(*) from design_templates where slug = '${templateSlug(size)}' and status = 'PUBLISHED'`,
    );
    console.log(`${size}: published benchmark templates = ${count}`);
  }
}

// Only when run directly: the benchmark imports the scene sizes from here.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === 'seed') seed();
  else if (action === 'revert') revert();
  else {
    console.error('usage: node tools/bench-app3-s03-fixtures.mjs <seed|revert>');
    process.exit(1);
  }
}
