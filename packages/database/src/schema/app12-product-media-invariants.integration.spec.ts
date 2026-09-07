/**
 * `APP12-M01.DB1` — the Product-media gallery invariants, asserted against a
 * real PostgreSQL rather than against TypeScript.
 *
 * Every rule migration 0039 adds is a rule about what the database *refuses*,
 * so each case here issues the statement directly — bypassing the domain
 * entirely, which is the only way to learn whether the constraint installed at
 * all. A test that went through `ProductMediaSelection` would prove the service
 * is careful, not that the table is defensive.
 *
 * The matrix runs both directions of every two-sided rule. `THUMBNAIL` at a
 * position above 0 and a non-`THUMBNAIL` at position 0 are separate cases,
 * because a CHECK written with one half missing passes a one-sided test while
 * leaving the gallery able to hold two primaries or none.
 *
 * The legitimate shape — position 0 `THUMBNAIL` plus `GALLERY` at 1..19 — is
 * asserted too. A suite that only proves refusals cannot distinguish a correct
 * constraint from one that rejects everything.
 */
import { sql } from 'drizzle-orm';

import { driverErrorCode } from '../errors/driver-error';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';
import { MAX_PRODUCT_MEDIA_ITEMS, PRODUCT_MEDIA_PRIMARY_ROLE } from './catalog/product-media';
import { insertProductMedia, seedProductMediaSubject } from './app12-product-media-fixture';
import type { ProductMediaSubject } from './app12-product-media-fixture';

/** PostgreSQL's `check_violation`. Asserted by code, never by message. */
const CHECK_VIOLATION = '23514';
/** PostgreSQL's `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

const GALLERY = 'GALLERY';
const DETAIL = 'DETAIL';

describe('APP12 product-media invariants (integration)', () => {
  let disposable: DisposableDatabase;
  let subject: ProductMediaSubject;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app12m01db1-media');
    // One more asset than the cap, so the out-of-range case has a real asset to
    // point at rather than borrowing one already in use.
    subject = await seedProductMediaSubject(disposable.client.db, MAX_PRODUCT_MEDIA_ITEMS + 1);
  }, 300_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  /** Clears the product's media so each case starts from a known empty strip. */
  beforeEach(async () => {
    await db().execute(sql`delete from product_media where product_id = ${subject.productId}`);
  });

  /**
   * Runs `work` and returns the SQLSTATE it raised.
   *
   * Through `driverErrorCode`, never `error.code`: drizzle wraps the `pg` error
   * and attaches the original as `cause`, so a direct read finds nothing.
   */
  async function errorCode(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
    } catch (error: unknown) {
      return driverErrorCode(error) ?? 'no-driver-code';
    }
    throw new Error('Expected the statement to fail, but it succeeded.');
  }

  const media = (assetIndex: number, role: string, displayOrder: number) => ({
    productId: subject.productId,
    assetId: subject.assetIds[assetIndex] as string,
    role,
    displayOrder,
  });

  /** The primary, written the way the application writes it. */
  async function seedPrimary(assetIndex = 0): Promise<void> {
    await insertProductMedia(db(), media(assetIndex, PRODUCT_MEDIA_PRIMARY_ROLE, 0));
  }

  async function mediaCount(): Promise<number> {
    const { rows } = await db().execute<{ n: string }>(
      sql`select count(*)::text as n from product_media where product_id = ${subject.productId}`,
    );
    return Number(rows[0]?.n ?? '0');
  }

  describe('what it refuses', () => {
    it('refuses the same Asset twice in one Product, even under two roles', async () => {
      await seedPrimary(0);
      // The old key was (product_id, asset_id, role), so this exact pair used
      // to be legal. It is the one shape 0039 deliberately stopped permitting.
      const code = await errorCode(() => insertProductMedia(db(), media(0, GALLERY, 1)));
      expect(code).toBe(UNIQUE_VIOLATION);
      expect(await mediaCount()).toBe(1);
    });

    it('refuses two rows at the same display position', async () => {
      await seedPrimary(0);
      await insertProductMedia(db(), media(1, GALLERY, 1));
      const code = await errorCode(() => insertProductMedia(db(), media(2, GALLERY, 1)));
      expect(code).toBe(UNIQUE_VIOLATION);
      expect(await mediaCount()).toBe(2);
    });

    it('refuses a negative position', async () => {
      const code = await errorCode(() => insertProductMedia(db(), media(0, GALLERY, -1)));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it(`refuses position ${MAX_PRODUCT_MEDIA_ITEMS}, the first beyond the cap`, async () => {
      const code = await errorCode(() =>
        insertProductMedia(db(), media(0, GALLERY, MAX_PRODUCT_MEDIA_ITEMS)),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('refuses the primary role above position 0', async () => {
      await seedPrimary(0);
      const code = await errorCode(() =>
        insertProductMedia(db(), media(1, PRODUCT_MEDIA_PRIMARY_ROLE, 1)),
      );
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('refuses a non-primary role at position 0', async () => {
      const code = await errorCode(() => insertProductMedia(db(), media(0, GALLERY, 0)));
      expect(code).toBe(CHECK_VIOLATION);
    });

    it('refuses DETAIL at position 0 as well — the rule is the role, not one tuple', async () => {
      // `DETAIL` is in the allowed role set and nothing writes it today. It is
      // asserted here so the CHECK cannot be read as naming GALLERY alone.
      const code = await errorCode(() => insertProductMedia(db(), media(0, DETAIL, 0)));
      expect(code).toBe(CHECK_VIOLATION);
    });
  });

  describe('what it allows', () => {
    it('accepts a full legitimate gallery: primary at 0, non-primary at 1..N-1', async () => {
      await seedPrimary(0);
      for (let position = 1; position < MAX_PRODUCT_MEDIA_ITEMS; position += 1) {
        await insertProductMedia(db(), media(position, GALLERY, position));
      }

      expect(await mediaCount()).toBe(MAX_PRODUCT_MEDIA_ITEMS);

      const { rows } = await db().execute<{ display_order: number; role: string }>(sql`
        select display_order, role from product_media
        where product_id = ${subject.productId} order by display_order
      `);
      expect(rows).toHaveLength(MAX_PRODUCT_MEDIA_ITEMS);
      expect(rows[0]?.role).toBe(PRODUCT_MEDIA_PRIMARY_ROLE);
      expect(rows.map((row) => Number(row.display_order))).toEqual(
        Array.from({ length: MAX_PRODUCT_MEDIA_ITEMS }, (_, index) => index),
      );
      expect(rows.filter((row) => row.role === PRODUCT_MEDIA_PRIMARY_ROLE)).toHaveLength(1);
    });

    it('accepts DETAIL above position 0 — only the primary role is positional', async () => {
      await seedPrimary(0);
      await insertProductMedia(db(), media(1, DETAIL, 1));
      expect(await mediaCount()).toBe(2);
    });

    it('accepts the same Asset in two different Products', async () => {
      // The uniqueness is per Product. A shared catalog image is legitimate and
      // must not be collateral damage of the tightened key.
      const other = await seedProductMediaSubject(db(), 0);
      await seedPrimary(0);
      await insertProductMedia(db(), {
        productId: other.productId,
        assetId: subject.assetIds[0] as string,
        role: PRODUCT_MEDIA_PRIMARY_ROLE,
        displayOrder: 0,
      });

      const { rows } = await db().execute<{ n: string }>(
        sql`select count(*)::text as n from product_media where asset_id = ${subject.assetIds[0] as string}`,
      );
      expect(Number(rows[0]?.n)).toBe(2);
      await db().execute(sql`delete from product_media where product_id = ${other.productId}`);
    });

    it('leaves an empty gallery legal — a Product may carry no media at all', async () => {
      expect(await mediaCount()).toBe(0);
    });
  });

  describe('the constraints are the ones 0039 names', () => {
    it('installs exactly the four invariant constraints on product_media', async () => {
      const { rows } = await db().execute<{ conname: string }>(sql`
        select c.conname from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'product_media'
          and c.conname in (
            'uq_product_media__product_asset',
            'uq_product_media__product_display_order',
            'ck_product_media__display_order_bounded',
            'ck_product_media__primary_role_at_zero'
          )
        order by c.conname
      `);
      expect(rows.map((row) => row.conname)).toEqual([
        'ck_product_media__display_order_bounded',
        'ck_product_media__primary_role_at_zero',
        'uq_product_media__product_asset',
        'uq_product_media__product_display_order',
      ]);
    });

    it('no longer carries the role-keyed uniqueness 0039 replaced', async () => {
      const { rows } = await db().execute<{ n: string }>(sql`
        select count(*)::text as n from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'product_media'
          and c.conname = 'uq_product_media__product_asset_role'
      `);
      expect(Number(rows[0]?.n)).toBe(0);
    });

    it(`bounds display_order by ${MAX_PRODUCT_MEDIA_ITEMS} in the installed DDL`, async () => {
      // The literal in the database, not in the TypeScript that generated it —
      // exactly the parity a bound-parameter bug would break.
      const { rows } = await db().execute<{ def: string }>(sql`
        select pg_get_constraintdef(c.oid) as def from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'product_media'
          and c.conname = 'ck_product_media__display_order_bounded'
      `);
      expect(rows[0]?.def).toContain(`< ${MAX_PRODUCT_MEDIA_ITEMS}`);
      expect(rows[0]?.def).not.toContain('$1');
    });
  });
});
