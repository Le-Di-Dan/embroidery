/**
 * TBL-033 `approval_snapshot_agreement_acceptances` — acceptance evidence
 * of one agreement type/version inside an approval (CTX-DSN, AGG-11,
 * `snap (child)`).
 *
 * Columns: COL-TBL033-01..05 · Constraints: CST-001, CST-024 (IDX-026, one
 * acceptance per agreement version), CST-070 instance (hash format),
 * CST-091 (immutable, S24 target — same treatment as the parent
 * `approval_snapshots`)
 * Relationships: REL-055 ×2 (→ approval_snapshots, → agreement_versions,
 * restrict — premature deletion of either side is structurally impossible)
 * Indexes: IDX-026 (constraint-created)
 * Owner: Design module — the child evidence only.
 *
 * **GRD-008 (effective agreement accepted, TX/App):** this row's
 * `content_hash` must equal the referenced `agreement_versions.content_hash`
 * at accept time — that equality is verified inside the approval
 * transaction, not by a schema-level guarantee; the FK only proves the
 * referenced version exists, not that its hash matches this row's frozen
 * copy. `agreement_type` is a frozen display copy (Class F) of the type
 * accepted, independent of the live `agreements.agreement_type` row.
 *
 * Reference is to the exact **`agreement_versions.id`** — never to
 * `agreements.current_version_id` (a mutable pointer, not historical
 * authority per DB6-C4/G12's own current-pointer finding). A later
 * publish that moves the agreement's current pointer does not change,
 * and cannot change (CST-091), this acceptance's evidence.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { approvalSnapshots } from './approval-snapshots';
import { agreementVersions } from '../content/agreement-versions';

export const approvalSnapshotAgreementAcceptances = pgTable(
  'approval_snapshot_agreement_acceptances',
  {
    id: sequenceColumn(),
    approvalSnapshotId: idReference('approval_snapshot_id').notNull(),
    agreementVersionId: idReference('agreement_version_id').notNull(),
    agreementType: text('agreement_type').notNull(),
    contentHash: text('content_hash').notNull(),
    acceptedAt: instant('accepted_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_approval_snapshot_agreement_acceptances', columns: [t.id] }),
    // CST-024 / IDX-026 — one acceptance per (snapshot, agreement version).
    unique('uq_approval_acceptances__approval_agrversion').on(
      t.approvalSnapshotId,
      t.agreementVersionId,
    ),
    // REL-055 — immutable child, composed under its snapshot.
    foreignKey({
      name: 'fk_approval_acceptances__approval_snapshot_id',
      columns: [t.approvalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
    // REL-055 — exact version reference, never the mutable current pointer.
    foreignKey({
      name: 'fk_approval_acceptances__agreement_version_id',
      columns: [t.agreementVersionId],
      foreignColumns: [agreementVersions.id],
    }).onDelete('restrict'),
    // CST-070 instance — same format as agreement_versions.content_hash.
    check(
      'ck_approval_acceptances__content_hash_format',
      sql`${t.contentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);
