/**
 * TBL-023 `asset_inspections` — one validation-pipeline outcome for an asset
 * (CTX-AST, AGG-08).
 *
 * Columns: COL-TBL023-01..04 · Constraints: CST-001, outcome CK, CST-098
 * (append-only trigger target, S24)
 * Relationships: REL-032 (first edge — → assets)
 * Indexes: IDX-132 (recommended, S25)
 * Owner: Asset module.
 *
 * **Append-only** (DB4 `Cat: append`): a row is evidence of one completed
 * inspection, written once. A re-inspection is a *new* row, never an edit —
 * so there is no `updated_at`, no retry metadata, and no claim state here.
 * Queueing/claiming lives with the Platform context (`background_job_attempts`
 * and the outbox); this table must not become a job queue.
 *
 * `outcome` records only terminal results (ACCEPTED/REJECTED). The asset's
 * *current* processing state lives on `assets.status` (LC-06); this table is
 * the history, not the state owner.
 *
 * `detail` carries bounded validation findings (spec 09 §4) — never raw
 * scanner output and never quarantined payload content.
 */
import { check, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { assets } from './assets';

/** COL-TBL023-02 terminal outcome set (DB4). */
export const ASSET_INSPECTION_OUTCOMES = ['ACCEPTED', 'REJECTED'] as const;
export type AssetInspectionOutcome = (typeof ASSET_INSPECTION_OUTCOMES)[number];

export const assetInspections = pgTable(
  'asset_inspections',
  {
    id: sequenceColumn(),
    assetId: idReference('asset_id').notNull(),
    outcome: text('outcome').notNull(),
    detail: text('detail'),
    inspectedAt: instant('inspected_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_asset_inspections', columns: [t.id] }),
    // REL-032 — composition; `restrict` so tombstoning an asset cannot orphan
    // or silently drop its inspection evidence (two-phase delete owns the
    // ordering).
    foreignKey({
      name: 'fk_asset_inspections__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    check(
      'ck_asset_inspections__outcome_allowed',
      stateCheck(t.outcome, ASSET_INSPECTION_OUTCOMES),
    ),
  ],
);
