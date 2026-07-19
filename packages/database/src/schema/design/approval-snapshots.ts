/**
 * TBL-031 `approval_snapshots` — the immutable approval evidence of one
 * design version: exact version ref + hashes + placement + frozen display
 * copies + dimensions + quantity + frozen contact snapshot + secure-flow
 * evidence (CTX-DSN, AGG-11, `snap`).
 *
 * Columns: COL-TBL031-01..11 (-02 ×3, -05 ×4, -06 ×4, -07 ×2, -09 ×3,
 * -10 ×2) · Constraints: CST-001, CST-023 (IDX-025, one approval per
 * version), CST-066 instance (dims > 0), CST-070 ×2 (hash format), CST-091
 * (**full reject-mutation trigger candidate, S24** — stronger than
 * CST-090/096: there is no status column here to except, per LC-10
 * exists-or-not)
 * Relationships: REL-051 (→ design_versions, restrict), REL-052 ×3
 * (→ design_cases, → custom_requests, → customers, restrict), REL-053 ×2
 * (→ secure_access_grants, → contact_verification_challenges, restrict),
 * placement refs `product_id`/`product_variant_id`/`product_side_id`/
 * `embroidery_area_id` (**DEV-DB6-013** — 4 edges DB4's column dictionary
 * mandates via COL-TBL031-05 and `DB4_COMPLETENESS_MATRIX.md` CON-058..060
 * name TBL-031 explicitly, but the REL model documents nowhere — same class
 * of gap as DEV-DB6-012/`design_versions`)
 * Indexes: IDX-025 (constraint-created); IDX-136 (recommended, on
 * `custom_request_id`) → S25, same deferral pattern as IDX-116
 * Owner: Design module.
 *
 * **LC-10 exists-or-not** (DB4 state model): this table has no status
 * column at all — the row's existence *is* the state. Once inserted it is
 * never mutated or deleted (CST-091, INV-01/03) except by the future S24
 * trigger's own enforcement; there is no legal "status advance" exception
 * the way `design_versions`/`agreement_versions` have, because there is no
 * status to advance.
 *
 * `product_name`/`variant_label`/`side_name`/`area_name` (COL-TBL031-06)
 * and `contact_name`/`contact_email`/`contact_phone` (COL-TBL031-09, [PII])
 * are **frozen display/value copies** (Class F, INV-12/CON-018) — display
 * text and contact facts as they existed at approval time, never FKs and
 * never re-derived from the live `products`/`customers` rows. Redaction of
 * the contact copy is only via the break-glass privacy procedure, not a
 * normal UPDATE path (CST-091 blocks that anyway once S24 lands).
 *
 * `grant_id`/`step_up_challenge_id` (REL-053, INV-20, GRD-002/003) are
 * plain evidence FKs — no raw token/OTP/hash is ever copied here; purpose/
 * scope validation of the grant is the approval transaction's TX/App
 * concern (GRD-002/003), not a schema-level guarantee.
 *
 * **CST-091 is not yet a database mechanism** — S24 owns the trigger; this
 * group implements the CHECK/FK/index layer only, same honestly-documented
 * gap as CST-090/096.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { designVersions } from './design-versions';
import { designCases } from './design-cases';
import { customRequests } from '../ordering/custom-requests';
import { customers } from '../customer/customers';
import { products } from '../catalog/products';
import { productVariants } from '../catalog/product-variants';
import { productSides } from '../catalog/product-sides';
import { embroideryAreas } from '../catalog/embroidery-areas';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

export const approvalSnapshots = pgTable(
  'approval_snapshots',
  {
    id: idColumn().notNull(),
    designVersionId: idReference('design_version_id').notNull(),
    designCaseId: idReference('design_case_id').notNull(),
    customRequestId: idReference('custom_request_id').notNull(),
    customerId: idReference('customer_id').notNull(),
    documentHash: text('document_hash').notNull(),
    previewHash: text('preview_hash'),
    productId: idReference('product_id').notNull(),
    productVariantId: idReference('product_variant_id').notNull(),
    productSideId: idReference('product_side_id').notNull(),
    embroideryAreaId: idReference('embroidery_area_id').notNull(),
    productName: text('product_name').notNull(),
    variantLabel: text('variant_label'),
    sideName: text('side_name').notNull(),
    areaName: text('area_name').notNull(),
    physicalWidthMm: numeric('physical_width_mm').notNull(),
    physicalHeightMm: numeric('physical_height_mm').notNull(),
    quantityTotal: integer('quantity_total').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    grantId: idReference('grant_id').notNull(),
    stepUpChallengeId: idReference('step_up_challenge_id').notNull(),
    approvedAt: instant('approved_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_approval_snapshots', columns: [t.id] }),
    // CST-023 / IDX-025 — one approval per design version (INV-01/03).
    unique('uq_approval_snapshots__version').on(t.designVersionId),
    foreignKey({
      name: 'fk_approval_snapshots__design_version_id',
      columns: [t.designVersionId],
      foreignColumns: [designVersions.id],
    }).onDelete('restrict'),
    // REL-052 — snapshot anchors (case/request/customer), frozen at creation.
    foreignKey({
      name: 'fk_approval_snapshots__design_case_id',
      columns: [t.designCaseId],
      foreignColumns: [designCases.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // DEV-DB6-013 — placement refs frozen at approval (COL-TBL031-05, no REL row).
    foreignKey({
      name: 'fk_approval_snapshots__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__product_side_id',
      columns: [t.productSideId],
      foreignColumns: [productSides.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__embroidery_area_id',
      columns: [t.embroideryAreaId],
      foreignColumns: [embroideryAreas.id],
    }).onDelete('restrict'),
    // REL-053 — secure-flow evidence (INV-20); purpose/scope stays TX/App.
    foreignKey({
      name: 'fk_approval_snapshots__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_approval_snapshots__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    // COL-TBL031-07 — physical dimensions are always positive (NOT NULL).
    check(
      'ck_approval_snapshots__physical_mm_positive',
      sql`${t.physicalWidthMm} > 0 and ${t.physicalHeightMm} > 0`,
    ),
    // COL-TBL031-08 — a snapshot never freezes a non-positive quantity.
    check('ck_approval_snapshots__quantity_positive', sql`${t.quantityTotal} > 0`),
    // CST-070 instances — same format as assets.checksum/design_versions.document_hash.
    check(
      'ck_approval_snapshots__document_hash_format',
      sql`${t.documentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      'ck_approval_snapshots__preview_hash_format',
      sql`${t.previewHash} is null or ${t.previewHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
  ],
);
