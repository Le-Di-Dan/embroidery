/**
 * The fourth production job handler, and APP7's first runtime deliverable
 * (`APP7-W01` §3).
 *
 * `APP6-B11` has been appending `design.approved` since it shipped, and nothing
 * has ever claimed it: the registry knew `asset-normalization`,
 * `asset-inspection` and `notification-delivery`, and an unclaimed event type is
 * abandoned with a warning. Every approval since then has left a `PENDING`
 * outbox row (`APP7-R00` §3.2, §11). This handler is the consumer, and the
 * backlog is ordinary work for it — the effect key is the approval, so a
 * hundred waiting rows for a hundred approvals convert once each, and two rows
 * for one approval convert once.
 *
 * Thin, exactly as its three predecessors are. It reuses the **same** runtime:
 * same registry, same claim through `WorkerJobQueueRepository`, same lease, same
 * `background_job_attempts` ledger, same `DISPATCHED`/`DEAD_LETTER` completion.
 * `APP7-W01` adds no queue, no scheduler, no poller, no claim framework and no
 * HTTP route.
 *
 * No `retryPlan`: the global `worker.runtime` schedule is the right one here.
 * `notification.delivery` published its own only because `[60, 300]` is a curve
 * no `base × 2^n` produces; nothing in `APP7-G01` names a schedule for order
 * conversion, and inventing one would be a policy this checkpoint does not own.
 *
 * The job kind is `ORDER_CREATION`, not the transport kind `OUTBOX_DISPATCH` —
 * the work is creating an order, and the precedent is `ASSET_PROCESSING`
 * (IMP-D030): filing domain work under the transport kind hides it from an
 * operator's dead-letter query.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';

import type {
  JobExecutionContext,
  JobHandler,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import { WorkerJobError } from '../../runtime/errors/worker-job-error';
import { ConvertApprovedDesignUseCase } from './application/convert-approved-design.usecase';
import {
  APPROVAL_SNAPSHOT_AGGREGATE_KIND,
  DESIGN_APPROVED_EVENT_TYPE,
  DESIGN_APPROVED_PAYLOAD_VERSION,
  deriveOrderConversionEffectKey,
  parseDesignApprovedPayload,
  type DesignApprovedLookup,
} from './domain/design-approved.payload';

/** The DB7 job kind this capability files its attempt evidence under. */
const ORDER_CREATION: BackgroundJobKind = 'ORDER_CREATION';

@Injectable()
export class OrderConversionHandler implements JobHandler<DesignApprovedLookup> {
  readonly eventType = DESIGN_APPROVED_EVENT_TYPE;
  readonly jobKind = ORDER_CREATION;
  readonly payloadSchemaVersion = DESIGN_APPROVED_PAYLOAD_VERSION;

  constructor(private readonly useCase: ConvertApprovedDesignUseCase) {}

  validatePayload(payload: unknown): PayloadValidationResult<DesignApprovedLookup> {
    return parseDesignApprovedPayload(payload);
  }

  deriveEffectKey(payload: DesignApprovedLookup): string {
    return deriveOrderConversionEffectKey(payload);
  }

  async execute(payload: DesignApprovedLookup, context: JobExecutionContext): Promise<void> {
    if (context.aggregateKind !== APPROVAL_SNAPSHOT_AGGREGATE_KIND) {
      // The claim filter is by event type, so a row of the right type with the
      // wrong linkage is possible and is a producer defect. Terminal: no number
      // of retries will change what the column says.
      throw new WorkerJobError(
        'JOB_INVARIANT_VIOLATION',
        `A design approval event must be linked to ${APPROVAL_SNAPSHOT_AGGREGATE_KIND}.`,
      );
    }
    if (context.aggregateId !== payload.approvalSnapshotId) {
      // `SE-005` is "per (approval snapshot)", and the effect key is derived
      // from the payload. A row whose linkage and payload name different
      // approvals could convert one while deduplicating against the other.
      throw new WorkerJobError(
        'JOB_INVARIANT_VIOLATION',
        'The event linkage and payload name different approvals.',
      );
    }

    try {
      await this.useCase.convert(payload);
    } catch (error: unknown) {
      // A conversion refusal is already classified — terminal for a frozen
      // chain that will read the same on every attempt, transient for a claim
      // another attempt is holding. Anything else stays unclassified rather
      // than being guessed at from a message.
      if (error instanceof WorkerJobError) {
        throw error;
      }
      throw new WorkerJobError('JOB_UNKNOWN_FAILURE', 'Order conversion failed.', {
        cause: error,
      });
    }
  }
}
