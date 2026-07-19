/**
 * TBL-029 `design_version_assets` — one version↔asset association: an
 * upload frozen into the version at send time (CTX-DSN, AGG-10, `assoc`).
 *
 * Columns: COL-TBL029-01..02 · Constraints: CST-001, CST-043 (IDX-047)
 * Relationships: REL-048 ×2 (→ design_versions, → assets)
 * Indexes: IDX-047 (constraint-created; `design_version_id` prefix serves
 * assets-by-version)
 * Owner: Design module — the association only; Asset owns the metadata.
 *
 * Frozen with the version (REL-048 note): once a version is sent, its
 * asset set does not change — a later revision creates a new version row
 * with its own associations rather than mutating this one.
 */
import { foreignKey, pgTable, primaryKey, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt } from '../../primitives/temporal';
import { designVersions } from './design-versions';
import { assets } from '../asset/assets';

export const designVersionAssets = pgTable(
  'design_version_assets',
  {
    id: idColumn().notNull(),
    designVersionId: idReference('design_version_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_version_assets', columns: [t.id] }),
    // CST-043 / IDX-047 — one association per (version, asset).
    unique('uq_design_version_assets__version_asset').on(t.designVersionId, t.assetId),
    foreignKey({
      name: 'fk_design_version_assets__design_version_id',
      columns: [t.designVersionId],
      foreignColumns: [designVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_version_assets__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
  ],
);
