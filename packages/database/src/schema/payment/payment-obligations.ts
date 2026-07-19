/**
 * TBL-054 `payment_obligations` — one independent payment obligation
 * (DEPOSIT or REMAINING) of an order (CTX-PAY, AGG-16, `root`, mutable).
 *
 * Columns: COL-TBL054-01..09 · Constraints: CST-001, CST-039 (IDX-042, one
 * live obligation per (order, kind) among PENDING/SATISFIED — INV-04),
 * CST-063 instance (amount > 0), CST-068 (currency 'VND')
 * Relationships: REL-081 (→ orders, restrict — INV-04), REL-082 (→
 * quotation_versions, restrict — amount derivation evidence), REL-083 (→
 * payment_obligations self, superseded_by, restrict; → payment_attempts,
 * satisfied_by — **added by custom SQL in this group's migration**, same
 * header↔child cycle class as REL-044/0016, REL-098/0019 and REL-068/0022:
 * `payment_attempts.payment_obligation_id` → `payment_obligations` already
 * lives in `payment-attempts.ts`, so declaring the reverse pointer here too
 * would need a circular module import)
 * Indexes: IDX-042 (constraint-created), IDX-075 (P0 required — order-scoped
 * lookup)
 * Owner: Payment module.
 *
 * **Deposit/Remaining, never a fake boolean.** Two independently-tracked
 * obligation rows per order cover the 40/60-style split (INV-04); there is
 * no `deposit_paid`/`fully_paid` column anywhere in this group — "fully
 * paid" is derived (both obligations SATISFIED), never stored (LC-15).
 * `satisfied_by_attempt_id` is exactly-once application evidence (CC-10);
 * the race that decides *which* attempt wins is a callback-transaction
 * concern (DB8), not a database-level guard beyond the FK's existence.
 * `superseded_by_obligation_id` is the recalculation chain pointer
 * (ADR-DB3-003 r7) — same-chain consistency of a repoint is TX/App, not a
 * database-level guard, same tier as `orders.current_approval_snapshot_id`.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { orders } from '../ordering/orders';
import { quotationVersions } from '../quotation/quotation-versions';

/** COL-TBL054-02 closed kind set (DB4). */
export const PAYMENT_OBLIGATION_KINDS = ['DEPOSIT', 'REMAINING'] as const;
export type PaymentObligationKind = (typeof PAYMENT_OBLIGATION_KINDS)[number];

/** LC-15. Canonical source — see DB5-A09. */
export const PAYMENT_OBLIGATION_STATES = [
  'PENDING',
  'SATISFIED',
  'CANCELLED',
  'SUPERSEDED',
] as const;
export type PaymentObligationState = (typeof PAYMENT_OBLIGATION_STATES)[number];

export const paymentObligations = pgTable(
  'payment_obligations',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    kind: text('kind').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    status: stateColumn().notNull(),
    satisfiedAt: instant('satisfied_at'),
    satisfiedByAttemptId: idReference('satisfied_by_attempt_id'),
    supersededByObligationId: idReference('superseded_by_obligation_id'),
    sourceQuotationVersionId: idReference('source_quotation_version_id').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_payment_obligations', columns: [t.id] }),
    // CST-039 / IDX-042 — one live obligation per (order, kind) — INV-04.
    uniqueIndex('uq_payment_obligations__order_kind__live')
      .on(t.orderId, t.kind)
      .where(sql`${t.status} in ('PENDING', 'SATISFIED')`),
    // REL-081 — the order this obligation belongs to.
    foreignKey({
      name: 'fk_payment_obligations__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-082 — amount derivation evidence (snapshot boundary).
    foreignKey({
      name: 'fk_payment_obligations__source_quotation_version_id',
      columns: [t.sourceQuotationVersionId],
      foreignColumns: [quotationVersions.id],
    }).onDelete('restrict'),
    // REL-083 — recalculation chain (self-referencing, nullable).
    foreignKey({
      name: 'fk_payment_obligations__superseded_by_obligation_id',
      columns: [t.supersededByObligationId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    // REL-083 — satisfied_by_attempt_id FK added by custom SQL — see this
    // group's migration (circular-import cycle with payment-attempts.ts
    // otherwise).
    check('ck_payment_obligations__kind_allowed', stateCheck(t.kind, PAYMENT_OBLIGATION_KINDS)),
    check(
      'ck_payment_obligations__status_allowed',
      stateCheck(t.status, PAYMENT_OBLIGATION_STATES),
    ),
    // CST-063 — obligations amounts are strictly positive.
    check('ck_payment_obligations__amount_positive', sql`${t.amount} > 0`),
    check('ck_payment_obligations__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // COL-TBL054-06/07 — set exactly once on satisfaction (CC-10 race is TX/App).
    check(
      'ck_payment_obligations__satisfied_evidence_required',
      sql`${t.status} <> 'SATISFIED' or (${t.satisfiedAt} is not null and ${t.satisfiedByAttemptId} is not null)`,
    ),
    // IDX-075 — order-scoped obligation lookup.
    index('ix_payment_obligations__order_id').on(t.orderId),
  ],
);
