/**
 * TBL-060 `production_specifications` — the immutable specification frozen
 * from the approval at job creation (CTX-PRD, AGG-17, `snap`).
 *
 * Columns: COL-TBL060-01..07 · Constraints: CST-001, CST-042 (UQ,
 * `production_job_id` — 1–1)
 * Relationships: REL-093 (→ production_jobs 1–1, → approval_snapshots N–1
 * — frozen at creation)
 * Indexes: none constraint-created beyond CST-042's backing index; no
 * performance index selected for this table
 * Owner: Production module.
 *
 * **Immutable (no `updated_at`).** Frozen once, at job creation
 * (TR-LC18-01, DB3), from the exact `approval_snapshots` row the job
 * references — never recomputed after Production starts. A correction is
 * never an UPDATE: rework cancels the job (LC-18) and a new job/spec pair
 * is created from a new approval. Enforcing that rule at the database level
 * needs a reject-mutation trigger — **not yet a database mechanism**, same
 * honestly-documented gap as CST-090/092/096 for prior groups; S24 owns it,
 * this group implements the CHECK/FK/index layer only.
 *
 * `document_hash` is the copied approval hash (D7-07 linkage), not an
 * independently computed one — same format as `approval_snapshots.
 * document_hash`/`design_versions.document_hash`/`assets.checksum`
 * (CST-070 instance). `product_name`/`variant_label`/`side_name`/
 * `area_name` are frozen display copies (Class F, INV-12), never
 * re-derived from live catalog rows.
 *
 * **Existence vs. same-chain integrity.** The FKs to `production_jobs` and
 * `approval_snapshots` prove both rows exist; that this specification's
 * `approval_snapshot_id` is the *same* snapshot the parent job itself
 * references (not merely some other valid snapshot) is not database-
 * enforced here — no composite FK or trigger is invented for it. TX/App
 * owns writing both from the same creation transaction; DB7 owns a same-
 * chain integration test.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { productionJobs } from './production-jobs';
import { approvalSnapshots } from '../design/approval-snapshots';

export const productionSpecifications = pgTable(
  'production_specifications',
  {
    id: idColumn().notNull(),
    productionJobId: idReference('production_job_id').notNull(),
    approvalSnapshotId: idReference('approval_snapshot_id').notNull(),
    documentHash: text('document_hash').notNull(),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label'),
    sideName: text('side_name').notNull(),
    areaName: text('area_name').notNull(),
    physicalWidthMm: numeric('physical_width_mm').notNull(),
    physicalHeightMm: numeric('physical_height_mm').notNull(),
    quantityTotal: integer('quantity_total').notNull(),
    productionParameters: text('production_parameters'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_production_specifications', columns: [t.id] }),
    // CST-042 — one specification per job (1–1, INV-03).
    unique('uq_production_specifications__job').on(t.productionJobId),
    // REL-093 — the job this specification belongs to.
    foreignKey({
      name: 'fk_production_specifications__production_job_id',
      columns: [t.productionJobId],
      foreignColumns: [productionJobs.id],
    }).onDelete('restrict'),
    // REL-093 — source snapshot; existence physical, same-chain is TX/App.
    foreignKey({
      name: 'fk_production_specifications__approval_snapshot_id',
      columns: [t.approvalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
    // COL-TBL060-05 — physical dimensions are always positive (NOT NULL).
    check(
      'ck_production_specifications__physical_mm_positive',
      sql`${t.physicalWidthMm} > 0 and ${t.physicalHeightMm} > 0`,
    ),
    check('ck_production_specifications__quantity_positive', sql`${t.quantityTotal} > 0`),
    // CST-070 instance — same format as approval_snapshots/design_versions/assets.
    check(
      'ck_production_specifications__document_hash_format',
      sql`${t.documentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);
