#!/usr/bin/env node
/**
 * `APP3-S07` — the three deterministic Studio scenes the viewport benchmark
 * measures.
 *
 * `ADR-APP0-001` froze S/M/L at 10, 50 and 150 elements, and the whole point of
 * re-measuring at this checkpoint is that the numbers are comparable with the
 * ones the ADR recorded. So the sizes are those, exactly, and the scenes are
 * seeded as real published Design Templates that a real browser clones into a
 * real Session — a benchmark that mounted a component in isolation would be
 * measuring something the customer never runs.
 *
 * Everything is written to the **development** database, carries a run-scoped id
 * prefix, and is removed by `revert`. It publishes nothing through a lifecycle
 * command, evaluates no readiness, honours no concurrency token and writes no
 * Audit or Outbox row: this is fixture setup, not a command.
 *
 * The placement it hangs off is the one `APP3-S01`'s own fixtures already
 * establish, imported rather than copied so the two cannot drift onto different
 * Sides.
 *
 * Usage:
 *   node tools/bench-app3-s07-fixtures.mjs seed
 *   node tools/bench-app3-s07-fixtures.mjs revert
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AREA_ONE, PRODUCT_ID, SIDE_ONE, sql } from './smoke-app3-s01-fixtures.mjs';

/**
 * A statement piped through stdin rather than passed as an argument.
 *
 * The L scene is 150 elements of canonical JSON, and Windows refuses the
 * resulting command line outright (`ENAMETOOLONG`) — so the largest fixture, the
 * one the benchmark most needs, is exactly the one that cannot be sent the way
 * every other fixture in this repository is sent. `sql` from the `APP3-S01`
 * fixtures stays the tool for short statements; this one exists for the
 * documents.
 */
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

/**
 * The scene sizes a **production** Session can actually hold.
 *
 * `APP0-R01` froze S/M/L at 10, 50 and 150, and this benchmark set out to reuse
 * those exactly. It cannot: `APP3-P01` caps a Design Document at
 * `DESIGN_DOCUMENT_LIMITS.maxElements = 100`, so a 150-element document is
 * refused by the server and no customer can ever have one. The spike's own
 * harness still measures 150 — it validates nothing — but the largest scene the
 * shipped Studio will ever render is 100, and that is the number the viewport
 * has to be fast at. So `L` is the real ceiling, and this divergence from the
 * ADR is deliberate and disclosed rather than silently rescaled.
 *
 * 10 and 50 are unchanged, and are the same sizes `APP3-S02`'s structural scale
 * proof already uses.
 */
export const SCENE_ELEMENT_COUNTS = Object.freeze({ S: 10, M: 50, L: 100 });

const FAMILY = '019fe80';

/**
 * Bumped whenever a re-seed needs **new** rows.
 *
 * A published Design Template version is frozen: the database refuses to delete
 * one (`fn_reject_mutation_conditional`), and that rule is not this tool's to
 * work around. So `revert` archives instead, and a fixture whose document has
 * changed needs a new id rather than an overwrite — otherwise `on conflict do
 * nothing` silently keeps the previous run's scenes and the benchmark measures
 * geometry nobody wrote.
 */
const GENERATION = '1';
const GENERATIONS = ['0', '1'];
const PREFIX = `${FAMILY}${GENERATION}`;

function id(index) {
  return `${PREFIX}-0000-7000-8000-${String(index).padStart(12, '0')}`;
}

/** Room left inside the area for the stroke envelope and the rotated cells. */
const MARGIN_PX = 4;

/** Two decimals: APP3-P01 quantizes anyway, and a short literal keeps the SQL small. */
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
    throw new Error('APP3-S07 fixtures: the embroidery area could not be read.');
  }
  return { x, y, width, height };
}

export function templateSlug(size) {
  return `s07-bench-g${GENERATION}-${size.toLowerCase()}`;
}

/**
 * A scene of `count` shape elements laid out on a deterministic grid.
 *
 * Shapes rather than text or images: a text element would pull the controlled
 * font registry into the measurement and an image element would render the
 * `APP3-S02` placeholder, and neither is what a viewport benchmark is about.
 * Every element carries a stroke, so the scene exercises the same
 * stroke-envelope path the bounds are measured with.
 */
function documentFor(count, area) {
  const perRow = Math.ceil(Math.sqrt(count));
  // Inside the embroidery area, with room for the stroke envelope and for the
  // rotated cells. A Session refuses a document that leaves the area, so the
  // grid is derived from the persisted rectangle rather than from the canvas —
  // a benchmark scene that cannot be opened measures nothing.
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
      values ('${template}', 'S07 benchmark ${size} (${String(count)})', '${templateSlug(size)}',
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
  // Archived, not deleted, and `id::text` because the column is a `uuid` and
  // PostgreSQL has no `like` for one. Both are corrections to a revert that
  // silently did nothing: the cast was missing, so the statement threw, and the
  // seed's `on conflict do nothing` then kept the stale rows.
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

// Only when run directly: the benchmark imports the scene sizes from here, and
// an import must never seed a database.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === 'seed') seed();
  else if (action === 'revert') revert();
  else {
    console.error('usage: node tools/bench-app3-s07-fixtures.mjs <seed|revert>');
    process.exit(1);
  }
}
