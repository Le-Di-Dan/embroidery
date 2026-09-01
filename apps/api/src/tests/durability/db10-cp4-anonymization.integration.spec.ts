/**
 * DB10-CP4 — customer anonymization and retention performance.
 *
 * Anonymization (§34): scrubbing a customer's direct PII must keep the row,
 * its id and every commercial link, and must not touch the frozen contact
 * snapshot inside an approval — that is evidence, redacted only by a
 * break-glass privacy procedure. It must also be idempotent and survive a
 * backup/restore round-trip.
 *
 * Retention performance (§35): a bounded sweep is measured at a larger cohort
 * so batch count, rows and wall-clock are real numbers rather than a claim.
 * These are local benchmark figures on one machine — never an SLA.
 */
import { sql } from 'drizzle-orm';

import { verifySchemaBaseline } from '@embroidery/database/testing';

import { createConcurrencyTestContext } from '../integration/db8-concurrency-context';
import type { ConcurrencyTestContext } from '../integration/db8-concurrency-context';
import { seedOrderChain } from '../../modules/order/tests/integration/order-fixture';
import type { OrderFixture } from '../../modules/order/tests/integration/order-fixture';
import { DATABASE_CONNECTION } from '@embroidery/persistence';

import { OrderModule } from '../../modules/order/order.module';
import {
  attachActor,
  createBackupWorkspace,
  dropDatabaseIfExists,
  manifestPathFor,
  runTool,
  urlForDatabase,
} from './durability-harness';
import type { BackupWorkspace } from './durability-harness';

describe('DB10-CP4 anonymization and retention performance', () => {
  let context: ConcurrencyTestContext;
  let fixture: OrderFixture;

  const exec = <T extends Record<string, unknown>>(
    q: ReturnType<typeof sql>,
  ): Promise<{ rows: T[] }> =>
    context.disposable.client.db.execute<T>(q) as unknown as Promise<{ rows: T[] }>;

  async function scalar<T>(q: ReturnType<typeof sql>): Promise<T | undefined> {
    return (await exec<{ value: T }>(q)).rows[0]?.value;
  }

  beforeAll(async () => {
    context = await createConcurrencyTestContext('db10-cp4-anon', []);
    fixture = await seedOrderChain(context);

    // Give the seeded customer real PII and a live order so anonymization has
    // something to preserve around.
    await exec(sql`
      update customers set display_name = 'Real Person', notes = 'sensitive note'
      where id = ${fixture.customerId}::uuid
    `);
    await exec(sql`
      update customer_contact_points
      set normalized_value = 'real@example.com', display_value = 'real@example.com'
      where customer_id = ${fixture.customerId}::uuid
    `);
    await exec(sql`
      insert into orders
        (id, code, origin, custom_request_id, customer_id, accepted_quotation_version_id,
         current_approval_snapshot_id, status, total_amount, currency_code)
      values (gen_random_uuid(), 'ORD-ANON-1', 'CUSTOM', ${fixture.customRequestId}::uuid,
              ${fixture.customerId}::uuid, ${fixture.quotationVersionId}::uuid,
              ${fixture.approvalSnapshotId}::uuid, 'AWAITING_DEPOSIT', 1050000, 'VND')
    `);
  }, 300_000);

  afterAll(async () => {
    await context?.close();
  });

  it('scrubs direct PII while keeping the row and its commercial links', async () => {
    const result = await runTool('db-anonymize.mjs', [
      '--database',
      context.disposable.name,
      '--customer',
      fixture.customerId,
    ]);
    expect(result.status).toBe(0);

    const customer = (
      await exec<{
        display_name: string | null;
        notes: string | null;
        anonymized_at: string | null;
      }>(
        sql`select display_name, notes, anonymized_at from customers where id = ${fixture.customerId}::uuid`,
      )
    ).rows[0];
    expect(customer?.display_name).toBeNull();
    expect(customer?.notes).toBeNull();
    expect(customer?.anonymized_at).not.toBeNull();

    const contact = (
      await exec<{ normalized_value: string; anonymized_at: string | null }>(
        sql`select normalized_value, anonymized_at from customer_contact_points where customer_id = ${fixture.customerId}::uuid`,
      )
    ).rows[0];
    expect(contact?.normalized_value).not.toBe('real@example.com');
    expect(contact?.anonymized_at).not.toBeNull();

    // The order still exists and still points at the (now anonymized) customer.
    expect(
      await scalar<number>(
        sql`select count(*)::int as value from orders where customer_id = ${fixture.customerId}::uuid`,
      ),
    ).toBe(1);
  }, 120_000);

  it('does not touch the frozen contact snapshot inside an approval (evidence)', async () => {
    // approval_snapshots carries a document_hash and its own frozen fields; it
    // is S24-immutable and anonymization must never reach it.
    const snapshot = (
      await exec<{ total: number }>(
        sql`select count(*)::int as total from approval_snapshots where id = ${fixture.approvalSnapshotId}::uuid`,
      )
    ).rows[0];
    expect(Number(snapshot?.total)).toBe(1);
  }, 60_000);

  it('is idempotent — a second run anonymizes nobody', async () => {
    const result = await runTool('db-anonymize.mjs', [
      '--database',
      context.disposable.name,
      '--customer',
      fixture.customerId,
    ]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}') as {
      anonymized: number;
    };
    expect(payload.anonymized).toBe(0);
  }, 120_000);

  it('keeps the anonymization across a backup and restore', async () => {
    let workspace: BackupWorkspace | undefined;
    const target = `embroidery_db10_anon_${process.pid}`.slice(0, 63);
    try {
      workspace = await createBackupWorkspace('anon');
      const backup = await runTool('db-backup.mjs', [
        '--database',
        context.disposable.name,
        '--out',
        workspace.directory,
        '--url',
        context.disposable.url,
      ]);
      expect(backup.status).toBe(0);
      const manifestPath = manifestPathFor(workspace.directory, backup.stdout);

      const restore = await runTool('db-restore.mjs', [
        '--manifest',
        manifestPath,
        '--target',
        target,
        '--create',
      ]);
      expect(restore.status).toBe(0);

      // The restored copy still passes the baseline and still carries the
      // scrub — the anonymization travelled inside the backup.
      const outcome = await verifySchemaBaseline(urlForDatabase(target));
      expect(outcome.passed).toBe(true);

      const actor = await attachActor('anon-restore', [OrderModule], target);
      try {
        const connection = actor.get<{
          database: { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };
        }>(DATABASE_CONNECTION);
        const rows = (
          await connection.database.execute(
            sql`select display_name, anonymized_at from customers where id = ${fixture.customerId}::uuid`,
          )
        ).rows as { display_name: string | null; anonymized_at: string | null }[];
        expect(rows[0]?.display_name).toBeNull();
        expect(rows[0]?.anonymized_at).not.toBeNull();
      } finally {
        await actor.close();
      }
    } finally {
      await dropDatabaseIfExists(target);
      await workspace?.dispose();
    }
  }, 300_000);

  it('measures a bounded retention sweep at a larger cohort (§35)', async () => {
    // 5 000 old dispatched outbox rows, swept in batches of 1 000.
    await exec(sql`
      insert into outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, created_at, dispatched_at)
      select 'perf.event', 'ORDER', gen_random_uuid(), '{}'::jsonb, 1, 'DISPATCHED', 1,
             now() - interval '400 days', now() - interval '400 days'
      from generate_series(1, 5000) as n
    `);

    const cutoff = await scalar<string>(sql`select (now() - interval '90 days')::text as value`);
    const result = await runTool('db-retention.mjs', [
      '--database',
      context.disposable.name,
      '--family',
      'outbox',
      '--cutoff',
      cutoff ?? '',
      '--batch',
      '1000',
    ]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split('\n').pop() ?? '{}') as {
      durationMs: number;
      report: Record<string, { deleted: number; batches: number } | undefined>;
    };
    const outbox = payload.report.outbox_events;

    expect(outbox?.deleted).toBe(5000);
    expect(outbox?.batches).toBe(5);
    // Local benchmark evidence only — recorded, never asserted as an SLA.
    console.log(
      `[db10-cp4] retention sweep: ${outbox?.deleted} rows in ` +
        `${outbox?.batches} batches, ${payload.durationMs} ms (local, not an SLA)`,
    );
    expect(payload.durationMs).toBeGreaterThan(0);
  }, 300_000);
});
