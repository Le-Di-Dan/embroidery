/**
 * Deterministic dataset generation for the DB9 benchmark harness (DB9-CP1).
 *
 * Generation happens **in SQL** — one `INSERT … SELECT … FROM
 * generate_series` per table (§23: no row-at-a-time where bulk is safe) —
 * against the real migrated schema with every CHECK, FK and S24 trigger
 * live. Nothing is disabled to make seeding faster; a dataset that only
 * loads with the constraints off would not be a dataset the application
 * could ever produce.
 *
 * Ids come from `bench_uuid(seed, n)` so a regenerated tier is byte-identical
 * on any machine (§23 deterministic seed), and time-ordered so index layout
 * matches production's UUIDv7 writes.
 *
 * Skew is deliberate (§22): most orders sit in terminal states with a live
 * minority, queue tables carry a small ready subset, and inventory activity
 * concentrates on a hot 5% of SKUs. A uniform dataset would make every
 * partial index look equally useful, which is precisely the measurement
 * error DB9 exists to avoid.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';
import type { DisposableDatabase } from '@embroidery/database/testing';

import { seedOrderChain } from '../../modules/order/tests/integration/order-fixture';
import type { OrderFixture } from '../../modules/order/tests/integration/order-fixture';
import { seedCatalogVolume, seedContentVolume } from './bench-dataset-catalog';
import { seedPipelineVolume } from './bench-dataset-pipeline';
import { seedQueueVolume } from './bench-dataset-events';
import { tier } from './bench-dataset-tiers';
import type { DatasetTier, DatasetTierName } from './bench-dataset-tiers';
import { installBenchUuid } from './bench-uuid';

export interface BenchDataset {
  readonly tier: DatasetTier;
  readonly seed: string;
  readonly backbone: OrderFixture;
  /** Actual row counts, read back from the database — never assumed (§23). */
  readonly counts: Readonly<Record<string, number>>;
  readonly generationMs: number;
}

/** Tables whose row counts are verified and reported for every tier. */
const COUNTED_TABLES = [
  'categories',
  'products',
  'product_variants',
  'skus',
  'sku_stocks',
  'customers',
  'customer_contact_points',
  'custom_requests',
  'quotations',
  'quotation_versions',
  'design_cases',
  'design_versions',
  'approval_snapshots',
  'orders',
  'order_items',
  'order_transitions',
  'payment_obligations',
  'payment_attempts',
  'payment_provider_events',
  'inventory_ledger_entries',
  'audit_events',
  'outbox_events',
  'notification_intents',
  'notification_delivery_attempts',
  'content_pages',
  'redirect_rules',
  'gallery_entries',
] as const;

async function readCounts(
  disposable: DisposableDatabase,
): Promise<Readonly<Record<string, number>>> {
  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    const result = await disposable.client.db.execute<{ total: number }>(
      sql`select count(*)::int as total from ${sql.identifier(table)}`,
    );
    counts[table] = Number(result.rows[0]?.total ?? 0);
  }
  return counts;
}

/**
 * Builds a tier into an already-migrated disposable database.
 *
 * `ANALYZE` runs at the end because a plan captured against stale statistics
 * measures the planner's ignorance, not the schema (§21).
 */
export async function generateDataset(
  context: { readonly disposable: DisposableDatabase },
  tierName: DatasetTierName,
  seed = 'db9',
): Promise<BenchDataset> {
  const startedAt = process.hrtime.bigint();
  const spec = tier(tierName);
  const db = context.disposable.client.db;

  await installBenchUuid(db);

  // The backbone is the one hand-written, fully valid chain every generated
  // row hangs off. Reusing the DB7/DB8 fixture rather than re-deriving it
  // means the benchmark data satisfies exactly the constraints the
  // correctness suites already prove.
  const backbone = await seedOrderChain(context, 'bench');

  await seedCatalogVolume(db, spec, seed, backbone);
  await seedContentVolume(db, spec, seed);
  await seedPipelineVolume(db, spec, seed, backbone);
  await seedQueueVolume(db, spec, seed, backbone);

  await db.execute(sql`analyze`);

  const counts = await readCounts(context.disposable);
  const generationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  return { tier: spec, seed, backbone, counts, generationMs };
}

/** Renders the count table used in the execution log and completion report. */
export function formatCounts(dataset: BenchDataset): string {
  return Object.entries(dataset.counts)
    .map(([table, total]) => `| \`${table}\` | ${total.toLocaleString('en-US')} |`)
    .join('\n');
}
