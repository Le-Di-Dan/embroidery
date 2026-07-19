/**
 * TBL-041 `request_moderation_notes` — one moderation action note:
 * spam / reject / pause / clarify / note (CTX-ORD, AGG-13, `append`).
 *
 * Columns: COL-TBL041-01..04 · Constraints: CST-001, kind closed set,
 * CST-098 (append-only trigger target, S24)
 * Relationships: REL-063 (fourth edge — → custom_requests)
 * Indexes: IDX-137 (recommended — S25); no other non-PK index
 * Owner: Ordering module.
 *
 * Append-only moderation evidence: no `updated_at`, rows are never edited —
 * a changed decision is a new note. `note` is required-with-reason for
 * SPAM/REJECT/PAUSE per the audit spec; that conditional is app-owned (DB4
 * marks `[R]`, not a CHECK — the requirement varies by kind and reviewer
 * flow, so no partial CHECK is invented).
 *
 * `admin_id` carries a dictionary arrow (→admin_accounts) but **no REL row
 * exists for it** — DB4's relationship model FKs actor references only where
 * REL-105 lists them (TBL-042/045/063/072), and TBL-041 is not in that list.
 * It therefore stays an evidence reference without a physical FK, exactly
 * like the G6 ledger actor refs the review accepted; app-level integrity and
 * the DB7 evidence tests own it. No new edge is invented and the 153/151
 * denominators stand.
 */
import { check, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { customRequests } from './custom-requests';

/** COL-TBL041-02 closed kind set (DB4). */
export const MODERATION_NOTE_KINDS = ['SPAM', 'REJECT', 'PAUSE', 'CLARIFY', 'NOTE'] as const;
export type ModerationNoteKind = (typeof MODERATION_NOTE_KINDS)[number];

export const requestModerationNotes = pgTable(
  'request_moderation_notes',
  {
    id: sequenceColumn(),
    customRequestId: idReference('custom_request_id').notNull(),
    kind: text('kind').notNull(),
    note: text('note').notNull(),
    adminId: idReference('admin_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_request_moderation_notes', columns: [t.id] }),
    foreignKey({
      name: 'fk_request_moderation_notes__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    check('ck_request_moderation_notes__kind_allowed', stateCheck(t.kind, MODERATION_NOTE_KINDS)),
  ],
);
