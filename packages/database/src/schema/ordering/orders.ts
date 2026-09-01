/**
 * TBL-043 `orders` — the authoritative fulfillment machine of one accepted
 * quotation (CTX-ORD, AGG-15, `root`/mutable).
 *
 * Columns: COL-TBL043-01..11 (-10 ×2, -11 ×2) · Constraints: CST-001,
 * CST-030 (IDX-032, request→order unique, INV-19/GRD-009), CST-113 (TX
 * order-creation gate)
 * Relationships: REL-071 (→ custom_requests, 1–1, restrict), REL-072
 * (→ customers, restrict), REL-073 (→ quotation_versions accepted,
 * restrict), REL-074 (→ approval_snapshots current pointer, restrict —
 * audited pointer move)
 * Indexes: IDX-031 (constraint-created, code), IDX-032 (constraint-created,
 * request), IDX-074 (P0 required — admin queue), IDX-104 (P0 required —
 * CANCELLING lookup); IDX-118 (recommended) → S25
 * Owner: Ordering module.
 *
 * **Not a Quotation and not a Payment ledger.** An Order exists only after
 * GRD-009's gate (approval exists + the accepted quotation version's
 * acceptance evidence + no prior order for this request) — that gate is
 * TX/App plus this table's own CST-030 unique backstop; no trigger creates
 * an Order from a Quotation acceptance.
 *
 * `accepted_quotation_version_id` is a frozen commercial-basis reference —
 * never `quotations.current_version_id` (a mutable pointer, not historical
 * authority per the DB6-C4/G12/G13/G14 current-pointer finding).
 *
 * `current_approval_snapshot_id` is an **audited pointer** (ADR-DB3-003 r4):
 * NOT NULL from creation, but may be repointed on a post-approval revision;
 * every move is recorded as an `order_transitions` `POINTER_MOVE` row
 * (history), never overwritten silently. Existence of the pointed-to
 * snapshot is a physical FK; that the snapshot's own case/request chain
 * still matches this order is TX/App (same tier as every other current-
 * pointer finding in this engagement) — no composite FK invented here.
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
  unique,
} from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { currencyScaleCheck } from '../../primitives/money';
import { customRequests } from './custom-requests';
import { customers } from '../customer/customers';
import { quotationVersions } from '../quotation/quotation-versions';
import { approvalSnapshots } from '../design/approval-snapshots';

/**
 * COL-TBL043-12 closed origin set (APP12-P01, APP12-DB01).
 *
 * The discriminator that decides which of the two order shapes a row is. It is
 * immutable after insert (`tg_orders__origin_immutable`): every origin-aware
 * rule below and in `order_items`/`payment_obligations` is evaluated against
 * it, and a mutable discriminator would let a committed row change what its
 * children were validated against.
 */
export const ORDER_ORIGINS = ['CUSTOM', 'READY_MADE'] as const;
export type OrderOrigin = (typeof ORDER_ORIGINS)[number];

/**
 * LC-14 — the custom-embroidery lifecycle, unchanged since DB3.
 *
 * These eleven remain the *only* states a `CUSTOM` order may hold; APP12-DB01
 * widened the column's global vocabulary without widening this set, and
 * `ck_orders__origin_status_allowed` enforces the difference.
 */
export const CUSTOM_ORDER_STATES = [
  'AWAITING_DEPOSIT',
  'DEPOSIT_PAID',
  'IN_PRODUCTION',
  'PRODUCTION_COMPLETED',
  'AWAITING_FINAL_PAYMENT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLING',
  'CANCELLED',
] as const;
export type CustomOrderState = (typeof CUSTOM_ORDER_STATES)[number];

/**
 * The Ready-Made lifecycle (APP12-P01 §Ready-Made, consumed not reopened).
 *
 * `AWAITING_SHIPPING_FEE → AWAITING_PAYMENT → READY_FOR_DELIVERY → DELIVERED →
 * COMPLETED`, plus the three shared exception states. There is no
 * `AWAITING_DEPOSIT`, no production state and no `AWAITING_FINAL_PAYMENT`:
 * a Ready-Made order is paid once, in full, and nothing is manufactured for it.
 * There is deliberately no `PAID` state — satisfaction is the obligation's
 * fact (LC-15), never a second copy on the order.
 */
export const READY_MADE_ORDER_STATES = [
  'AWAITING_SHIPPING_FEE',
  'AWAITING_PAYMENT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLING',
  'CANCELLED',
] as const;
export type ReadyMadeOrderState = (typeof READY_MADE_ORDER_STATES)[number];

/**
 * The full `orders.status` vocabulary — the union of both lifecycles.
 *
 * This is the *column* vocabulary (`ck_orders__status_allowed`), not a
 * lifecycle: no order may hold all thirteen. The custom eleven lead, in their
 * original DB3 order, so every consumer that published this tuple keeps the
 * exact enum it published before APP12-DB01.
 */
export const ORDER_STATES = [
  ...CUSTOM_ORDER_STATES,
  'AWAITING_SHIPPING_FEE',
  'AWAITING_PAYMENT',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const orders = pgTable(
  'orders',
  {
    id: idColumn().notNull(),
    code: text('code').notNull(),
    origin: text('origin').notNull(),
    customRequestId: idReference('custom_request_id'),
    customerId: idReference('customer_id').notNull(),
    acceptedQuotationVersionId: idReference('accepted_quotation_version_id'),
    currentApprovalSnapshotId: idReference('current_approval_snapshot_id'),
    status: stateColumn().notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    holdReason: text('hold_reason'),
    cancelledReason: text('cancelled_reason'),
    cancelledCustomerReason: text('cancelled_customer_reason'),
    deliveredAt: instant('delivered_at'),
    completedAt: instant('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_orders', columns: [t.id] }),
    // CST-030 / IDX-032 — one order per request (INV-19, GRD-009 backstop).
    unique('uq_orders__request').on(t.customRequestId),
    // IDX-031 — stable human-facing order code.
    unique('uq_orders__code').on(t.code),
    // REL-071 — the fulfillment record must outlive its originating request.
    foreignKey({
      name: 'fk_orders__custom_request_id',
      columns: [t.customRequestId],
      foreignColumns: [customRequests.id],
    }).onDelete('restrict'),
    // REL-072
    foreignKey({
      name: 'fk_orders__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    // REL-073 — frozen commercial basis; never the mutable current pointer.
    foreignKey({
      name: 'fk_orders__accepted_quotation_version_id',
      columns: [t.acceptedQuotationVersionId],
      foreignColumns: [quotationVersions.id],
    }).onDelete('restrict'),
    // REL-074 — audited pointer; existence is physical, same-case chain is TX/App.
    foreignKey({
      name: 'fk_orders__current_approval_snapshot_id',
      columns: [t.currentApprovalSnapshotId],
      foreignColumns: [approvalSnapshots.id],
    }).onDelete('restrict'),
    check('ck_orders__origin_allowed', stateCheck(t.origin, ORDER_ORIGINS)),
    check('ck_orders__status_allowed', stateCheck(t.status, ORDER_STATES)),
    // APP12-DB01 — the custom chain is required by CUSTOM and forbidden to
    // READY_MADE. Nullability alone would let a Ready-Made row carry a
    // fabricated request/quotation/approval, and would let a custom order lose
    // the commercial basis DB3 made NOT NULL; this restores both halves.
    check(
      'ck_orders__custom_chain_by_origin',
      sql`(${t.origin} = 'CUSTOM' and ${t.customRequestId} is not null and ${t.acceptedQuotationVersionId} is not null and ${t.currentApprovalSnapshotId} is not null) or (${t.origin} = 'READY_MADE' and ${t.customRequestId} is null and ${t.acceptedQuotationVersionId} is null and ${t.currentApprovalSnapshotId} is null)`,
    ),
    // APP12-DB01 — origin-aware status truth. The global allowlist above is the
    // union of two lifecycles; this is the one that says a CUSTOM order may
    // never reach AWAITING_SHIPPING_FEE/AWAITING_PAYMENT and a READY_MADE order
    // may never reach a deposit, production or final-payment state.
    check(
      'ck_orders__origin_status_allowed',
      sql`(${t.origin} = 'CUSTOM' and ${stateCheck(t.status, CUSTOM_ORDER_STATES)}) or (${t.origin} = 'READY_MADE' and ${stateCheck(t.status, READY_MADE_ORDER_STATES)})`,
    ),
    check('ck_orders__total_non_negative', sql`${t.totalAmount} >= 0`),
    check('ck_orders__currency_vnd', sql`${t.currencyCode} = 'VND'`),
    // DB6-C5 (B2) — VND has no minor unit (DEV-DB6-005).
    check('ck_orders__total_currency_scale', currencyScaleCheck(t.totalAmount, t.currencyCode)),
    // [R] on ON_HOLD — evidence for why the fulfillment machine paused.
    check(
      'ck_orders__hold_reason_required',
      sql`${t.status} <> 'ON_HOLD' or ${t.holdReason} is not null`,
    ),
    // [R] on the terminal CANCELLED state — evidence for why it never completed.
    check(
      'ck_orders__cancelled_reason_required',
      sql`${t.status} <> 'CANCELLED' or ${t.cancelledReason} is not null`,
    ),
    // IDX-074 / Q-.. — admin queue: equality on status leads, sort matches direction.
    index('ix_orders__status_created_id').on(t.status, t.createdAt.desc(), t.id.desc()),
    // IDX-104 — CANCELLING saga resume lookup, structurally excludes every other state.
    index('ix_orders__id__cancelling')
      .on(t.id)
      .where(sql`${t.status} = 'CANCELLING'`),
  ],
);
