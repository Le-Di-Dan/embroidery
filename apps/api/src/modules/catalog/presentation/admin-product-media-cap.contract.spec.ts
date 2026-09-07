/**
 * `APP12-M01.DB1` — the 20-image cap, asserted to be one number in four places.
 *
 * The cap is enforced by the domain, published by the request contract,
 * rendered into the generated client and installed as a `display_order` bound
 * by migration 0039. Every one of those is derived from
 * `MAX_PRODUCT_MEDIA_ITEMS`, but "derived" is a claim about the code as it
 * stands today: a later edit that hard-codes `20` in any one of them would
 * still pass every functional test in the repository while quietly creating the
 * second authority §9 forbids, and the failure would only surface as a client
 * that permits twenty-five images the database then refuses.
 *
 * So this file reads the *published artifacts* — the committed OpenAPI
 * document, the generated client and the committed migration SQL — and asserts
 * each states the value the constant states. It deliberately does not re-derive
 * the number; it compares against the single import.
 *
 * The installed DDL is checked separately, against a real PostgreSQL, in
 * `packages/database` — this file can only see files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_PRODUCT_MEDIA_ITEMS } from '../domain/product-draft.policy';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

interface OpenApiDocument {
  readonly components: {
    readonly schemas: Record<string, { properties?: Record<string, Record<string, unknown>> }>;
  };
}

const OPENAPI = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json'), 'utf8'),
) as OpenApiDocument;

const CLIENT_SCHEMAS = readFileSync(
  join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.schemas.ts'),
  'utf8',
);

const MIGRATION_SQL = readFileSync(
  join(REPO_ROOT, 'packages/database/migrations/0039_add_app12_product_media_invariants.sql'),
  'utf8',
);

describe('APP12-M01.DB1 product media cap parity', () => {
  it('publishes the cap as maxItems on the existing update body', () => {
    const media = OPENAPI.components.schemas['UpdateProductBody']?.properties?.['mediaAssetIds'];
    expect(media).toBeDefined();
    expect(media?.['type']).toBe('array');
    expect(media?.['maxItems']).toBe(MAX_PRODUCT_MEDIA_ITEMS);
  });

  it('keeps the write shape an ordered array of Asset ids, not a new object', () => {
    // The cap is the only change to this field. A reorder or set-primary
    // contract would be a different shape, and DB1 does not own one.
    const media = OPENAPI.components.schemas['UpdateProductBody']?.properties?.['mediaAssetIds'];
    expect(media?.['items']).toMatchObject({ type: 'string' });
    expect(CLIENT_SCHEMAS).toContain('mediaAssetIds?: string[];');
  });

  it('carries the cap into the generated client', () => {
    expect(CLIENT_SCHEMAS).toContain(`@maxItems ${MAX_PRODUCT_MEDIA_ITEMS}`);
  });

  it('bounds display_order by the same number in migration 0039', () => {
    expect(MIGRATION_SQL).toContain(`"product_media"."display_order" < ${MAX_PRODUCT_MEDIA_ITEMS}`);
    expect(MIGRATION_SQL).toContain('"product_media"."display_order" >= 0');
  });

  it('rendered a literal bound into the migration, never a placeholder', () => {
    // drizzle-kit writes `$1` when a value reaches the DDL as a bound
    // parameter, which installs a constraint that does not mean what the
    // schema says. The schema uses `sql.raw` to prevent it; this proves it.
    expect(MIGRATION_SQL).not.toContain('$1');
  });

  it('installs no new table, column, index or trigger', () => {
    // DB1's whole DDL surface is four constraints on an existing table. Anything
    // else in this migration is out of the package's scope.
    expect(MIGRATION_SQL).not.toMatch(/CREATE TABLE/i);
    expect(MIGRATION_SQL).not.toMatch(/ADD COLUMN/i);
    expect(MIGRATION_SQL).not.toMatch(/CREATE (UNIQUE )?INDEX/i);
    expect(MIGRATION_SQL).not.toMatch(/CREATE TRIGGER/i);
    expect(MIGRATION_SQL).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
  });

  it('adds exactly the four invariant constraints and retires one', () => {
    const added = MIGRATION_SQL.match(/ADD CONSTRAINT "([^"]+)"/g) ?? [];
    expect(added).toEqual([
      'ADD CONSTRAINT "uq_product_media__product_asset"',
      'ADD CONSTRAINT "uq_product_media__product_display_order"',
      'ADD CONSTRAINT "ck_product_media__display_order_bounded"',
      'ADD CONSTRAINT "ck_product_media__primary_role_at_zero"',
    ]);

    const dropped = MIGRATION_SQL.match(/DROP CONSTRAINT "([^"]+)"/g) ?? [];
    expect(dropped).toEqual(['DROP CONSTRAINT "uq_product_media__product_asset_role"']);
  });

  it('refuses rather than repairs when the corpus already violates an invariant', () => {
    // The precheck must RAISE, not UPDATE. A migration that silently repaired a
    // violating row would rewrite catalog evidence unreviewed.
    expect(MIGRATION_SQL).toContain('RAISE EXCEPTION');
    expect(MIGRATION_SQL).not.toMatch(/^\s*UPDATE\s+"?product_media/im);
    expect(MIGRATION_SQL).not.toMatch(/^\s*DELETE\s+FROM\s+"?product_media/im);
  });
});
