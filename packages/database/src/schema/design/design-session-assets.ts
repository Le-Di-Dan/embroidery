/**
 * TBL-026 `design_session_assets` — one session↔uploaded-asset association
 * (CTX-DSN, AGG-09, `assoc`, temp family).
 *
 * Columns: COL-TBL026-01..02 · Constraints: CST-001, CST-043 (IDX-048)
 * Relationships: REL-042 ×2 — → design_sessions (**cascade-temp**),
 * → assets (restrict)
 * Indexes: IDX-048 (constraint-created; `session_id` prefix serves
 * assets-by-session)
 * Owner: Design module.
 *
 * The session FK is the schema's one sanctioned `ON DELETE CASCADE`: the DB4
 * REL legend allows cascade only for *owned temporary children of
 * hard-deleted temp parents*, which is exactly this family — when TTL
 * cleanup hard-deletes a session, its association rows go with it. The asset
 * side stays `restrict`: the uploaded binary's metadata row must survive
 * (its own tombstone flow owns deletion).
 */
import { foreignKey, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { assets } from '../asset/assets';
import { designSessions } from './design-sessions';

export const designSessionAssets = pgTable(
  'design_session_assets',
  {
    id: idColumn().notNull(),
    sessionId: idReference('session_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_session_assets', columns: [t.id] }),
    // CST-043 / IDX-048 — one association per (session, asset).
    unique('uq_design_session_assets__session_asset').on(t.sessionId, t.assetId),
    // REL-042 — cascade-temp: association dies with its hard-deleted session.
    foreignKey({
      name: 'fk_design_session_assets__session_id',
      columns: [t.sessionId],
      foreignColumns: [designSessions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_design_session_assets__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
  ],
);
