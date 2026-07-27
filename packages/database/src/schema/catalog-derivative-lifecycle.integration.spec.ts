/**
 * APP2-DB01 — the catalog-media processing lane, proven representable before
 * any of APP2-W01's runtime exists.
 *
 * Two lifecycle contradictions were reported by the W01 schema gate and are
 * resolved here as *authority*, not as handler code:
 *
 *   1. the derivative lifecycle keeps `PENDING` as its entry state, so the
 *      catalog lane inserts PENDING and performs a guarded PENDING → PROCESSING
 *      transition rather than inserting PROCESSING directly;
 *   2. catalog derivatives are generated while the asset is still INSPECTING,
 *      and the whole terminal tuple is written in one transaction.
 *
 * What the database enforces and what it does not is stated exactly: the state
 * CHECK is a value guard, not a transition guard, so the ordering rule is
 * carried by the guarded UPDATE predicate the application must use. That is the
 * canonical guard for this lane, and it is tested as such.
 */
import { sql } from 'drizzle-orm';

import { withTransaction } from '../client/transaction';
import { driverErrorCode } from '../errors/driver-error';
import { newId } from '../primitives/identifiers';
import type { DisposableDatabase } from '../testing/index';
import { createDisposableDatabase } from '../testing/index';

const CHECKSUM = `sha256:${'b'.repeat(64)}`;
const CATALOG_KINDS = ['THUMBNAIL', 'CATALOG_PREVIEW'] as const;
const CHECK_VIOLATION = '23514';

/**
 * Asserts that `work` fails with a SQLSTATE.
 *
 * Drizzle wraps the `pg` error, so `rejects.toMatchObject({ code })` would
 * match nothing and pass for the wrong reason; the code is unwrapped through
 * the canonical helper instead.
 */
async function expectSqlState(work: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    expect(driverErrorCode(error)).toBe(expected);
    return;
  }
  throw new Error(`Expected SQLSTATE ${expected}, but the statement succeeded.`);
}

describe('catalog derivative lifecycle (integration)', () => {
  let disposable: DisposableDatabase;

  beforeAll(async () => {
    disposable = await createDisposableDatabase('app2db01-catalog-lifecycle');
  }, 180_000);

  afterAll(async () => {
    await disposable?.drop();
  });

  const db = (): DisposableDatabase['client']['db'] => disposable.client.db;

  async function insertInspectingAsset(): Promise<string> {
    const id = newId();
    await db().execute(sql`
      insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, checksum, status)
      values (${id}, 'CATALOG_MEDIA', 'PRODUCTION_SENSITIVE', ${`test/originals/${id}/original.png`},
              'image/png', 2048, ${CHECKSUM}, 'INSPECTING')
    `);
    return id;
  }

  /** The Tx P insert: both catalog rows enter at PENDING, never at PROCESSING. */
  async function prepareCatalogDerivatives(assetId: string): Promise<void> {
    for (const kind of CATALOG_KINDS) {
      await db().execute(sql`
        insert into asset_derivatives (id, asset_id, kind, status, is_watermarked)
        values (${newId()}, ${assetId}, ${kind}, 'PENDING', false)
      `);
    }
  }

  /**
   * The guarded transition. The predicate — not a bare `set status` — is the
   * guard: it names the state the row must currently be in, so a row someone
   * else already moved is not silently overwritten.
   */
  async function claimForProcessing(assetId: string, kind: string): Promise<number> {
    const result = await db().execute(sql`
      update asset_derivatives set status = 'PROCESSING', updated_at = now()
       where asset_id = ${assetId} and kind = ${kind} and status = 'PENDING'
    `);
    return result.rowCount ?? 0;
  }

  async function statesOf(assetId: string): Promise<Record<string, string>> {
    const { rows } = await db().execute(sql`
      select kind, status from asset_derivatives where asset_id = ${assetId} order by kind
    `);
    return Object.fromEntries(
      rows.map((row) => {
        const typed = row as { kind: string; status: string };
        return [typed.kind, typed.status];
      }),
    );
  }

  describe('preparation', () => {
    it('holds both catalog kinds for one asset', async () => {
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);
      expect(await statesOf(assetId)).toEqual({ CATALOG_PREVIEW: 'PENDING', THUMBNAIL: 'PENDING' });
    });

    it('transitions PENDING → PROCESSING through the guard', async () => {
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);

      expect(await claimForProcessing(assetId, 'THUMBNAIL')).toBe(1);
      expect(await claimForProcessing(assetId, 'CATALOG_PREVIEW')).toBe(1);
      expect(await statesOf(assetId)).toEqual({
        CATALOG_PREVIEW: 'PROCESSING',
        THUMBNAIL: 'PROCESSING',
      });
    });

    it('makes a second claim of the same row a no-op instead of a second start', async () => {
      // At-least-once delivery means two attempts can race here. The guard has
      // to distinguish "I claimed it" from "someone already did" by row count,
      // which is what the runtime will branch on.
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);

      expect(await claimForProcessing(assetId, 'THUMBNAIL')).toBe(1);
      expect(await claimForProcessing(assetId, 'THUMBNAIL')).toBe(0);
      expect((await statesOf(assetId))['THUMBNAIL']).toBe('PROCESSING');
    });

    it('refuses a state outside the canonical set', async () => {
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);
      await expectSqlState(
        () =>
          db().execute(sql`
            update asset_derivatives set status = 'GENERATING' where asset_id = ${assetId}
          `),
        CHECK_VIOLATION,
      );
    });
  });

  describe('accepted terminal tuple', () => {
    it('writes both READY derivatives, one inspection and ACCEPTED atomically', async () => {
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);
      for (const kind of CATALOG_KINDS) {
        await claimForProcessing(assetId, kind);
      }

      await withTransaction(db(), async (tx) => {
        for (const kind of CATALOG_KINDS) {
          await tx.execute(sql`
            update asset_derivatives
               set status = 'READY',
                   storage_key = ${`test/derivatives/${assetId}/${kind}.webp`},
                   checksum = ${CHECKSUM},
                   updated_at = now()
             where asset_id = ${assetId} and kind = ${kind} and status = 'PROCESSING'
          `);
        }
        await tx.execute(sql`
          insert into asset_inspections (asset_id, outcome, detail, inspected_at)
          values (${assetId}, 'ACCEPTED', '{"schemaVersion":1,"policyVersion":1}', now())
        `);
        await tx.execute(sql`
          update assets set status = 'ACCEPTED', updated_at = now()
           where id = ${assetId} and status = 'INSPECTING'
        `);
      });

      const { rows: assetRows } = await db().execute(
        sql`select status from assets where id = ${assetId}`,
      );
      const { rows: inspections } = await db().execute(
        sql`select outcome from asset_inspections where asset_id = ${assetId}`,
      );
      expect((assetRows[0] as { status: string }).status).toBe('ACCEPTED');
      expect(inspections).toHaveLength(1);
      expect(await statesOf(assetId)).toEqual({ CATALOG_PREVIEW: 'READY', THUMBNAIL: 'READY' });
    });

    it('rolls the whole tuple back when the last statement fails', async () => {
      // The point of the single transaction: an asset must never reach ACCEPTED
      // with a half-written derivative set, and a READY derivative must never
      // survive an inspection that was not recorded.
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);
      for (const kind of CATALOG_KINDS) {
        await claimForProcessing(assetId, kind);
      }

      await expectSqlState(
        () =>
          withTransaction(db(), async (tx) => {
            await tx.execute(sql`
              update asset_derivatives
                 set status = 'READY', storage_key = ${`test/derivatives/${assetId}/THUMBNAIL.webp`}
               where asset_id = ${assetId} and kind = 'THUMBNAIL'
            `);
            await tx.execute(sql`
              insert into asset_inspections (asset_id, outcome, detail, inspected_at)
              values (${assetId}, 'ACCEPTED', '{"schemaVersion":1}', now())
            `);
            // An outcome outside the closed set: the failure a rollback must undo.
            await tx.execute(sql`
              insert into asset_inspections (asset_id, outcome, detail, inspected_at)
              values (${assetId}, 'PARTIAL', '{}', now())
            `);
          }),
        CHECK_VIOLATION,
      );

      const { rows: inspections } = await db().execute(
        sql`select outcome from asset_inspections where asset_id = ${assetId}`,
      );
      expect(inspections).toHaveLength(0);
      expect(await statesOf(assetId)).toEqual({
        CATALOG_PREVIEW: 'PROCESSING',
        THUMBNAIL: 'PROCESSING',
      });
    });
  });

  describe('rejected terminal tuple', () => {
    it('writes both FAILED derivatives, one inspection and REJECTED atomically', async () => {
      const assetId = await insertInspectingAsset();
      await prepareCatalogDerivatives(assetId);
      for (const kind of CATALOG_KINDS) {
        await claimForProcessing(assetId, kind);
      }

      await withTransaction(db(), async (tx) => {
        await tx.execute(sql`
          update asset_derivatives set status = 'FAILED', updated_at = now()
           where asset_id = ${assetId} and status = 'PROCESSING'
        `);
        await tx.execute(sql`
          insert into asset_inspections (asset_id, outcome, detail, inspected_at)
          values (${assetId}, 'REJECTED', '{"schemaVersion":1,"rejectionCode":"DECODE_FAILED"}', now())
        `);
        await tx.execute(sql`
          update assets set status = 'REJECTED', updated_at = now()
           where id = ${assetId} and status = 'INSPECTING'
        `);
      });

      const { rows: assetRows } = await db().execute(
        sql`select status from assets where id = ${assetId}`,
      );
      expect((assetRows[0] as { status: string }).status).toBe('REJECTED');
      expect(await statesOf(assetId)).toEqual({ CATALOG_PREVIEW: 'FAILED', THUMBNAIL: 'FAILED' });
    });

    it('keeps the original asset row after rejection', async () => {
      // Quarantine, not deletion: the binary and its metadata are retained.
      const assetId = await insertInspectingAsset();
      await db().execute(sql`update assets set status = 'REJECTED' where id = ${assetId}`);
      const { rows } = await db().execute(
        sql`select storage_key, checksum, size_bytes from assets where id = ${assetId}`,
      );
      expect(rows).toHaveLength(1);
      expect((rows[0] as { checksum: string }).checksum).toBe(CHECKSUM);
    });
  });
});
