/**
 * TBL-046 `order_cancellation_requests` — one manual-review cancellation
 * request (compensation stage ≥ S5, or an admin record) (CTX-ORD, AGG-15,
 * `proc (workflow)`).
 *
 * Columns: COL-TBL046-01..08 (-07 ×2, -08 ×2) · Constraints: CST-001,
 * CST-032 (IDX-034, one open review per order)
 * Relationships: REL-078 (→ orders, restrict), REL-080 ×2 (→
 * secure_access_grants, → contact_verification_challenges, nullable,
 * restrict — ≥S5 customer step-up evidence)
 * Indexes: IDX-034 (constraint-created)
 * Owner: Ordering module.
 *
 * **Not the cancellation saga itself** (LC-21): this table is the review
 * *record* GRD-020's stage matrix produces at stage S4–S8
 * (`DB3_CANCELLATION_COMPENSATION_SPEC.md` §3); the saga's own steps are
 * `order_transitions` `SAGA_STEP` rows. `grant_id`/`step_up_challenge_id`
 * are populated only when `initiator = 'CUSTOMER'` at stage ≥ S5
 * (ADR-DB3-004) — admin-initiated reviews carry neither.
 *
 * `decided_by_admin_id` is a **bare actor reference with no FK** (per
 * DEV-DB6-015, formalizing the same no-FK precedent as
 * `request_moderation_notes.admin_id`) — outside REL-105's enumeration for
 * this table.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { idColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';
import { orders } from './orders';
import { secureAccessGrants } from '../customer/secure-access-grants';
import { contactVerificationChallenges } from '../customer/contact-verification-challenges';

export const CANCELLATION_STAGES = ['S4', 'S5', 'S6', 'S7', 'S8'] as const;
export type CancellationStage = (typeof CANCELLATION_STAGES)[number];

export const CANCELLATION_INITIATORS = ['CUSTOMER', 'ADMIN'] as const;
export type CancellationInitiator = (typeof CANCELLATION_INITIATORS)[number];

export const CANCELLATION_REQUEST_STATES = ['PENDING', 'APPROVED', 'DENIED'] as const;
export type CancellationRequestState = (typeof CANCELLATION_REQUEST_STATES)[number];

export const orderCancellationRequests = pgTable(
  'order_cancellation_requests',
  {
    id: idColumn().notNull(),
    orderId: idReference('order_id').notNull(),
    stage: text('stage').notNull(),
    initiator: text('initiator').notNull(),
    status: stateColumn().notNull(),
    reason: text('reason').notNull(),
    customerVisibleReason: text('customer_visible_reason'),
    grantId: idReference('grant_id'),
    stepUpChallengeId: idReference('step_up_challenge_id'),
    decidedByAdminId: idReference('decided_by_admin_id'),
    decidedAt: instant('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_order_cancellation_requests', columns: [t.id] }),
    // CST-032 / IDX-034 — at most one open review per order.
    uniqueIndex('uq_order_cancellation_requests__order__pending')
      .on(t.orderId)
      .where(sql`${t.status} = 'PENDING'`),
    // REL-078 — the review record is composed under its order.
    foreignKey({
      name: 'fk_order_cancellation_requests__order_id',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    // REL-080 — customer-initiated step-up evidence (≥S5); purpose/scope TX/App.
    foreignKey({
      name: 'fk_order_cancellation_requests__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_order_cancellation_requests__step_up_challenge_id',
      columns: [t.stepUpChallengeId],
      foreignColumns: [contactVerificationChallenges.id],
    }).onDelete('restrict'),
    check(
      'ck_order_cancellation_requests__stage_allowed',
      stateCheck(t.stage, CANCELLATION_STAGES),
    ),
    check(
      'ck_order_cancellation_requests__initiator_allowed',
      stateCheck(t.initiator, CANCELLATION_INITIATORS),
    ),
    check(
      'ck_order_cancellation_requests__status_allowed',
      stateCheck(t.status, CANCELLATION_REQUEST_STATES),
    ),
    // ADR-DB3-004's ≥S5 customer step-up evidence requirement and the S1-S9
    // stage/initiator combination rules are cross-fact business logic, same
    // tier as the DB3 transition matrix — TX/App and DB7's matrix tests, not
    // a same-row CHECK (no CST ID cites this as a database-level guard).
  ],
);
