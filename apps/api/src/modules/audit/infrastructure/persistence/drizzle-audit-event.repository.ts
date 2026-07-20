/**
 * Drizzle implementation of the Audit Event contract (TBL-072).
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, desc, eq } from 'drizzle-orm';

import type {
  AppendAuditEventInput,
  AuditActor,
  AuditEvent,
  AuditEventRepository,
  AuditTargetKind,
} from '../../domain/repositories/audit-event.repository';
import { AUDIT_TARGET_KINDS } from '../../domain/repositories/audit-event.repository';

const { auditEvents } = schema;

type EventRow = typeof auditEvents.$inferSelect;

function toEvent(row: EventRow): AuditEvent {
  return {
    action: row.action,
    targetKind: row.targetKind as AuditTargetKind,
    targetId: row.targetId,
    actorKind: row.actorKind,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt,
  };
}

/** Mirrors `ck_audit_events__actor_kind_ref_match`: exactly one reference per kind. */
function actorColumns(actor: AuditActor) {
  switch (actor.kind) {
    case 'ADMIN':
      return { actorKind: 'ADMIN', adminId: actor.adminId };
    case 'CUSTOMER':
      return {
        actorKind: 'CUSTOMER',
        customerId: actor.customerId,
        grantId: actor.grantId ?? null,
      };
    case 'SYSTEM':
      return { actorKind: 'SYSTEM', systemJobKey: actor.systemJobKey };
  }
}

@Injectable()
export class DrizzleAuditEventRepository extends DrizzleRepository implements AuditEventRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async append(input: AppendAuditEventInput): Promise<void> {
    return this.run('append', async () => {
      // G-DB7-46. The kind is validated against the closed set; the **id** is
      // deliberately not resolved. `audit_events` has no FK to its target
      // (REL-103) because the row must outlive what it describes — a customer
      // may be anonymized and an asset tombstoned, and their audit trail has to
      // survive both. Resolving the id here would make that impossible.
      if (!(AUDIT_TARGET_KINDS as readonly string[]).includes(input.targetKind)) {
        throw guardViolationError(
          'AuditEventRepository.append',
          'UNKNOWN_AUDIT_TARGET_KIND',
          'That audit target kind is not recognised.',
        );
      }

      // Uses `this.db`, so it joins the emitting use case's transaction when
      // there is one: an audited action that rolled back would be a false
      // record of something that never happened.
      await this.db.insert(auditEvents).values({
        occurredAt: input.occurredAt,
        ...actorColumns(input.actor),
        action: input.action,
        targetKind: input.targetKind,
        targetId: input.targetId,
        reason: input.reason ?? null,
        summary: input.summary ?? null,
        failureCode: input.failureCode ?? null,
        correlationId: input.correlationId,
      });
    });
  }

  async listByTarget(targetKind: AuditTargetKind, targetId: string): Promise<AuditEvent[]> {
    return this.run('listByTarget', async () => {
      const rows = await this.db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.targetKind, targetKind), eq(auditEvents.targetId, targetId)))
        // Matches `ix_audit_events__target__occurred__id`: newest first with the
        // id as tie-breaker, so a same-instant pair still has a stable order.
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id));
      return rows.map(toEvent);
    });
  }

  async listByCorrelation(correlationId: string): Promise<AuditEvent[]> {
    return this.run('listByCorrelation', async () => {
      const rows = await this.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.correlationId, correlationId))
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id));
      return rows.map(toEvent);
    });
  }
}
