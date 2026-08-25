/**
 * The audit row and the lifecycle event each production transition leaves
 * (`APP8-B04` §17).
 *
 * ### The audit rows are required, not invented
 *
 * `DB3_AUDIT_SPECIFICATION.md` names this group in one line —
 * *"Production start/complete/cancel(rework) | TR-LC18-\* | admin | **R**
 * (cancel/rework) | job + approval refs | production file refs internal-only"*
 * — so the row, its admin actor and its job-plus-approval summary are an
 * accepted requirement. `APP8-B04` §16 forbids **inventing** an audit vocabulary;
 * it does not forbid writing the one the specification already names, and the
 * action strings follow the locked lowercase dot-namespaced convention every
 * other recorder in this repository uses.
 *
 * Job **creation** is still not audited. It is not in that specification line,
 * and `FU-APP8-B03-01` stays carried and nonblocking (§16).
 *
 * ### The outbox events are the two SE-009 names, and only those
 *
 * `SE-009` is *"TR-LC18-02/03 production start/complete → `production.started` /
 * `production.completed`, per (job, action)"*. Both are appended inside the
 * transaction that moves the job, so an event cannot describe a state change the
 * database rolled back (INV-23, GRD-029).
 *
 * **Cancellation appends none.** No accepted side effect names a production-job
 * cancellation: `SE-012` is the *order* cancellation saga, which `PO-APP8-005`
 * keeps outside APP8 entirely. Minting `production.cancelled` because the other
 * two exist would be exactly the invention §17 forbids, and it would put an
 * event type in the outbox that no accepted consumer claims.
 *
 * ### What the payload carries
 *
 * References only — job, order, approval, and the two states. No specification,
 * no document hash beyond what the job row names, no customer, no contact, no
 * money and no artifact reference (`PO-APP8-004`, INV-21/22). That is the
 * DB3 payload-minimisation rule, and it is why a consumer must read the job to
 * act rather than trusting a copy that travelled.
 */
import { Inject, Injectable } from '@nestjs/common';
import { OutboxEventStore } from '@embroidery/persistence';
import type { OrderState, ProductionJobState } from '@embroidery/database';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../../audit/domain/repositories/audit-event.repository';

/** Lowercase dot-namespaced, as `DB3_AUDIT_SPECIFICATION.md` locks. */
export const PRODUCTION_JOB_STARTED_ACTION = 'production_job.started';
export const PRODUCTION_JOB_COMPLETED_ACTION = 'production_job.completed';
export const PRODUCTION_JOB_CANCELLED_ACTION = 'production_job.cancelled';

/** `SE-009`, verbatim. There is no third name. */
export const PRODUCTION_STARTED_EVENT = 'production.started';
export const PRODUCTION_COMPLETED_EVENT = 'production.completed';

export const PRODUCTION_TRANSITION_PAYLOAD_VERSION = 1;

export interface ProductionTransitionFactsToRecord {
  readonly jobId: string;
  readonly orderId: string;
  readonly approvalSnapshotId: string;
  readonly fromStatus: ProductionJobState;
  readonly toStatus: ProductionJobState;
  /** Present only when this command also moved the order. */
  readonly orderFromStatus?: OrderState | undefined;
  readonly orderToStatus?: OrderState | undefined;
  /** Reservations this command terminalized, by id. Empty for a COP-only order. */
  readonly reservationIds: readonly string[];
  readonly reason?: string | undefined;
}

@Injectable()
export class ProductionTransitionRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly outbox: OutboxEventStore,
    private readonly clock: AuditClock,
    private readonly requestContext: RequestContextService,
  ) {}

  /** @requiresTransaction — atomic with the move it explains. */
  async recordStarted(facts: ProductionTransitionFactsToRecord, adminId: string): Promise<void> {
    await this.append(PRODUCTION_JOB_STARTED_ACTION, facts, adminId);
    await this.emit(PRODUCTION_STARTED_EVENT, facts);
  }

  /** @requiresTransaction */
  async recordCompleted(facts: ProductionTransitionFactsToRecord, adminId: string): Promise<void> {
    await this.append(PRODUCTION_JOB_COMPLETED_ACTION, facts, adminId);
    await this.emit(PRODUCTION_COMPLETED_EVENT, facts);
  }

  /**
   * @requiresTransaction — the audit row only. See the file header: no accepted
   * side effect names a production-job cancellation, so none is emitted.
   */
  async recordCancelled(facts: ProductionTransitionFactsToRecord, adminId: string): Promise<void> {
    await this.append(PRODUCTION_JOB_CANCELLED_ACTION, facts, adminId);
  }

  private async append(
    action: string,
    facts: ProductionTransitionFactsToRecord,
    adminId: string,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      actor: { kind: 'ADMIN', adminId },
      action,
      // The job, not the order: the audited fact is what happened to this
      // production job. `PRODUCTION_JOB` has been an accepted target kind since
      // DB7.
      targetKind: 'PRODUCTION_JOB',
      targetId: facts.jobId,
      ...(facts.reason === undefined ? {} : { reason: facts.reason }),
      summary: {
        orderId: facts.orderId,
        approvalSnapshotId: facts.approvalSnapshotId,
        fromStatus: facts.fromStatus,
        toStatus: facts.toStatus,
        ...(facts.orderFromStatus === undefined
          ? {}
          : { orderFromStatus: facts.orderFromStatus, orderToStatus: facts.orderToStatus }),
        // Ids, not quantities: the ledger is where a quantity is evidence, and
        // an audit summary is not a second balance record.
        reservationIds: facts.reservationIds,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  private async emit(eventType: string, facts: ProductionTransitionFactsToRecord): Promise<void> {
    await this.outbox.append({
      eventType,
      aggregateKind: 'PRODUCTION_JOB',
      aggregateId: facts.jobId,
      payload: {
        schemaVersion: PRODUCTION_TRANSITION_PAYLOAD_VERSION,
        productionJobId: facts.jobId,
        orderId: facts.orderId,
        approvalSnapshotId: facts.approvalSnapshotId,
        jobStatus: facts.toStatus,
        ...(facts.orderToStatus === undefined ? {} : { orderStatus: facts.orderToStatus }),
      },
      payloadSchemaVersion: PRODUCTION_TRANSITION_PAYLOAD_VERSION,
    });
  }
}
