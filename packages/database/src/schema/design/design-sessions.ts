/**
 * TBL-025 `design_sessions` — one temporary guest/customer editor session:
 * working document plus autosave marker (CTX-DSN, AGG-09, `temp`).
 *
 * Columns: COL-TBL025-01..10 (-02 ×4, -06 ×2) · Constraints: CST-001,
 * CST-019 (IDX-021), CST-060 (LC-07)
 * Relationships: REL-040 ×4 (→ catalog geometry), REL-041 (→ templates,
 * provenance) · Indexes: IDX-021 (constraint-created), IDX-085 (P0, the
 * table's ONLY non-unique index — autosave makes this the highest-write
 * business table, CC-01)
 * JSONB: payload #1 `design_document`, version key `document_schema_version`
 * Owner: Design module.
 *
 * **A session is not a customer** (ADR-DB2-001): it can exist before any
 * verified submission, carries no customer FK, and leaves no identity
 * residue — the whole family is hard-deleted after TTL. Identity is
 * `session_secret_hash` (hash only, never the secret; the raw session id is
 * never an authorization input on its own).
 *
 * `autosave_revision` is the optimistic marker (CC-01/GRD-027): the update
 * predicate is `id = $1 AND autosave_revision = $2`, the app increments it
 * atomically, a stale write conflicts instead of last-write-wins. DB8 owns
 * the concurrent-autosave race; no row lock per autosave.
 *
 * `template_id`/`template_version` are **clone provenance, no live link**
 * (REL-041/GRD-028): the document was copied at clone time, so template
 * publishes never touch sessions. `template_version` is an integer stamp —
 * deliberately not a version-row FK. `submitted_request_id` is handover
 * evidence; DB4 models **no REL row** for it, so it carries no FK (same
 * evidence class as the ledger's actor refs).
 *
 * The working document is mutable and therefore **not hashed** (JSONB map
 * #1: canonical hashing starts at the formal design version, G11). No hash
 * column is invented here.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { products } from '../catalog/products';
import { productVariants } from '../catalog/product-variants';
import { productSides } from '../catalog/product-sides';
import { embroideryAreas } from '../catalog/embroidery-areas';
import { designTemplates } from './design-templates';

/** LC-07. Canonical source — see DB5-A09. */
export const DESIGN_SESSION_STATES = ['ACTIVE', 'SUBMITTED', 'EXPIRED', 'DELETED'] as const;
export type DesignSessionState = (typeof DESIGN_SESSION_STATES)[number];

export const designSessions = pgTable(
  'design_sessions',
  {
    id: idColumn().notNull(),
    sessionSecretHash: text('session_secret_hash').notNull(),
    productId: idReference('product_id').notNull(),
    productVariantId: idReference('product_variant_id'),
    productSideId: idReference('product_side_id').notNull(),
    embroideryAreaId: idReference('embroidery_area_id').notNull(),
    designDocument: jsonb('design_document').notNull(),
    documentSchemaVersion: integer('document_schema_version').notNull(),
    autosaveRevision: integer('autosave_revision').notNull(),
    templateId: idReference('template_id'),
    templateVersion: integer('template_version'),
    status: stateColumn().notNull(),
    expiresAt: instant('expires_at').notNull(),
    lastActivityAt: instant('last_activity_at').notNull(),
    submittedRequestId: idReference('submitted_request_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_design_sessions', columns: [t.id] }),
    // CST-019 / IDX-021 — guest-capable session identity, hash only.
    unique('uq_design_sessions__session_secret_hash').on(t.sessionSecretHash),
    // REL-040 ×4 — catalog geometry; sessions are TTL-deleted, catalog rows
    // are archive-only, so restrict never blocks catalog lifecycle.
    foreignKey({
      name: 'fk_design_sessions__product_id',
      columns: [t.productId],
      foreignColumns: [products.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_sessions__product_variant_id',
      columns: [t.productVariantId],
      foreignColumns: [productVariants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_sessions__product_side_id',
      columns: [t.productSideId],
      foreignColumns: [productSides.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_design_sessions__embroidery_area_id',
      columns: [t.embroideryAreaId],
      foreignColumns: [embroideryAreas.id],
    }).onDelete('restrict'),
    // REL-041 — clone-origin provenance; templates are archive-only.
    foreignKey({
      name: 'fk_design_sessions__template_id',
      columns: [t.templateId],
      foreignColumns: [designTemplates.id],
    }).onDelete('restrict'),
    check('ck_design_sessions__status_allowed', stateCheck(t.status, DESIGN_SESSION_STATES)),
    // COL-TBL025-05 — monotonic from 0; monotonicity itself is the app/DB8
    // optimistic protocol, the floor is physical.
    check('ck_design_sessions__autosave_revision_non_negative', sql`${t.autosaveRevision} >= 0`),
    // IDX-085 / Q-25 — retention sweep over ACTIVE sessions only; `now()`
    // stays in the runtime query (DB5-A03).
    index('ix_design_sessions__last_activity_id__active')
      .on(t.lastActivityAt, t.id)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);
