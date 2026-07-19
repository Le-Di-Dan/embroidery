/**
 * TBL-032 `approval_snapshot_thread_colors` — one thread color captured in
 * an approval snapshot (CTX-DSN, AGG-11, `snap (child)`).
 *
 * Columns: COL-TBL032-01..04 · Constraints: CST-001, CST-051 instance
 * (IDX-063, one color per position), CST-091 (immutable, S24 target — same
 * treatment as the parent `approval_snapshots`)
 * Relationships: REL-054 (→ approval_snapshots, restrict)
 * Indexes: IDX-063 (constraint-created; `approval_snapshot_id` prefix
 * serves colors-by-snapshot)
 * Owner: Design module — the child evidence only; parent owns the
 * approval identity.
 *
 * `color_code` (CON-059, thread color VO) is captured as submitted at
 * approval time and never re-derived from a live palette table — there is
 * no palette catalog table in this schema, so this stays plain text with
 * no FK, per DB4.
 */
import { foreignKey, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { approvalSnapshots } from './approval-snapshots';

export const approvalSnapshotThreadColors = pgTable(
  'approval_snapshot_thread_colors',
  {
    id: sequenceColumn(),
    approvalSnapshotId: idReference('approval_snapshot_id').notNull(),
    position: integer('position').notNull(),
    colorCode: text('color_code').notNull(),
    colorName: text('color_name'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_approval_snapshot_thread_colors', columns: [t.id] }),
    // CST-051 instance / IDX-063 — one color per position within a snapshot.
    unique('uq_approval_thread_colors__approval_position').on(t.approvalSnapshotId, t.position),
    // REL-054 — immutable child, composed under its snapshot.
    foreignKey({
      name: 'fk_approval_thread_colors__approval_snapshot_id',
      columns: [t.approvalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
  ],
);
