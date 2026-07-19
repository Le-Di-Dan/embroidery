/**
 * TBL-061 `production_artifacts` — one job↔asset association: a digitized
 * file, machine file, or internal unwatermarked photo (CTX-PRD, AGG-17,
 * `assoc`, mutable).
 *
 * Columns: COL-TBL061-01..04 · Constraints: CST-001, CST-043 (UQ, `(job,
 * asset)` — ADR-DB4-003 family)
 * Relationships: REL-094 (→ production_jobs, → assets, both restrict —
 * internal-only artifacts, INV-21/22)
 * Indexes: none constraint-created beyond CST-043's backing index; no
 * performance index selected for this table
 * Owner: Production module — the association only; the Asset context owns
 * storage, checksum, classification and retention (same division of
 * ownership as `design_version_assets`/`gallery_entry_assets`).
 *
 * **Internal, unwatermarked (INV-21/22).** Every artifact this table can
 * point to is a production-internal file — digitized/machine files and
 * internal photos, never a public derivative. No `bytea`, no base64, no
 * public-URL authority, and no storage metadata duplicated here: `assets`
 * is the single owner of the file itself; this table only records the
 * job↔asset relationship and its role (`kind`).
 */
import { check, foreignKey, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { productionJobs } from './production-jobs';
import { assets } from '../asset/assets';

/** COL-TBL061-03 closed kind set (DB4). */
export const PRODUCTION_ARTIFACT_KINDS = [
  'DIGITIZED_FILE',
  'MACHINE_FILE',
  'PHOTO',
  'OTHER',
] as const;
export type ProductionArtifactKind = (typeof PRODUCTION_ARTIFACT_KINDS)[number];

export const productionArtifacts = pgTable(
  'production_artifacts',
  {
    id: idColumn().notNull(),
    productionJobId: idReference('production_job_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_production_artifacts', columns: [t.id] }),
    // CST-043 — one association per (job, asset).
    unique('uq_production_artifacts__job_asset').on(t.productionJobId, t.assetId),
    // REL-094 — the job this artifact belongs to.
    foreignKey({
      name: 'fk_production_artifacts__production_job_id',
      columns: [t.productionJobId],
      foreignColumns: [productionJobs.id],
    }).onDelete('restrict'),
    // REL-094 — internal-only artifact source (INV-21/22); Asset owns the file.
    foreignKey({
      name: 'fk_production_artifacts__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    check('ck_production_artifacts__kind_allowed', stateCheck(t.kind, PRODUCTION_ARTIFACT_KINDS)),
  ],
);
