/**
 * TBL-028 `design_versions` — one formal design version: frozen document
 * plus hash once sent for review (CTX-DSN, AGG-10).
 *
 * Columns: COL-TBL028-01..13 (-10 ×4, -11 ×2, -12 ×4) · Constraints:
 * CST-001, CST-021 (IDX-023), CST-022 (IDX-024, LC-08 single active
 * review), CST-066 instance (dims > 0), CST-070 ×2 (hash format), CST-074
 * instance (document_hash required once sent), CST-090 (**append/immutable
 * trigger candidate, S24**)
 * Relationships: REL-045 (→ design_cases), REL-046 (→ design_versions,
 * parent chain), REL-047 (→ asset_derivatives, preview), REL-044 (deferred
 * reverse pointer `design_cases.current_version_id` — resolved by custom
 * SQL in this group's migration, see `0016_...sql`), placement refs
 * `product_id`/`product_variant_id`/`product_side_id`/`embroidery_area_id`
 * (**DEV-DB6-012** — 4 edges DB4's column dictionary mandates via COL-TBL028-10
 * but the REL model documents nowhere, same class of gap as DEV-DB6-010)
 * Indexes: IDX-023 (constraint-created), IDX-024 (constraint-created,
 * explicit partial unique); IDX-116 (recommended, on `design_reviews`) → S25
 * Owner: Design module.
 *
 * **Not collapsed into `design_cases`.** The case is a header with identity
 * and a current-version pointer only; every formal fact (document, hash,
 * placement, lifecycle timestamps) lives on the version row, and history
 * survives here even as the pointer moves.
 *
 * `document_hash`/`preview_hash` follow the same `sha256:<64 hex>` format as
 * `assets.checksum` (CST-070); `document_hash` is additionally required once
 * the row leaves `DRAFT` (CST-074) — an unhashed sent artifact would break
 * GRD-007's exact-hash approval binding. Placement (`product_id` through
 * `embroidery_area_id`) and the two physical dimensions are frozen at send
 * (`frz@sent`) and NOT NULL from creation — DB4's dictionary marks the whole
 * group non-nullable here, unlike `design_sessions`' pre-selection columns
 * where the variant is explicitly optional (COL-TBL025-02 differentiates
 * `no/yes/no/no`; COL-TBL028-10 does not).
 *
 * **CST-090 (reject-mutation once `status <> DRAFT`, except the legal state
 * advance + its own timestamp) is not yet a database mechanism** — S24 owns
 * the trigger; this group implements the CHECK/FK/index layer only and does
 * not fabricate the trigger early. `parent_version_id` is a self-referencing
 * nullable chain (REQ-DVER-005); `void_reason` is required only on a manual
 * VOID (admin, draft-only per DB3 LC-08).
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { designCases } from './design-cases';
import { assetDerivatives } from '../asset/asset-derivatives';
import { products } from '../catalog/products';
import { productVariants } from '../catalog/product-variants';
import { productSides } from '../catalog/product-sides';
import { embroideryAreas } from '../catalog/embroidery-areas';

/** LC-08. Canonical source — see DB5-A09. */
export const DESIGN_VERSION_STATES = [
  'DRAFT',
  'SENT_FOR_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'SUPERSEDED',
  'VOID',
] as const;
export type DesignVersionState = (typeof DESIGN_VERSION_STATES)[number];

export const designVersions = pgTable(
  'design_versions',
  {
    id: idColumn().notNull(),
    designCaseId: idReference('design_case_id').notNull(),
    version: integer('version').notNull(),
    parentVersionId: idReference('parent_version_id'),
    status: stateColumn().notNull(),
    designDocument: jsonb('design_document').notNull(),
    documentSchemaVersion: integer('document_schema_version').notNull(),
    documentHash: text('document_hash'),
    previewDerivativeId: idReference('preview_derivative_id'),
    previewHash: text('preview_hash'),
    productId: idReference('product_id').notNull(),
    productVariantId: idReference('product_variant_id').notNull(),
    productSideId: idReference('product_side_id').notNull(),
    embroideryAreaId: idReference('embroidery_area_id').notNull(),
    physicalWidthMm: numeric('physical_width_mm').notNull(),
    physicalHeightMm: numeric('physical_height_mm').notNull(),
    sentAt: instant('sent_at'),
    approvedAt: instant('approved_at'),
    supersededAt: instant('superseded_at'),
    voidedAt: instant('voided_at'),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_versions', columns: [t.id] }),
    // CST-021 / IDX-023 — version numbers never reused within a case.
    unique('uq_design_versions__case_version').on(t.designCaseId, t.version),
    // CST-022 / IDX-024 — INV-16: at most one version under review at a
    // time; this is the concurrency arbiter (GRD-004), not an optimisation.
    uniqueIndex('uq_design_versions__case__sent_for_review')
      .on(t.designCaseId)
      .where(sql`${t.status} = 'SENT_FOR_REVIEW'`),
    // REL-045 — versions are never deleted while their case exists.
    foreignKey({
      name: 'fk_design_versions__design_case_id',
      columns: [t.designCaseId],
      foreignColumns: [designCases.id],
    }).onDelete('restrict'),
    // REL-046 — parent/supersede chain (self-referencing, nullable).
    foreignKey({
      name: 'fk_design_versions__parent_version_id',
      columns: [t.parentVersionId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    // REL-047 — preview_hash is frozen at send; the derivative must outlive
    // every version that shows it.
    foreignKey({
      name: 'fk_design_versions__preview_derivative_id',
      columns: [t.previewDerivativeId],
      foreignColumns: [assetDerivatives.id],
    }).onDelete('restrict'),
    // DEV-DB6-012 — placement refs frozen at send (COL-TBL028-10, no REL row).
    foreignKey({
      name: 'fk_design_versions__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_versions__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_versions__product_side_id',
      columns: [t.productSideId],
      foreignColumns: [productSides.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_versions__embroidery_area_id',
      columns: [t.embroideryAreaId],
      foreignColumns: [embroideryAreas.id],
    }).onDelete('restrict'),
    check('ck_design_versions__status_allowed', stateCheck(t.status, DESIGN_VERSION_STATES)),
    // COL-TBL028-11 — physical dimensions are always positive (NOT NULL).
    check(
      'ck_design_versions__physical_mm_positive',
      sql`${t.physicalWidthMm} > 0 and ${t.physicalHeightMm} > 0`,
    ),
    // CST-070 instances — same format as assets.checksum/asset_derivatives.checksum.
    check(
      'ck_design_versions__document_hash_format',
      sql`${t.documentHash} is null or ${t.documentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      'ck_design_versions__preview_hash_format',
      sql`${t.previewHash} is null or ${t.previewHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    // CST-074 — an unhashed sent/reviewed/approved artifact breaks GRD-007.
    check(
      'ck_design_versions__document_hash_required_once_sent',
      sql`${t.status} = 'DRAFT' or ${t.documentHash} is not null`,
    ),
    // [R] on manual admin void — never sent, so no review evidence exists to explain it otherwise.
    check(
      'ck_design_versions__void_reason_required',
      sql`${t.status} <> 'VOID' or ${t.voidReason} is not null`,
    ),
  ],
);
