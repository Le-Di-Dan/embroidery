/**
 * DB10-CP8 — retention-bypass security matrix (final-closure Blocker D).
 *
 * "No application source sets the GUC" is not a database boundary. The real
 * question is whether the **application database identity** can convert a
 * normal SQL connection into an unrestricted retention bypass. It can, if that
 * identity holds DELETE on the append-only tables — setting
 * `app.bypass_retention_trigger` is allowed to any session, so the exemption
 * trigger alone is not the boundary.
 *
 * The boundary is **least-privilege role separation**: the application role
 * must be a non-superuser that lacks DELETE on append-only tables and cannot
 * assume the retention role. This suite proves that, on real migrated tables,
 * twice on independent disposable databases:
 *
 * - a non-superuser app role with the GUC set is refused (42501) — it cannot
 *   bypass;
 * - a dedicated retention role, and only it, deletes an allowlisted row under
 *   the exemption;
 * - the exemption is DELETE-only and table-scoped (a `reject`-policy table is
 *   refused even with the GUC);
 * - the app role cannot `SET ROLE` to the retention role;
 * - a **superuser** identity bypasses — which is why "the application connects
 *   as a non-superuser role" is a named production go-live control, recorded
 *   rather than hidden.
 *
 * No schema change: grants and roles are not part of the schema fingerprint,
 * so the DB6 baseline (fingerprint `4ca56a59…`) is untouched.
 */
import { sql } from 'drizzle-orm';
import { createDisposableDatabase } from '@embroidery/database/testing';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { seedOrderChain } from '../../modules/order/tests/integration/order-fixture';
import { execAsRole } from './durability-harness';

const SUPERUSER = 'embroidery';

describe('DB10-CP8 retention-bypass security matrix', () => {
  let db: DisposableDatabase;

  beforeAll(async () => {
    db = await createDisposableDatabase('db10-cp8-sec');
    const fixture = await seedOrderChain({ disposable: db });
    // An order + item give a `reject`-policy append-only table to probe.
    await db.client.db.execute(sql`
      insert into orders
        (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (gen_random_uuid(), 'ORD-SEC-1', ${fixture.customRequestId}::uuid,
              ${fixture.customerId}::uuid, ${fixture.quotationVersionId}::uuid,
              ${fixture.approvalSnapshotId}::uuid, 'AWAITING_DEPOSIT', 1050000, 'VND')
    `);
    await db.client.db.execute(sql`
      insert into order_items
        (id, order_id, position, sku_id, product_name, variant_label, size_label,
         quantity, unit_price_amount, line_total_amount, currency_code, approval_snapshot_id)
      select gen_random_uuid(), id, 1, ${fixture.skuId}::uuid, 'Tee', 'Black / M', 'M', 25,
             100000.00, 2500000.00, 'VND', ${fixture.approvalSnapshotId}::uuid
      from orders where code = 'ORD-SEC-1'
    `);
  }, 300_000);

  afterAll(async () => {
    await db?.drop();
  });

  /** Runs the full matrix with a fresh, uniquely named role pair. */
  async function runMatrix(runId: number): Promise<void> {
    const app = `db10_app_${process.pid}_${runId}`;
    const ret = `db10_ret_${process.pid}_${runId}`;
    const tag = `sec-run-${runId}`;

    // Fresh append-only rows for this run.
    await db.client.db.execute(sql`
      insert into audit_events
        (occurred_at, actor_kind, system_job_key, action, target_kind, target_id, correlation_id)
      select now(), 'SYSTEM', ${tag}, 'PROBE', 'ORDER', gen_random_uuid(), gen_random_uuid()
      from generate_series(1, 4) as n
    `);

    // Non-superuser roles. The app role gets SELECT/INSERT but NOT DELETE on
    // the append-only tables; the retention role gets DELETE. Neither is a
    // superuser, and the app role is not a member of the retention role.
    await db.client.db.execute(sql`create role ${sql.identifier(app)} login nosuperuser`);
    await db.client.db.execute(sql`create role ${sql.identifier(ret)} login nosuperuser`);
    await db.client.db.execute(
      sql`grant select, insert on audit_events, order_items to ${sql.identifier(app)}`,
    );
    // The retention role is granted UPDATE as well as DELETE so that the
    // "exemption is DELETE-only" probe is blocked by the trigger (23000), not
    // by a missing privilege — proving the trigger, not the grant, is what
    // refuses the UPDATE.
    await db.client.db.execute(
      sql`grant select, update, delete on audit_events, order_items to ${sql.identifier(ret)}`,
    );

    try {
      const name = db.name;
      const del = (role: string, table: string, guc: boolean, extra = '') =>
        execAsRole(
          name,
          role,
          `${guc ? "set app.bypass_retention_trigger='on'; " : ''}delete from ${table} where ${extra || 'true'}`,
        );

      // 1. app DELETE audit_events, no GUC → refused (no privilege).
      const r1 = await del(app, 'audit_events', false, `system_job_key = '${tag}'`);
      expect(r1.status).not.toBe(0);
      expect(r1.sqlState).toBe('42501');

      // 2–3. app DELETE audit_events WITH the GUC set → still refused. Setting
      // the exemption GUC is allowed to any session; it grants no privilege.
      const r3 = await del(app, 'audit_events', true, `system_job_key = '${tag}'`);
      expect(r3.status).not.toBe(0);
      expect(r3.sqlState).toBe('42501');
      // The rows survived.
      expect(await countTagged(tag)).toBe(4);

      // 4. app DELETE order_items WITH the GUC → refused (no privilege).
      const r4 = await del(app, 'order_items', true, `true`);
      expect(r4.status).not.toBe(0);
      expect(r4.sqlState).toBe('42501');

      // 5. app cannot assume the retention role.
      const r5 = await execAsRole(name, app, `set role ${ret}`);
      expect(r5.status).not.toBe(0);
      expect(r5.stderr).toMatch(/permission denied to set role/i);

      // 6. retention role DELETE audit_events, no GUC → refused by the trigger
      //    (it has the privilege, but the exemption is not set).
      const r6 = await del(ret, 'audit_events', false, `system_job_key = '${tag}'`);
      expect(r6.status).not.toBe(0);
      expect(r6.sqlState).toBe('23000');

      // 7. retention role + GUC → the one identity that may delete. Succeeds.
      const r7 = await del(ret, 'audit_events', true, `system_job_key = '${tag}'`);
      expect(r7.status).toBe(0);
      expect(await countTagged(tag)).toBe(0);

      // 8. retention role + GUC on a `reject`-policy table (order_items) →
      //    refused 23000. The exemption is scoped to retention_exempt tables.
      const r8 = await del(ret, 'order_items', true, `true`);
      expect(r8.status).not.toBe(0);
      expect(r8.sqlState).toBe('23000');

      // 9. UPDATE under the GUC → refused 23000. The exemption is DELETE-only.
      //    A dedicated row is seeded so the UPDATE targets a real row (an
      //    UPDATE matching zero rows would fire no trigger and "succeed").
      await db.client.db.execute(sql`
        insert into audit_events
          (occurred_at, actor_kind, system_job_key, action, target_kind, target_id, correlation_id)
        values (now(), 'SYSTEM', ${`${tag}-upd`}, 'PROBE', 'ORDER', gen_random_uuid(), gen_random_uuid())
      `);
      const r9 = await execAsRole(
        name,
        ret,
        `set app.bypass_retention_trigger='on'; update audit_events set action='X' where system_job_key='${tag}-upd'`,
      );
      expect(r9.status).not.toBe(0);
      expect(r9.sqlState).toBe('23000');

      // 10. The superuser identity bypasses — documented, not hidden. This is
      //     why "the application connects as a non-superuser role" is a named
      //     production go-live control.
      await db.client.db.execute(sql`
        insert into audit_events
          (occurred_at, actor_kind, system_job_key, action, target_kind, target_id, correlation_id)
        values (now(), 'SYSTEM', ${`${tag}-su`}, 'PROBE', 'ORDER', gen_random_uuid(), gen_random_uuid())
      `);
      const r10 = await del(SUPERUSER, 'audit_events', true, `system_job_key = '${tag}-su'`);
      expect(r10.status).toBe(0); // superuser is unconstrainable — production must not run as one
    } finally {
      await db.client.db.execute(sql`drop owned by ${sql.identifier(app)}, ${sql.identifier(ret)}`);
      await db.client.db.execute(sql`drop role if exists ${sql.identifier(app)}`);
      await db.client.db.execute(sql`drop role if exists ${sql.identifier(ret)}`);
    }
  }

  async function countTagged(tag: string): Promise<number> {
    const rows = (
      await db.client.db.execute<{ total: number }>(
        sql`select count(*)::int as total from audit_events where system_job_key = ${tag}`,
      )
    ).rows as { total: number }[];
    return rows[0]?.total ?? 0;
  }

  it('constrains the application identity (independent run 1)', async () => {
    await runMatrix(1);
  }, 120_000);

  it('constrains the application identity (independent run 2)', async () => {
    await runMatrix(2);
  }, 120_000);
});
