/**
 * Canonical column-metric register (DB6-C2).
 *
 * One row per implemented table. The formula is:
 *
 *     documented logical COL IDs + ×N expansions = business columns
 *     business columns + convention columns      = physical columns
 *
 * `logical COL IDs + convention = physical` is NOT the formula — DB4 collapses
 * some multi-column concepts into one COL ID with a ×N marker (e.g.
 * COL-TBL019-09 actor evidence ×3), so IDs undercount physical columns.
 * DB6-C2 exists because running totals were once hand-accumulated with the
 * wrong implicit formula; this register plus its spec make that impossible:
 * every row is verified against the live drizzle schema by
 * `column-metrics.spec.ts`, and the manifest checker cross-checks the group
 * arithmetic on every run.
 *
 * When a group is implemented, its tables are appended here — a table missing
 * from the register or present without a schema export fails the spec.
 */

export interface TableColumnMetric {
  /** Physical table name (must match `getTableName`). */
  readonly table: string;
  /** Implementation group G1..G19. */
  readonly group: string;
  /** Documented DB4 `COL-*` IDs for this table. */
  readonly logicalIds: number;
  /** Extra physical columns produced by DB4 `×N` COL expansions. */
  readonly expansions: number;
  /** Convention columns from the manifest §4.0 register (id/created_at/updated_at). */
  readonly convention: number;
  /** Total physical columns (verified against the live schema). */
  readonly physical: number;
}

export const COLUMN_METRICS: readonly TableColumnMetric[] = [
  // G1 — Identity
  {
    table: 'admin_accounts',
    group: 'G1',
    logicalIds: 6,
    expansions: 0,
    convention: 3,
    physical: 9,
  },
  {
    table: 'admin_credentials',
    group: 'G1',
    logicalIds: 5,
    expansions: 0,
    convention: 3,
    physical: 8,
  },
  {
    table: 'admin_sessions',
    group: 'G1',
    logicalIds: 6,
    expansions: 0,
    convention: 3,
    physical: 9,
  },
  // G2 — Platform base
  {
    table: 'policy_configurations',
    group: 'G2',
    logicalIds: 3,
    expansions: 0,
    convention: 3,
    physical: 6,
  },
  {
    table: 'policy_configuration_versions',
    group: 'G2',
    logicalIds: 7,
    expansions: 0,
    convention: 2,
    physical: 9,
  },
  {
    table: 'idempotency_records',
    group: 'G2',
    logicalIds: 7,
    expansions: 1,
    convention: 3,
    physical: 11,
  },
  {
    table: 'outbox_events',
    group: 'G2',
    logicalIds: 10,
    expansions: 2,
    convention: 2,
    physical: 14,
  },
  {
    table: 'background_job_attempts',
    group: 'G2',
    logicalIds: 7,
    expansions: 0,
    convention: 2,
    physical: 9,
  },
  // G3 — Customer
  { table: 'customers', group: 'G3', logicalIds: 5, expansions: 0, convention: 3, physical: 8 },
  {
    table: 'business_profiles',
    group: 'G3',
    logicalIds: 4,
    expansions: 0,
    convention: 3,
    physical: 7,
  },
  {
    table: 'customer_contact_points',
    group: 'G3',
    logicalIds: 9,
    expansions: 0,
    convention: 3,
    physical: 12,
  },
  // G4 — Asset
  { table: 'assets', group: 'G4', logicalIds: 12, expansions: 0, convention: 3, physical: 15 },
  {
    table: 'asset_inspections',
    group: 'G4',
    logicalIds: 4,
    expansions: 0,
    convention: 2,
    physical: 6,
  },
  {
    table: 'asset_derivatives',
    group: 'G4',
    logicalIds: 6,
    expansions: 0,
    convention: 3,
    physical: 9,
  },
  // G5 — Catalog
  { table: 'categories', group: 'G5', logicalIds: 9, expansions: 0, convention: 3, physical: 12 },
  { table: 'products', group: 'G5', logicalIds: 13, expansions: 0, convention: 3, physical: 16 },
  {
    table: 'product_variants',
    group: 'G5',
    logicalIds: 5,
    expansions: 0,
    convention: 3,
    physical: 8,
  },
  { table: 'skus', group: 'G5', logicalIds: 5, expansions: 0, convention: 3, physical: 8 },
  {
    table: 'product_sides',
    group: 'G5',
    logicalIds: 9,
    expansions: 0,
    convention: 3,
    physical: 12,
  },
  {
    table: 'embroidery_areas',
    group: 'G5',
    logicalIds: 7,
    expansions: 2,
    convention: 3,
    physical: 12,
  },
  { table: 'product_media', group: 'G5', logicalIds: 4, expansions: 0, convention: 3, physical: 7 },
  // G6 — Inventory core
  { table: 'sku_stocks', group: 'G6', logicalIds: 3, expansions: 0, convention: 3, physical: 6 },
  {
    table: 'inventory_ledger_entries',
    group: 'G6',
    logicalIds: 9,
    expansions: 2,
    convention: 2,
    physical: 13,
  },
];

/** Returns the problems with a metric row; empty when it balances. */
export function verifyMetric(metric: TableColumnMetric): readonly string[] {
  const problems: string[] = [];
  const business = metric.logicalIds + metric.expansions;
  if (business + metric.convention !== metric.physical) {
    problems.push(
      `${metric.table}: (${metric.logicalIds} ids + ${metric.expansions} expansions) + ${metric.convention} convention = ${business + metric.convention}, register claims ${metric.physical}`,
    );
  }
  return problems;
}

export interface ColumnMetricTotals {
  readonly logicalIds: number;
  readonly expansions: number;
  readonly business: number;
  readonly convention: number;
  readonly physical: number;
}

export function sumMetrics(metrics: readonly TableColumnMetric[]): ColumnMetricTotals {
  return metrics.reduce(
    (acc, m) => ({
      logicalIds: acc.logicalIds + m.logicalIds,
      expansions: acc.expansions + m.expansions,
      business: acc.business + m.logicalIds + m.expansions,
      convention: acc.convention + m.convention,
      physical: acc.physical + m.physical,
    }),
    { logicalIds: 0, expansions: 0, business: 0, convention: 0, physical: 0 },
  );
}
