/**
 * TBL-074 `idempotency_records` — one idempotent-operation claim/result per
 * (namespace, scope key) (CTX-PLT).
 *
 * Columns: COL-TBL074-01..07 · Constraints: CST-001, CST-048, CST-060
 * Indexes: IDX-058 (arbiter), IDX-093/094 (sweeps, slice S25)
 * JSONB: payload #5 `result`
 * Owner: Platform module.
 *
 * **CST-048 is the double-execution arbiter (INV-19/24).** The unique
 * constraint on `(operation_namespace, scope_key)` is what makes a retried
 * operation a no-op instead of a second execution: the second claim loses on
 * insert with SQLSTATE 23505 rather than racing on a read-then-write check.
 * Losing this constraint does not degrade performance — it duplicates orders
 * and payments.
 *
 * `fingerprint` is a canonical hash of the business payload (GRD-030): a
 * replay carrying *different* content under the same scope key is a caller
 * error, not an idempotent retry, and is detectable by comparing it.
 *
 * Operational metadata is mutable by design (DB5-A10): `status`, `result`,
 * `expires_at`, `claimed_at`, `completed_at` all change as the claim
 * progresses. No immutability trigger belongs on this table.
 */
import { check, jsonb, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';

import { sequenceColumn } from '../../primitives/identifiers';
import { createdAt, instant, updatedAt } from '../../primitives/temporal';
import { stateCheck, stateColumn } from '../../primitives/lifecycle-state';

/** LC-23. Canonical source — see DB5-A09. */
export const IDEMPOTENCY_RECORD_STATES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type IdempotencyRecordState = (typeof IDEMPOTENCY_RECORD_STATES)[number];

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: sequenceColumn(),
    operationNamespace: text('operation_namespace').notNull(),
    scopeKey: text('scope_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: stateColumn().notNull(),
    result: jsonb('result'),
    expiresAt: instant('expires_at').notNull(),
    claimedAt: instant('claimed_at').notNull(),
    completedAt: instant('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_idempotency_records', columns: [t.id] }),
    // CST-048 / IDX-058 — the arbiter. INV-19/24, D7-08/D8-25.
    unique('uq_idempotency_records__namespace_scope_key').on(t.operationNamespace, t.scopeKey),
    check(
      'ck_idempotency_records__status_allowed',
      stateCheck(t.status, IDEMPOTENCY_RECORD_STATES),
    ),
  ],
);
