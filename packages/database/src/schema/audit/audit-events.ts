/**
 * TBL-072 `audit_events` — one durable, append-only record of a
 * security/business-significant action: actor, action, justified
 * polymorphic target, reason, redacted summary, correlation id
 * (CTX-AUD, `append` — REQ-AUDIT-001..003, INV-14, ADR-DB4-002 audit class).
 *
 * Columns: COL-TBL072-01..09 (-03 ×4, -05 ×2) · Constraints: CST-001,
 * CST-072 (CK, actor_kind ↔ matching actor-ref exclusivity), CST-080
 * (blanket NN — `correlation_id`), CST-098 (append-only, S24 trigger target)
 * Relationships: REL-105 (TBL-072 subset ×3 — admin_id → admin_accounts,
 * customer_id → customers, grant_id → secure_access_grants, all restrict,
 * all real physical FKs); REL-103 (→ (target_kind, target_id), justified
 * cross-cutting polymorphic target, no physical FK by design)
 * Indexes: IDX-095 (P0 required — target timeline), IDX-096 (P0 required —
 * global timeline); IDX-097/098 recommended, deferred to S25
 * JSONB: boundary #7 `summary`, fixed internal shape, no discriminator, no
 * GIN (ADR-DB4-004 #7)
 * Owner: Audit module.
 *
 * Audit Event is historical evidence, not a mutable lifecycle root, not an
 * Outbox Event, not a domain transition row and not a generic application
 * log — it is written by the application in the owning use-case's own
 * transaction (SE-019); no trigger auto-mirrors any table into this one.
 * `system_job_key` is bare value evidence (no target table exists for a job
 * key), independent of `grant_id`, which — same as the sibling REL-105
 * tables (`custom_request_transitions`, `order_transitions`) — is the grant
 * an action was authorized under and may coexist with any `actor_kind`, so
 * CST-072 only matches `actor_kind` against `admin_id`/`customer_id`/
 * `system_job_key`, never against `grant_id`. `actor_kind` itself carries no
 * DB4 dictionary closed set, so no CHECK closes its domain (same treatment
 * as `actor_kind` on the sibling transition tables) — CST-072 only enforces
 * the *matching-ref* implication, both directions, for the three known
 * kinds; an unrecognized `actor_kind` value simply requires all three refs
 * NULL. `target_kind`/`target_id` are text, no FK (REL-103 justified
 * exception — the composite index IDX-095 is the only access path);
 * `action` and `target_kind` are open per DB4 (no CHECK invented). `summary`
 * stores only redacted before/after facts per §18 policy — never a
 * secret, full payload, or before/after object dump; all queryable facts
 * (actor/action/target/reason/correlation/time) are relational columns, not
 * JSONB. No UPDATE/DELETE-rejection trigger exists yet — CST-098 lists this
 * table; S24 implements the trigger.
 */
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { sequenceColumn, idReference } from '../../primitives/identifiers';
import { createdAt, instant } from '../../primitives/temporal';
import { adminAccounts } from '../identity/admin-accounts';
import { customers } from '../customer/customers';
import { secureAccessGrants } from '../customer/secure-access-grants';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: sequenceColumn(),
    occurredAt: instant('occurred_at').notNull(),
    actorKind: text('actor_kind').notNull(),
    adminId: idReference('admin_id'),
    customerId: idReference('customer_id'),
    grantId: idReference('grant_id'),
    systemJobKey: text('system_job_key'),
    action: text('action').notNull(),
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    summary: jsonb('summary'),
    failureCode: text('failure_code'),
    correlationId: text('correlation_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_audit_events', columns: [t.id] }),
    // REL-105 (TBL-072 subset) — actor evidence FKs; audit_events is one of
    // REL-105's four explicitly enumerated tables (DEV-DB6-015).
    foreignKey({
      name: 'fk_audit_events__admin_id',
      columns: [t.adminId],
      foreignColumns: [adminAccounts.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_audit_events__customer_id',
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'fk_audit_events__grant_id',
      columns: [t.grantId],
      foreignColumns: [secureAccessGrants.id],
    }).onDelete('restrict'),
    // CST-072 — actor_kind matches exactly one of admin_id/customer_id/
    // system_job_key, both directions; grant_id is independent evidence.
    check(
      'ck_audit_events__actor_kind_ref_match',
      sql`(${t.actorKind} <> 'ADMIN' or ${t.adminId} is not null)
        and (${t.actorKind} <> 'CUSTOMER' or ${t.customerId} is not null)
        and (${t.actorKind} <> 'SYSTEM' or ${t.systemJobKey} is not null)
        and (${t.actorKind} = 'ADMIN' or ${t.adminId} is null)
        and (${t.actorKind} = 'CUSTOMER' or ${t.customerId} is null)
        and (${t.actorKind} = 'SYSTEM' or ${t.systemJobKey} is null)`,
    ),
    // IDX-095 — target-history timeline (REL-103's only access path).
    index('ix_audit_events__target__occurred__id').on(
      t.targetKind,
      t.targetId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    // IDX-096 — global audit timeline.
    index('ix_audit_events__occurred__id').on(t.occurredAt.desc(), t.id.desc()),
  ],
);
