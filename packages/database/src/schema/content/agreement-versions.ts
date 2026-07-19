/**
 * TBL-069 `agreement_versions` — one immutable-once-published agreement
 * version: content + hash (CTX-CNT, AGG-21, `ver`).
 *
 * Columns: COL-TBL069-01..09 · Constraints: CST-001, CST-045 (IDX-055),
 * CST-060 (LC-+3), CST-070 instance (hash format), CST-096
 * (**append/immutable trigger candidate, S24** — same treatment as
 * CST-090/`design_versions`)
 * Relationships: REL-097 (→ agreements, restrict — immutable once
 * published so premature deletion is structurally impossible), REL-098
 * (deferred reverse pointer `agreements.current_version_id` — resolved by
 * custom SQL in this group's migration)
 * Indexes: IDX-055 (constraint-created), IDX-108 (P0, effective-version
 * resolution — QX-07)
 * Owner: Content module.
 *
 * `EFFECTIVE` is **derived, never stored** (COL-TBL069-03) — PUBLISHED +
 * `effective_from` window + not superseded/withdrawn, resolved by IDX-108
 * inside the approval transaction (GRD-008), never a stored state.
 *
 * `content_hash` follows the same `sha256:<64 hex>` format as
 * `assets.checksum`/`design_versions.document_hash` (CST-070) and is
 * required once the row leaves DRAFT (mirrors CST-074's shape) — an
 * unhashed published term would break GRD-008's exact-hash accept binding.
 *
 * **CST-096 (reject-mutation once PUBLISHED except the legal state advance
 * + its own timestamp) is not yet a database mechanism** — S24 owns the
 * trigger; this group implements the CHECK/FK/index layer only.
 *
 * **CST-046** (at most one effective PUBLISHED version per agreement) is a
 * documented **conditional, not-built** exclusion candidate: DB5
 * explicitly defers it — the publish transaction is the primary defense,
 * and adopting the exclusion constraint would require the `btree_gist`
 * extension for a handful of rows. Not fabricated here.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { agreements } from './agreements';

/** LC-+3 (DB3 handoff §1: Agreement Version). EFFECTIVE is derived, never stored. */
export const AGREEMENT_VERSION_STATES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN'] as const;
export type AgreementVersionState = (typeof AGREEMENT_VERSION_STATES)[number];

export const agreementVersions = pgTable(
  'agreement_versions',
  {
    id: idColumn().notNull(),
    agreementId: idReference('agreement_id').notNull(),
    version: integer('version').notNull(),
    status: stateColumn().notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash'),
    language: text('language').notNull(),
    effectiveFrom: instant('effective_from'),
    publishedAt: instant('published_at'),
    supersededAt: instant('superseded_at'),
    withdrawnAt: instant('withdrawn_at'),
    withdrawReason: text('withdraw_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_agreement_versions', columns: [t.id] }),
    // CST-045 / IDX-055 — version numbers never reused within an agreement.
    unique('uq_agreement_versions__agreement_version').on(t.agreementId, t.version),
    // REL-097 — versions are never deleted while their agreement exists.
    foreignKey({
      name: 'fk_agreement_versions__agreement_id',
      columns: [t.agreementId],
      foreignColumns: [agreements.id],
    }).onDelete('restrict'),
    check('ck_agreement_versions__status_allowed', stateCheck(t.status, AGREEMENT_VERSION_STATES)),
    // CST-070 instance — same format as assets.checksum/design_versions.document_hash.
    check(
      'ck_agreement_versions__content_hash_format',
      sql`${t.contentHash} is null or ${t.contentHash} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    // An unhashed published term would break GRD-008's exact-hash binding.
    check(
      'ck_agreement_versions__content_hash_required_once_published',
      sql`${t.status} = 'DRAFT' or ${t.contentHash} is not null`,
    ),
    // COL-TBL069-07 — required at publish (frz@publish).
    check(
      'ck_agreement_versions__effective_from_required_once_published',
      sql`${t.status} = 'DRAFT' or ${t.effectiveFrom} is not null`,
    ),
    // [R] on withdraw — evidence for why an effective term was pulled.
    check(
      'ck_agreement_versions__withdraw_reason_required',
      sql`${t.status} <> 'WITHDRAWN' or ${t.withdrawReason} is not null`,
    ),
    // IDX-108 / QX-07 — GRD-008 effective-version resolution inside the
    // approval transaction; equality leads, newest candidate first, the
    // predicate structurally excludes DRAFT/SUPERSEDED/WITHDRAWN.
    index('ix_agreement_versions__agreement_effective_id__published')
      .on(t.agreementId, t.effectiveFrom.desc(), t.id.desc())
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);
