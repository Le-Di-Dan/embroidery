/**
 * `APP3-DB01` — the placement half: stable identity, retirement, replacement and
 * referenced-row protection (IMP-D041).
 *
 * Split from `check-app3-db01.mjs` because one file covering both contribution
 * groups would exceed the repository's source limit, and because the two halves
 * fail for different reasons: this one when a guard is softened, the other when
 * the derivative contract or the migration structure moves.
 *
 * Everything here is asserted against the **committed migration SQL and the
 * Drizzle schema**, never against a description of them. Behaviour against a
 * live PostgreSQL is the integration suite's job
 * (`app3-placement-authority.integration.spec.ts`); this gate exists so a later
 * edit that deletes a trigger cannot pass review by leaving the prose intact.
 */

/** Columns each placement table must declare, per table key. */
export const REQUIRED_PLACEMENT_COLUMNS = Object.freeze({
  productSides: ['code', 'retired_at', 'superseded_by_id'],
  embroideryAreas: ['code', 'retired_at', 'superseded_by_id'],
});

/** The ruled format, byte-for-byte. */
export const CODE_PATTERN = '^[a-z0-9][a-z0-9_-]{0,63}$';

/** Constraint names the migration must create, per table. */
const REQUIRED_CONSTRAINTS = Object.freeze({
  product_sides: [
    'uq_product_sides__product_code',
    'ck_product_sides__code_format',
    'ck_product_sides__superseded_requires_retired',
    'ck_product_sides__superseded_not_self',
    'fk_product_sides__superseded_by_id',
  ],
  embroidery_areas: [
    'uq_embroidery_areas__side_code',
    'ck_embroidery_areas__code_format',
    'ck_embroidery_areas__superseded_requires_retired',
    'ck_embroidery_areas__superseded_not_self',
    'fk_embroidery_areas__superseded_by_id',
  ],
});

/** Triggers the migration must install. */
const REQUIRED_TRIGGERS = Object.freeze([
  'tg_product_sides__replacement_guard',
  'tg_embroidery_areas__replacement_guard',
  'tg_product_sides__protected_guard',
  'tg_embroidery_areas__protected_guard',
]);

/** Columns that freeze once a row is protected. */
export const PROTECTED_COLUMNS = Object.freeze({
  product_side: [
    'product_id',
    'code',
    'background_asset_id',
    'image_width_px',
    'image_height_px',
    'physical_width_mm',
    'physical_height_mm',
    'px_per_mm',
  ],
  embroidery_area: [
    'product_side_id',
    'code',
    'bound_x_px',
    'bound_y_px',
    'bound_width_px',
    'bound_height_px',
    'max_width_mm',
    'max_height_mm',
  ],
});

/** Columns that must stay editable on a protected row. */
const EDITABLE_ON_PROTECTED = Object.freeze([
  'name',
  'display_order',
  'retired_at',
  'superseded_by_id',
]);

/**
 * Verifies the placement contribution group.
 *
 * @param {{migration: string, schemas: Record<string, string>, files: Record<string, string>, fail: (m: string) => void}} input
 */
export function checkPlacementAuthority({ migration, schemas, files, fail }) {
  checkColumns(schemas, files, fail);
  checkBackfillOrder(migration, files, fail);
  checkConstraints(migration, files, fail);
  checkTriggers(migration, files, fail);
  checkProtection(migration, files, fail);
}

/** The Drizzle schema declares every ruled column, and the ruled format once. */
function checkColumns(schemas, files, fail) {
  for (const [key, columns] of Object.entries(REQUIRED_PLACEMENT_COLUMNS)) {
    const source = schemas[key];
    if (source === undefined) {
      fail(`${files[key]}: placement schema file is missing`);
      continue;
    }
    for (const column of columns) {
      if (!source.includes(`'${column}'`)) {
        fail(`${files[key]}: required column \`${column}\` is not declared`);
      }
    }
    // Matched on the declaration, not a literal: `code` is `text('code')` and
    // `retired_at` comes from the shared `instant()` primitive.
    if (!/code:\s*text\('code'\)\.notNull\(\)/.test(source)) {
      fail(`${files[key]}: \`code\` is not declared NOT NULL`);
    }
    if (!/retiredAt:\s*instant\('retired_at'\)/.test(source)) {
      fail(`${files[key]}: \`retired_at\` is not the nullable instant the ruling requires`);
    }
    if (/retiredAt:\s*instant\('retired_at'\)\.notNull\(\)/.test(source)) {
      fail(`${files[key]}: \`retired_at\` became NOT NULL; a live placement has none`);
    }
  }
  if (!schemas.productSides?.includes(`'${CODE_PATTERN}'`)) {
    fail(`${files.productSides}: the ruled code pattern is not declared`);
  }
}

/**
 * The backfill happens between "add nullable" and "SET NOT NULL", and is proved.
 *
 * Order is the whole safety argument: adding `code NOT NULL` to a populated
 * table fails, and setting NOT NULL before proving the backfill turns a data
 * problem into an unattributable constraint error.
 */
function checkBackfillOrder(migration, files, fail) {
  for (const table of ['product_sides', 'embroidery_areas']) {
    const addNullable = migration.indexOf(`ALTER TABLE "${table}" ADD COLUMN "code" text;`);
    const backfill = migration.indexOf(`UPDATE "${table}"`);
    const setNotNull = migration.indexOf(
      `ALTER TABLE "${table}" ALTER COLUMN "code" SET NOT NULL;`,
    );
    if (addNullable < 0) {
      fail(`${files.migration}: ${table}.code is not added as a nullable column first`);
      continue;
    }
    if (backfill < 0 || backfill < addNullable) {
      fail(`${files.migration}: ${table}.code has no backfill after the nullable add`);
      continue;
    }
    if (setNotNull < 0 || setNotNull < backfill) {
      fail(`${files.migration}: ${table}.code is set NOT NULL before it is backfilled`);
    }
  }
  if (!/'legacy-'\s*\|\|\s*replace\("id"::text, '-', ''\)/.test(migration)) {
    fail(`${files.migration}: the deterministic legacy-code backfill expression is gone`);
  }
  if (!/RAISE EXCEPTION[\s\S]{0,200}backfill/i.test(migration)) {
    fail(`${files.migration}: the backfill is not proved before \`SET NOT NULL\``);
  }
  for (const proof of ['IS NULL', 'HAVING count(*) > 1', `!~ '${CODE_PATTERN}'`]) {
    if (!migration.includes(proof)) {
      fail(`${files.migration}: the backfill proof no longer checks \`${proof}\``);
    }
  }
}

function checkConstraints(migration, files, fail) {
  for (const [table, names] of Object.entries(REQUIRED_CONSTRAINTS)) {
    for (const name of names) {
      if (!migration.includes(name)) {
        fail(`${files.migration}: ${table} constraint \`${name}\` is missing`);
      }
    }
  }
  // Per-parent, never global: a global unique would forbid two Products both
  // having a `front`.
  if (!/UNIQUE\("product_id","code"\)/.test(migration)) {
    fail(`${files.migration}: product_sides code uniqueness is not scoped to the Product`);
  }
  if (!/UNIQUE\("product_side_id","code"\)/.test(migration)) {
    fail(`${files.migration}: embroidery_areas code uniqueness is not scoped to the Side`);
  }
  if (/UNIQUE\("code"\)/.test(migration)) {
    fail(`${files.migration}: a global code uniqueness constraint exists; identity is per parent`);
  }
}

function checkTriggers(migration, files, fail) {
  for (const trigger of REQUIRED_TRIGGERS) {
    if (!migration.includes(trigger)) {
      fail(`${files.migration}: trigger \`${trigger}\` is missing`);
    }
  }
  if (!/CREATE OR REPLACE FUNCTION public\.fn_app3_placement_replacement_guard/.test(migration)) {
    fail(`${files.migration}: the replacement guard function is missing`);
  }
  if (!/supersede each other/.test(migration)) {
    fail(`${files.migration}: the direct two-row replacement cycle is no longer rejected`);
  }
  if (!/only be superseded within the same/.test(migration)) {
    fail(`${files.migration}: cross-parent replacement is no longer rejected`);
  }
  // A generic graph walk would reject a legitimate a → b → c history.
  if (/WITH RECURSIVE/i.test(migration)) {
    fail(`${files.migration}: a recursive replacement walk exists; only the direct cycle is ruled`);
  }
}

function checkProtection(migration, files, fail) {
  if (
    !/CREATE OR REPLACE FUNCTION public\.fn_app3_reject_protected_placement_change/.test(migration)
  ) {
    fail(`${files.migration}: the referenced-row protection function is missing`);
  }
  for (const [source, pattern] of [
    ['the Template header', /design_templates t WHERE t\.(product_side_id|embroidery_area_id)/],
    ['the non-terminal Session', /design_sessions s[\s\S]{0,160}NOT IN \('EXPIRED', 'DELETED'\)/],
    ['the approval snapshot', /approval_snapshots a WHERE a\.(product_side_id|embroidery_area_id)/],
  ]) {
    if (!pattern.test(migration)) {
      fail(`${files.migration}: ${source} protection source is missing`);
    }
  }
  for (const [entity, columns] of Object.entries(PROTECTED_COLUMNS)) {
    const args = new RegExp(`'${entity}',[\\s\\S]{0,400}?\\);`).exec(migration);
    if (args === null) {
      fail(`${files.migration}: no protected-column list is passed for \`${entity}\``);
      continue;
    }
    for (const column of columns) {
      if (!args[0].includes(`'${column}'`)) {
        fail(`${files.migration}: \`${entity}\` no longer freezes \`${column}\` once protected`);
      }
    }
    for (const editable of EDITABLE_ON_PROTECTED) {
      if (args[0].includes(`'${editable}'`)) {
        fail(
          `${files.migration}: \`${entity}\` freezes \`${editable}\`, which must stay editable on a protected row`,
        );
      }
    }
  }
  if (!/cannot be deleted; retire it instead/.test(migration)) {
    fail(`${files.migration}: a protected row is no longer protected from hard delete`);
  }
  if (/ON DELETE cascade/i.test(migration)) {
    fail(
      `${files.migration}: a cascade delete was introduced; placement history is never cascaded`,
    );
  }
}
