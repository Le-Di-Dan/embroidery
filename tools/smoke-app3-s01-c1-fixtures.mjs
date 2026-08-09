#!/usr/bin/env node
/**
 * `APP3-S01-C1` §15 — the one placement shape the correction is about.
 *
 * Layers a **canonical first Side with no Embroidery Area** onto the `APP3-S01`
 * fixtures, which is the manifest the delivered refinement silently skipped and
 * that no ordinary development Product happens to have. Every other Side keeps
 * its Areas and its published Templates, so the same run also proves the normal
 * path still works once the customer moves.
 *
 * The shape matters because it is the one where `studioEligible` is `true`
 * through a *later* Side: the API derives eligibility from **one** completely
 * usable side, so a leading Area-less Side leaves the Product genuinely
 * eligible while the first row of the ordered list cannot be worked on.
 *
 * Seed order is `smoke-app3-s01-fixtures.mjs seed` first, then this. Revert is
 * the mirror: this first, then that.
 *
 * Usage:
 *   node tools/smoke-app3-s01-c1-fixtures.mjs seed
 *   node tools/smoke-app3-s01-c1-fixtures.mjs revert
 */
import { execFileSync } from 'node:child_process';

/**
 * Its own `psql` runner rather than an import from the S01 fixture tool: that
 * module dispatches on `process.argv[2]` at load, so importing it from a script
 * invoked with `seed` would silently run the S01 seed as a side effect of the
 * import statement.
 */
function sql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      'embroidery-dev-postgres-1',
      'psql',
      '-U',
      'embroidery',
      '-d',
      'embroidery',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAF|',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

const PRODUCT_ID = '019fb93e-2b75-71d7-8485-32e76283f99f';
const PRODUCT_SLUG = 'a03-live-check-redirect';
const BACKGROUND_ASSET = '019fe413-4e6d-7ba6-9269-713bbf026404';

/**
 * A distinct family prefix, so `revert` sweeps this Side without touching the
 * S01 fixture rows that share the same Product.
 */
const FAMILY = '019fe71';
const EMPTY_SIDE = `${FAMILY}0-0000-7000-8000-000000000001`;

/**
 * `display_order = -1`, so this Side is first under the canonical comparator no
 * matter what the S01 fixtures chose. The Side is otherwise completely ordinary
 * — real background asset, real pixel geometry — because the correction is about
 * a Side that is *active and legitimate* and merely has no Area yet, not about a
 * malformed one.
 */
function seed() {
  sql(`
    insert into product_sides (id, product_id, name, code, background_asset_id, image_width_px,
      image_height_px, physical_width_mm, physical_height_mm, px_per_mm, display_order)
    values ('${EMPTY_SIDE}', '${PRODUCT_ID}', 'Mặt trước', 'mat-truoc-c1', '${BACKGROUND_ASSET}',
      400, 400, 400, 400, 1, -1)
    on conflict (id) do update set retired_at = null;
  `);
  report();
}

function revert() {
  // Retired, not deleted: a placement row a Design Session references is
  // protected by the database, and retired is what the manifest already treats
  // as absent.
  sql(`
    update product_sides set retired_at = now()
    where id::text like '${FAMILY}%' and retired_at is null;
  `);
  console.log('APP3-S01-C1 fixture reverted; the Area-less Side is retired.');
}

function report() {
  const ordered = sql(`
    select s.code, s.display_order, count(a.id) filter (where a.retired_at is null)
    from product_sides s
    left join embroidery_areas a on a.product_side_id = s.id
    where s.product_id = '${PRODUCT_ID}' and s.retired_at is null
    group by s.id, s.code, s.display_order
    order by s.display_order, s.code, s.id
  `);
  console.log(
    ['sides in canonical order (code|display_order|active areas):', ordered].join('\n') +
      `\nstudio route = /san-pham/${PRODUCT_SLUG}/thiet-ke`,
  );
}

const command = process.argv[2];
if (command === 'seed') seed();
else if (command === 'revert') revert();
else if (command === 'report') report();
else {
  console.error('usage: smoke-app3-s01-c1-fixtures.mjs <seed|revert|report>');
  process.exitCode = 1;
}
