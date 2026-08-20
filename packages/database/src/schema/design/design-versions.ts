/**
 * TBL-028 `design_versions` — one formal design version: frozen document
 * plus hash once sent for review (CTX-DSN, AGG-10).
 *
 * Columns: COL-TBL028-01..13 (-10 ×4, -11 ×2, -12 ×4) · Constraints:
 * CST-001, CST-021 (IDX-023), CST-022 (IDX-024, LC-08 single active
 * review), CST-066 instance (dims > 0), CST-070 ×2 (hash format), CST-074
 * instance (document_hash required once sent), CST-090 (**append/immutable
 * trigger candidate, S24**), CST-129 (exactly one placement branch, APP6-DB01),
 * CST-130 (COP placement labels, APP6-DB01)
 * Relationships: REL-045 (→ design_cases), REL-046 (→ design_versions,
 * parent chain), REL-047 (→ asset_derivatives, preview), REL-044 (deferred
 * reverse pointer `design_cases.current_version_id` — resolved by custom
 * SQL in this group's migration, see `0016_...sql`), placement refs
 * `product_id`/`product_variant_id`/`product_side_id`/`embroidery_area_id`
 * (**DEV-DB6-012** — 4 edges DB4's column dictionary mandates via COL-TBL028-10
 * but the REL model documents nowhere, same class of gap as DEV-DB6-010),
 * REL-107 (→ customer_owned_products, APP6-DB01)
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
 * GRD-007's exact-hash approval binding. The two physical dimensions are
 * frozen at send (`frz@sent`) and NOT NULL; placement is frozen at send too,
 * but since **APP6-DB01** it is one of two branches, not one quartet.
 *
 * **Two placement branches (ADR-APP6-001, `APP6-DB01`).** DB4's dictionary
 * marked the Catalog quartet (`product_id` through `embroidery_area_id`)
 * non-nullable, which made a customer-owned product (TBL-038, **never a SKU**,
 * INV-13) unrepresentable: a COP request holds none of the four, and a formal
 * version is mandatory on its approval path (`TR-LC11-09` is guarded by
 * `TR-LC08-04`). The four are therefore nullable now and a row carries
 * *exactly one* of:
 *
 * - the **complete** Catalog quartet, `customer_owned_product_id` NULL and both
 *   placement labels NULL — the pre-APP6 shape, bit-for-bit; or
 * - `customer_owned_product_id` with all four Catalog columns NULL and both
 *   `placement_*_label`s present — the COP branch.
 *
 * CST-129 rejects a mixed row, a **partial** quartet and a branchless row alike.
 * No Catalog identity is ever fabricated to satisfy persistence; that
 * fabrication is the failure ADR-APP6-001 exists to prevent.
 *
 * `placement_side_label`/`placement_area_label` (CST-130) exist only because
 * `approval_snapshots.side_name`/`area_name` and
 * `production_specifications.side_name`/`area_name` are NOT NULL downstream and
 * the COP branch has no FK to read them through — `customer_owned_products`
 * carries the *item*'s name and description, never the placement. They are
 * agreed with the customer, written when the formal version is authored, and
 * frozen with the geometry they describe. On a COP version
 * `physical_width_mm`/`physical_height_mm` are that version's authoritative
 * embroidery **placement envelope** — never copied from
 * `customer_owned_products`' own nullable item dimensions (ADR-APP6-001 §3.3).
 *
 * **CST-090** (reject-mutation once `status <> DRAFT`, except the legal state
 * advance + its own timestamp) landed in `0030_add_integrity_triggers.sql`. It
 * is an **exception list, not an allow list**: the trigger diffs every column of
 * `to_jsonb(OLD)` against `to_jsonb(NEW)` and rejects any change outside
 * `status`/`sent_at`/`approved_at`/`superseded_at`/`voided_at`/`void_reason`. The
 * three APP6-DB01 columns are therefore frozen at the same `TR-LC08-02` point as
 * the placement they belong to, with no trigger change — extending the argument
 * list would have *narrowed* the freeze, not widened it.
 *
 * `parent_version_id` is a self-referencing
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
import { customerOwnedProducts } from '../ordering/customer-owned-products';

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
    productId: idReference('product_id'),
    productVariantId: idReference('product_variant_id'),
    productSideId: idReference('product_side_id'),
    embroideryAreaId: idReference('embroidery_area_id'),
    customerOwnedProductId: idReference('customer_owned_product_id'),
    placementSideLabel: text('placement_side_label'),
    placementAreaLabel: text('placement_area_label'),
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
    // REL-107 (ADR-APP6-001 §3.2) — the customer-owned-product branch. `restrict`
    // matches every other edge on this table and `order_items`' own COP edge: a
    // formal version is evidence, and evidence never loses its subject.
    foreignKey({
      name: 'fk_design_versions__customer_owned_product_id',
      columns: [t.customerOwnedProductId],
      foreignColumns: [customerOwnedProducts.id],
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
    // CST-129 (ADR-APP6-001 §3.2/§4.1) — exactly one placement branch. Written as
    // two complete conjunctions rather than a `num_nonnulls(...) in (0, 4)` plus a
    // COP clause, because a **partial** Catalog quartet is as much the failure this
    // constraint exists for as a mixed one is: half a placement is not a stricter
    // record, it is an unanswerable one.
    check(
      'ck_design_versions__exactly_one_placement_branch',
      sql`(${t.productId} is not null and ${t.productVariantId} is not null and ${t.productSideId} is not null and ${t.embroideryAreaId} is not null and ${t.customerOwnedProductId} is null) or (${t.productId} is null and ${t.productVariantId} is null and ${t.productSideId} is null and ${t.embroideryAreaId} is null and ${t.customerOwnedProductId} is not null)`,
    ),
    // CST-130 (ADR-APP6-001 §3.7) — the placement labels are exactly the COP
    // branch's human evidence: required and nonblank there, absent on the Catalog
    // branch, where the four FKs already carry the identity the labels would
    // otherwise duplicate as unverifiable text.
    //
    // The two `is not null` tests are **not** redundant with `btrim(...) <> ''`.
    // A CHECK passes on NULL, and `btrim(null, …) <> ''` is NULL, not false — so
    // without them a COP row with a missing label evaluates to `false or NULL` =
    // NULL and is *accepted*. Three-valued logic, caught by the focused suite.
    //
    // `btrim` then carries the explicit character set, the `asset_derivatives`
    // rule: the bare form trims spaces only, so a tab-only label would satisfy a
    // "not blank" check that exists precisely to reject it.
    check(
      'ck_design_versions__cop_placement_labels',
      sql`(${t.customerOwnedProductId} is null and ${t.placementSideLabel} is null and ${t.placementAreaLabel} is null) or (${t.customerOwnedProductId} is not null and ${t.placementSideLabel} is not null and ${t.placementAreaLabel} is not null and btrim(${t.placementSideLabel}, E' \\t\\r\\n') <> '' and btrim(${t.placementAreaLabel}, E' \\t\\r\\n') <> '')`,
    ),
  ],
);
