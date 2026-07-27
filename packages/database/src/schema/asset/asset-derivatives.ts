/**
 * TBL-024 `asset_derivatives` — one generated derivative (watermarked preview,
 * mockup, normalized copy, thumbnail) of a parent asset (CTX-AST, AGG-08).
 *
 * Columns: COL-TBL024-01..06 · Constraints: CST-001, CST-018 (IDX-020),
 * CST-017 family (IDX-064), CST-060, CST-070 (checksum instance)
 * Relationships: REL-032 (second edge — → assets)
 * Indexes: IDX-087, IDX-099 (required, with group)
 * Owner: Asset module.
 *
 * A derivative holds its **own** object-storage reference (COL-TBL024-04) —
 * DB4 models it as metadata with a storage key, not as a second `assets` row,
 * and DB6 does not change that model. `storage_key` is NULL until the pipeline
 * reaches READY, then unique (IDX-064): two derivative rows must never claim
 * one binary, and the parent's original key is never reused.
 *
 * CST-018 makes the pipeline idempotent per (asset, kind): only one
 * non-FAILED derivative may exist, so a concurrent duplicate job loses with
 * 23505 (CC-19) while a FAILED row stays as lineage and permits a retry row.
 * The predicate `status <> 'FAILED'` deliberately cannot be matched by Q-30's
 * `status = 'READY'` resolve — that read uses IDX-099 instead (DB5 cost
 * report §4); the two indexes are not redundant.
 *
 * `is_watermarked` is INV-22: customer-visible previews are watermarked;
 * internal production artifacts are not. A public derivative never exposes
 * the private original — resolution goes through this row's own key. APP2-DB01
 * gives that invariant its first physical half
 * (`ck_asset_derivatives__watermark_by_kind`) for the two kinds whose identity
 * is the watermark decision.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { assets } from './assets';

/** LC-06 (derivative side). Canonical source — see DB5-A09. */
export const ASSET_DERIVATIVE_STATES = ['PENDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type AssetDerivativeState = (typeof ASSET_DERIVATIVE_STATES)[number];

/**
 * COL-TBL024-02 closed kind set (DB4; `CATALOG_PREVIEW` added by APP2-DB01).
 *
 * `PREVIEW_WATERMARKED` is the **customer/design** preview and is watermarked
 * by definition (INV-22, BR-012). `CATALOG_PREVIEW` is the **catalog display**
 * derivative generated from a `CATALOG_MEDIA` asset for Admin/Storefront
 * presentation: store-owned marketing media, never watermarked. They are two
 * different domain concepts, which is why the second one is its own kind rather
 * than the first one with `is_watermarked = false` — that pairing would make
 * `ck_asset_derivatives__watermark_by_kind` (and the public preview contract in
 * ADR-APP2-001 §4.7) self-contradictory. `NORMALIZED` keeps its artwork-pipeline
 * meaning and is not a display preview.
 */
export const ASSET_DERIVATIVE_KINDS = [
  'PREVIEW_WATERMARKED',
  'MOCKUP',
  'NORMALIZED',
  'THUMBNAIL',
  'CATALOG_PREVIEW',
] as const;
export type AssetDerivativeKind = (typeof ASSET_DERIVATIVE_KINDS)[number];

export const assetDerivatives = pgTable(
  'asset_derivatives',
  {
    id: idColumn().notNull(),
    assetId: idReference('asset_id').notNull(),
    kind: text('kind').notNull(),
    status: stateColumn().notNull(),
    storageKey: text('storage_key'),
    checksum: text('checksum'),
    isWatermarked: boolean('is_watermarked').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_asset_derivatives', columns: [t.id] }),
    // REL-032 — composition; tombstone two-phase owns deletion ordering.
    foreignKey({
      name: 'fk_asset_derivatives__asset_id',
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete('restrict'),
    // CST-018 / IDX-020 — one non-FAILED derivative per (asset, kind).
    uniqueIndex('uq_asset_derivatives__asset_kind__not_failed')
      .on(t.assetId, t.kind)
      .where(sql`${t.status} <> 'FAILED'`),
    // CST-017 family / IDX-064 — derivative binaries are unique once written.
    uniqueIndex('uq_asset_derivatives__storage_key__set')
      .on(t.storageKey)
      .where(sql`${t.storageKey} is not null`),
    check('ck_asset_derivatives__status_allowed', stateCheck(t.status, ASSET_DERIVATIVE_STATES)),
    check('ck_asset_derivatives__kind_allowed', stateCheck(t.kind, ASSET_DERIVATIVE_KINDS)),
    // INV-22 / BR-012, physical half (APP2-DB01). Until now the watermark rule
    // was application-enforced only (DB3_INVARIANT_ENFORCEMENT_PLAN "APP"), so
    // nothing stopped a watermarked-preview row claiming it carries no
    // watermark. The rule is stated only for the two kinds whose identity *is*
    // the watermark decision; MOCKUP, NORMALIZED and THUMBNAIL keep their
    // existing freedom, because no invariant constrains them.
    check(
      'ck_asset_derivatives__watermark_by_kind',
      sql`(${t.kind} <> 'PREVIEW_WATERMARKED' or ${t.isWatermarked} = true) and (${t.kind} <> 'CATALOG_PREVIEW' or ${t.isWatermarked} = false)`,
    ),
    // CST-070 instance — checksum format when set.
    check('ck_asset_derivatives__checksum_format', sql`${t.checksum} ~ '^sha256:[0-9a-f]{64}$'`),
    // READY means the binary exists — a READY row without a key would be an
    // unresolvable derivative that Q-30 happily returns.
    check(
      'ck_asset_derivatives__ready_has_storage_key',
      sql`${t.status} <> 'READY' or ${t.storageKey} is not null`,
    ),
    // IDX-087 — processing-queue sweep (Q-26); drains, stays tiny.
    index('ix_asset_derivatives__created_id__processing')
      .on(t.createdAt, t.id)
      .where(sql`${t.status} in ('PENDING', 'PROCESSING')`),
    // IDX-099 — Q-30 derivative resolve by parent (see header note).
    index('ix_asset_derivatives__asset').on(t.assetId),
  ],
);
