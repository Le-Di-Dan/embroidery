/**
 * TBL-022 `assets` — metadata + internal object-storage reference of one
 * uploaded/authored binary (CTX-AST, AGG-08).
 *
 * Columns: COL-TBL022-01..12 · Constraints: CST-001, CST-017 (IDX-019),
 * CST-060 (LC-06), CST-070 (checksum instance), size CK (COL-TBL022-05)
 * Relationships: REL-033 ×2 — → customers (here); → design_sessions
 * (**deferred to G7**, target table does not exist yet; DB4_DB6_HANDOFF §1
 * nullable-ref + follow-up-FK pattern)
 * Indexes: IDX-086, IDX-133 (required, with group); IDX-119 (recommended, S25)
 * Owner: Asset module. Other contexts hold associations only — this row is
 * the single source of truth for asset metadata.
 *
 * **The binary never enters PostgreSQL** (INV-10): `storage_key` is the
 * internal, stable object-storage reference (CON-043) and the only authority.
 * No public URL is stored — public delivery URLs are derived outside the
 * persistence layer, and signed access is driven by `classification`
 * (CON-044), never by row presence.
 *
 * Private by default (INV-09): `classification` starts CUSTOMER_PRIVATE for
 * customer uploads; PUBLIC is reached only through approved publication flows.
 *
 * Tombstone is two-phase (ADR-DB1-011): `deletion_requested_at` marks phase 1
 * (row + binary still present, swept by IDX-133), `deleted_at` is set only
 * after the binary is confirmed deleted. Rows are retained as tombstones so
 * historical approved/production snapshots never dangle.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { customers } from '../customer/customers';

/** LC-06 (asset side). Canonical source — see DB5-A09. */
export const ASSET_STATES = [
  'UPLOADED',
  'INSPECTING',
  'ACCEPTED',
  'REJECTED',
  'DELETION_PENDING',
  'DELETED',
] as const;
export type AssetState = (typeof ASSET_STATES)[number];

/** COL-TBL022-01 closed kind set (DB4). */
export const ASSET_KINDS = [
  'CUSTOMER_UPLOAD',
  'TEMPLATE_SOURCE',
  'PRODUCTION_FILE',
  'CATALOG_MEDIA',
  'GALLERY_MEDIA',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** COL-TBL022-02 closed classification set (DB4, INV-09). */
export const ASSET_CLASSIFICATIONS = [
  'CUSTOMER_PRIVATE',
  'PRODUCTION_SENSITIVE',
  'PUBLIC',
] as const;
export type AssetClassification = (typeof ASSET_CLASSIFICATIONS)[number];

export const assets = pgTable(
  'assets',
  {
    id: idColumn().notNull(),
    kind: text('kind').notNull(),
    classification: text('classification').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    checksum: text('checksum'),
    status: stateColumn().notNull(),
    uploadedByCustomerId: idReference('uploaded_by_customer_id'),
    uploadedViaSessionId: idReference('uploaded_via_session_id'),
    deletionRequestedAt: instant('deletion_requested_at'),
    deletionReason: text('deletion_reason'),
    deletedAt: instant('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_assets', columns: [t.id] }),
    // CST-017 / IDX-019 — two rows must never claim one binary (INV-10).
    unique('uq_assets__storage_key').on(t.storageKey),
    // REL-033 (customers edge) — provenance only, nullable: guest and admin
    // uploads carry no customer.
    foreignKey({
      name: 'fk_assets__uploaded_by_customer_id',
      columns: [t.uploadedByCustomerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // REL-033 (design_sessions edge) is added in G7 when the target exists.
    check('ck_assets__status_allowed', stateCheck(t.status, ASSET_STATES)),
    check('ck_assets__kind_allowed', stateCheck(t.kind, ASSET_KINDS)),
    check('ck_assets__classification_allowed', stateCheck(t.classification, ASSET_CLASSIFICATIONS)),
    // COL-TBL022-05 — an empty or negative binary is not a stored asset.
    check('ck_assets__size_bytes_positive', sql`${t.sizeBytes} > 0`),
    // CST-070 instance — checksum format when set (ADR-DB1-012 r10).
    check('ck_assets__checksum_format', sql`${t.checksum} ~ '^sha256:[0-9a-f]{64}$'`),
    // IDX-086 — inspection-queue sweep (Q-26); drains to ACCEPTED, stays tiny.
    index('ix_assets__created_id__processing')
      .on(t.createdAt, t.id)
      .where(sql`${t.status} in ('UPLOADED', 'INSPECTING')`),
    // IDX-133 — tombstone phase-1 sweep; `now()` lives in the query, never here.
    index('ix_assets__deletion_requested_id__pending')
      .on(t.deletionRequestedAt, t.id)
      .where(sql`${t.status} = 'DELETION_PENDING'`),
  ],
);
