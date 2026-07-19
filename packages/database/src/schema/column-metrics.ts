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
 * Rows are compact tuples so the register stays one line per table at 78
 * tables: `[table, group, logicalIds, expansions, convention, physical]`.
 * A table missing from the register or present without a schema export fails
 * the spec.
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

type MetricRow = readonly [
  table: string,
  group: string,
  logicalIds: number,
  expansions: number,
  convention: number,
  physical: number,
];

const ROWS: readonly MetricRow[] = [
  // G1 — Identity
  ['admin_accounts', 'G1', 6, 0, 3, 9],
  ['admin_credentials', 'G1', 5, 0, 3, 8],
  ['admin_sessions', 'G1', 6, 0, 3, 9],
  // G2 — Platform base
  ['policy_configurations', 'G2', 3, 0, 3, 6],
  ['policy_configuration_versions', 'G2', 7, 0, 2, 9],
  ['idempotency_records', 'G2', 7, 1, 3, 11],
  ['outbox_events', 'G2', 10, 2, 2, 14],
  ['background_job_attempts', 'G2', 7, 0, 2, 9],
  // G3 — Customer
  ['customers', 'G3', 5, 0, 3, 8],
  ['business_profiles', 'G3', 4, 0, 3, 7],
  ['customer_contact_points', 'G3', 9, 0, 3, 12],
  // G4 — Asset
  ['assets', 'G4', 12, 0, 3, 15],
  ['asset_inspections', 'G4', 4, 0, 2, 6],
  ['asset_derivatives', 'G4', 6, 0, 3, 9],
  // G5 — Catalog
  ['categories', 'G5', 9, 0, 3, 12],
  ['products', 'G5', 13, 0, 3, 16],
  ['product_variants', 'G5', 5, 0, 3, 8],
  ['skus', 'G5', 5, 0, 3, 8],
  ['product_sides', 'G5', 9, 0, 3, 12],
  ['embroidery_areas', 'G5', 7, 2, 3, 12],
  ['product_media', 'G5', 4, 0, 3, 7],
  // G6 — Inventory core
  ['sku_stocks', 'G6', 3, 0, 3, 6],
  ['inventory_ledger_entries', 'G6', 9, 2, 2, 13],
  // G7 — Design pre-request
  ['design_templates', 'G7', 8, 2, 3, 13],
  ['design_template_versions', 'G7', 5, 0, 2, 7],
  ['design_template_assets', 'G7', 2, 0, 3, 5],
  ['design_sessions', 'G7', 10, 4, 3, 17],
  ['design_session_assets', 'G7', 2, 0, 3, 5],
  // G8 — Contact verification
  ['contact_verification_challenges', 'G8', 9, 0, 3, 12],
  ['contact_verification_attempts', 'G8', 3, 0, 2, 5],
  // G9 — Request intake & design case
  ['custom_requests', 'G9', 10, 1, 3, 14],
  ['customer_owned_products', 'G9', 4, 1, 3, 8],
  ['custom_request_quantity_breakdowns', 'G9', 4, 0, 3, 7],
  ['custom_request_assets', 'G9', 3, 0, 3, 6],
  ['request_moderation_notes', 'G9', 4, 0, 2, 6],
  ['custom_request_transitions', 'G9', 6, 5, 2, 13],
  ['design_cases', 'G9', 2, 0, 3, 5],
  // G10 — Grants, holds, merge
  ['secure_access_grants', 'G10', 9, 0, 3, 12],
  ['inventory_soft_holds', 'G10', 7, 0, 3, 10],
  ['customer_merge_cases', 'G10', 6, 0, 3, 9],
  ['customer_merge_events', 'G10', 5, 0, 2, 7],
  // G11 — Design formal
  ['design_versions', 'G11', 13, 7, 2, 22],
  ['design_version_assets', 'G11', 2, 0, 2, 4],
  ['design_reviews', 'G11', 5, 2, 2, 9],
];

export const COLUMN_METRICS: readonly TableColumnMetric[] = ROWS.map(
  ([table, group, logicalIds, expansions, convention, physical]) => ({
    table,
    group,
    logicalIds,
    expansions,
    convention,
    physical,
  }),
);

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
