/**
 * TBL-040 `custom_request_assets` — one request↔asset association: COP
 * image, reference artwork, or attachment (CTX-ORD, AGG-13, `assoc`).
 *
 * Columns: COL-TBL040-01..03 · Constraints: CST-001, CST-043 (IDX-051),
 * role closed set
 * Relationships: REL-063 (third edge — → custom_requests); the → assets
 * edge follows ADR-DB4-003 (context-specific association, no generic
 * asset_links)
 * Indexes: IDX-051 (constraint-created; `custom_request_id` prefix serves
 * attachments-by-request)
 * Owner: Ordering module — association only; Asset owns all metadata.
 *
 * Submitted evidence is retain-class: both FKs are `restrict`, so neither a
 * request nor a referenced asset can be hard-deleted out from under the
 * association — asset disposal goes through the G4 tombstone flow, which
 * sees this association. No storage key/MIME/URL is duplicated here, and
 * attachment existence implies no publication.
 */
import { check, foreignKey, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck } from '../../primitives/lifecycle-state';
import { customRequests } from './custom-requests';
import { assets } from '../asset/assets';

/** COL-TBL040-03 closed role set (DB4). */
export const REQUEST_ASSET_ROLES = ['COP_IMAGE', 'REFERENCE', 'ATTACHMENT'] as const;
export type RequestAssetRole = (typeof REQUEST_ASSET_ROLES)[number];

export const customRequestAssets = pgTable(
  'custom_request_assets',
  {
    id: idColumn().notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    assetId: idReference('asset_id').notNull(),
    role: text('role').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_custom_request_assets', columns: [t.id] }),
    // CST-043 / IDX-051 — one association per (request, asset, role).
    unique('uq_custom_request_assets__request_asset_role').on(t.customRequestId, t.assetId, t.role),
    foreignKey({
      name: 'fk_custom_request_assets__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_custom_request_assets__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    check('ck_custom_request_assets__role_allowed', stateCheck(t.role, REQUEST_ASSET_ROLES)),
  ],
);
