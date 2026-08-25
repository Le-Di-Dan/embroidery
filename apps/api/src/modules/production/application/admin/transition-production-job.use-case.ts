/**
 * The one guarded production transition command (`APP8-B04` §2, §7, §8, §12,
 * §13).
 *
 * Three targets, one transaction each, and every effect a target implies
 * commits together or not at all:
 *
 * ```text
 * STARTED    job PLANNED   -> STARTED    + order DEPOSIT_PAID  -> IN_PRODUCTION
 *                                        + every required Catalog reservation
 *                                          RESERVED -> CONSUMED, on-hand down
 * COMPLETED  job STARTED   -> COMPLETED  + order IN_PRODUCTION -> PRODUCTION_COMPLETED
 * CANCELLED  job PLANNED|STARTED -> CANCELLED
 *                                        + any still-active Catalog reservation
 *                                          RESERVED -> RELEASED
 *                                        + NO order move
 * ```
 *
 * ### The transaction is the atomicity, and there is no compensation (§7)
 *
 * One `runInTransaction` wraps the guards, the job move, every reservation
 * terminalization, the order move and the audit/outbox appends. The canonical
 * `OrderRepository`, the canonical shared `SkuStockRepository` and the API-local
 * `ProductionJobRepository` all participate in it through the ambient
 * `transactionContext` their executors resolve — the same mechanism `APP8-W01`
 * proved across a runtime boundary. So a three-SKU start whose third SKU is not
 * reserved leaves the job `PLANNED`, the order `DEPOSIT_PAID`, the first two
 * reservations `RESERVED`, on-hand untouched and not one transition, ledger,
 * audit or outbox row behind. No release is written to undo a consume, because
 * nothing was committed to undo.
 *
 * ### The lock order (§8)
 *
 * ```text
 * 1. orders                 FOR UPDATE   — arbitrates start vs hold/cancellation
 * 2. production_jobs        FOR UPDATE   — arbitrates LC-18
 * 3. inventory_reservations FOR UPDATE   — per required SKU, ascending SKU id
 * 4. sku_stocks             FOR UPDATE   — reached by consume, same SKU order
 * ```
 *
 * Taken in that order by every one of the three targets, so no B04 command can
 * be the reverse of another. Steps 3 and 4 are sequential per requirement — the
 * SKU order `aggregateCatalogRequirements` returns — and never `Promise.all`,
 * which would issue the locks in completion order and throw the determinism
 * away. Isolation stays `READ COMMITTED` with explicit row locks: no
 * `SERIALIZABLE`, no advisory lock, no distributed lock, no `NOWAIT`.
 *
 * `findById` before the order lock reads **one field** — which order this job
 * belongs to — and decides nothing. Every fact the guards use is re-read under
 * the locks: `loadForUpdate` on the order, `loadForUpdate` on the job, and the
 * reservation's own status inside `consumeOrderReservation`.
 *
 * ### The reservation requirement is re-derived, never read from a summary (§9)
 *
 * From the **frozen order items**, through the one canonical
 * `aggregateCatalogRequirements` `APP8-W01` reserved by. `APP8-B03`'s
 * `ORDER_RESERVATION_SUMMARY_PORT` is display-only, taken with no lock, and is
 * not injected here at all — `FU-APP8-B02-02` and `FU-APP8-B03-02` are binding,
 * and the surest way not to decide from an unlocked read is not to be able to
 * reach one.
 *
 * A COP-only order aggregates to `[]`, so start consumes nothing and requires
 * nothing (`PO-APP8-001` §1.3). A mixed order aggregates only its Catalog lines.
 *
 * ### What this deliberately does not do
 *
 * It does not move an order to `AWAITING_FINAL_PAYMENT`, collect the remaining
 * payment, touch shipping or create a refund (`PO-APP8-005`). It does not move
 * the order's **commercial** state on a production-job cancellation: `APP8-G01`
 * §5.2 gives APP8 the job move and the reservation release, and leaves the order
 * cancellation/refund saga to later authority. It never calls `APP8-W01`, never
 * creates a replacement reservation and never restocks.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import type { OrderState, ProductionJobState } from '@embroidery/database';
import {
  DEPOSIT_ELIGIBILITY_PORT,
  ORDER_REPOSITORY,
  TransactionManager,
  type DepositEligibilityPort,
  type Order,
  type OrderId,
  type OrderRepository,
} from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  productionOperationError,
  type ProductionOperationFailure,
} from '../../domain/production-operations.errors';
import {
  PRODUCTION_JOB_REPOSITORY,
  type ProductionJob,
  type ProductionJobId,
  type ProductionJobRepository,
} from '../../domain/repositories/production-job.repository';
import { requireProductionAdminId } from './production-admin-actor';
import { ProductionReservationCoordinator } from './production-reservation.coordinator';
import {
  assertCancellable,
  assertCompletable,
  assertStartable,
} from './production-transition.guards';
import { ProductionTransitionRecorder } from './production-transition.recorder';

/** The persistence guard codes this command translates, and nothing wider. */
const PERSISTENCE_FAILURES: Readonly<Record<string, ProductionOperationFailure>> = {
  INVALID_TRANSITION: 'PRODUCTION_INVALID_TRANSITION',
  CANCELLATION_REASON_REQUIRED: 'PRODUCTION_CANCELLATION_REASON_REQUIRED',
  TRANSITION_REASON_REQUIRED: 'PRODUCTION_CANCELLATION_REASON_REQUIRED',
  RESERVATION_NOT_ACTIVE: 'PRODUCTION_RESERVATION_NOT_ACTIVE',
  RESERVATION_QUANTITY_INSUFFICIENT: 'PRODUCTION_RESERVATION_INSUFFICIENT',
};

export type ProductionTransitionTarget = 'STARTED' | 'COMPLETED' | 'CANCELLED';

export interface TransitionProductionJobCommand {
  readonly jobId: string;
  readonly to: ProductionTransitionTarget;
  /** Mandatory for `CANCELLED`, refused for the other two by the request schema. */
  readonly reason?: string | undefined;
}

export interface ProductionTransitionResult {
  readonly job: ProductionJob;
  readonly fromStatus: ProductionJobState;
  readonly orderStatus: OrderState;
  readonly reservationIds: readonly string[];
}

@Injectable()
export class TransitionProductionJobUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(DEPOSIT_ELIGIBILITY_PORT) private readonly deposits: DepositEligibilityPort,
    @Inject(PRODUCTION_JOB_REPOSITORY) private readonly jobs: ProductionJobRepository,
    private readonly reservations: ProductionReservationCoordinator,
    private readonly recorder: ProductionTransitionRecorder,
    private readonly requestContext: RequestContextService,
  ) {}

  async transition(command: TransitionProductionJobCommand): Promise<ProductionTransitionResult> {
    // Before the transaction opens: an actor fault must not hold a connection.
    const adminId = requireProductionAdminId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();
    const jobId = command.jobId as ProductionJobId;

    try {
      return await this.transactions.runInTransaction(async () => {
        // Identifier discovery only — which order this job belongs to. Nothing
        // is decided from this read; the job's own state is taken again at (2).
        const known = await this.jobs.findById(jobId);
        if (known === undefined) {
          throw productionOperationError('PRODUCTION_JOB_NOT_FOUND');
        }

        // (1) the order row — the arbiter between production start and an order
        // hold or cancellation.
        const order = await this.orders.loadForUpdate(known.orderId as OrderId);
        if (order === undefined) {
          throw productionOperationError('PRODUCTION_ORDER_NOT_FOUND');
        }

        // (2) the job row — LC-18's arbiter, and the authoritative status and
        // approval every guard below reads.
        const job = await this.jobs.loadForUpdate(jobId);
        if (job === undefined) {
          throw productionOperationError('PRODUCTION_JOB_NOT_FOUND');
        }

        switch (command.to) {
          case 'STARTED':
            return await this.start(order, job, adminId, correlationId);
          case 'COMPLETED':
            return await this.complete(order, job, adminId, correlationId);
          case 'CANCELLED':
            return await this.cancel(order, job, command.reason ?? '', adminId, correlationId);
        }
      });
    } catch (error: unknown) {
      throw this.translate(error);
    }
  }

  private async start(
    order: Order,
    job: ProductionJob,
    adminId: string,
    correlationId: string,
  ): Promise<ProductionTransitionResult> {
    assertStartable({
      jobStatus: job.status,
      jobApprovalSnapshotId: job.approvalSnapshotId,
      orderStatus: order.status,
      orderApprovalSnapshotId: order.currentApprovalSnapshotId,
    });

    // GRD-013 through the one authority (`APP8-G01` §7.1) — the same
    // `DepositEligibilityPort` `ReservationEligibilityGuard` and `APP8-B03`
    // resolve. A stale `DEPOSIT_PAID` on the order row is not a substitute: the
    // state records that the order was told the deposit landed, the port is
    // whether the obligation is SATISFIED. No second predicate, no
    // `payment_obligations` read here.
    if (!(await this.deposits.isDepositSatisfied(order.id))) {
      throw productionOperationError('PRODUCTION_DEPOSIT_NOT_SATISFIED');
    }

    // (2, continued) the job move, with its LC-18 legality re-checked under the
    // lock this transaction already holds.
    const moved = await this.jobs.transition({
      id: job.id,
      to: 'STARTED',
      actor: { kind: 'ADMIN', adminId },
      correlationId,
    });

    // (3) + (4) the goods issue, one requirement at a time, in ascending SKU id.
    const reservationIds = await this.reservations.consumeAll(order.id);

    await this.orders.transition({
      id: order.id,
      to: 'IN_PRODUCTION',
      actor: { kind: 'ADMIN', adminId },
      correlationId,
    });

    await this.recorder.recordStarted(
      {
        jobId: job.id,
        orderId: order.id,
        approvalSnapshotId: job.approvalSnapshotId,
        fromStatus: job.status,
        toStatus: 'STARTED',
        orderFromStatus: order.status,
        orderToStatus: 'IN_PRODUCTION',
        reservationIds,
      },
      adminId,
    );

    return {
      job: moved,
      fromStatus: job.status,
      orderStatus: 'IN_PRODUCTION',
      reservationIds,
    };
  }

  private async complete(
    order: Order,
    job: ProductionJob,
    adminId: string,
    correlationId: string,
  ): Promise<ProductionTransitionResult> {
    assertCompletable({
      jobStatus: job.status,
      jobApprovalSnapshotId: job.approvalSnapshotId,
      orderStatus: order.status,
      orderApprovalSnapshotId: order.currentApprovalSnapshotId,
    });

    const moved = await this.jobs.transition({
      id: job.id,
      to: 'COMPLETED',
      actor: { kind: 'ADMIN', adminId },
      correlationId,
    });

    // `TR-LC14-04`, and the end of APP8's successful handoff. It does **not**
    // continue to `AWAITING_FINAL_PAYMENT` — that is `TR-LC14-05`, APP9's.
    await this.orders.transition({
      id: order.id,
      to: 'PRODUCTION_COMPLETED',
      actor: { kind: 'ADMIN', adminId },
      correlationId,
    });

    await this.recorder.recordCompleted(
      {
        jobId: job.id,
        orderId: order.id,
        approvalSnapshotId: job.approvalSnapshotId,
        fromStatus: job.status,
        toStatus: 'COMPLETED',
        orderFromStatus: order.status,
        orderToStatus: 'PRODUCTION_COMPLETED',
        reservationIds: [],
      },
      adminId,
    );

    return {
      job: moved,
      fromStatus: job.status,
      orderStatus: 'PRODUCTION_COMPLETED',
      reservationIds: [],
    };
  }

  private async cancel(
    order: Order,
    job: ProductionJob,
    reason: string,
    adminId: string,
    correlationId: string,
  ): Promise<ProductionTransitionResult> {
    assertCancellable(
      {
        jobStatus: job.status,
        jobApprovalSnapshotId: job.approvalSnapshotId,
        orderStatus: order.status,
        orderApprovalSnapshotId: order.currentApprovalSnapshotId,
      },
      reason,
    );

    const moved = await this.jobs.transition({
      id: job.id,
      to: 'CANCELLED',
      actor: { kind: 'ADMIN', adminId },
      reason,
      correlationId,
    });

    // Only what is still `RESERVED`. After a start the reservations are
    // `CONSUMED` and stay that way — the goods left, and §13.2 forbids
    // "unconsuming" them or fabricating a release so the two cancellation paths
    // look alike. A COP-only order yields no requirement at all.
    const released = await this.reservations.releaseAll(order.id, reason, adminId);

    // No order transition. The order's commercial lifecycle — CANCELLING,
    // CANCELLED, refunds, remaining-payment settlement — is the saga
    // `PO-APP8-005` keeps outside APP8. A cancelled job hands the order to that
    // authority; it does not execute it.
    await this.recorder.recordCancelled(
      {
        jobId: job.id,
        orderId: order.id,
        approvalSnapshotId: job.approvalSnapshotId,
        fromStatus: job.status,
        toStatus: 'CANCELLED',
        reservationIds: released,
        reason,
      },
      adminId,
    );

    return {
      job: moved,
      fromStatus: job.status,
      orderStatus: order.status,
      reservationIds: released,
    };
  }

  /**
   * Translates the persistence guard codes this command can provoke.
   *
   * Anything else — a SQLSTATE, a constraint name, a retryable `40001`/`40P01`
   * conflict — travels untouched to the platform filter, which already maps and
   * sanitises it. Re-deciding those here would duplicate a delivered mapper.
   */
  private translate(error: unknown): unknown {
    if (isPersistenceError(error)) {
      const failure = PERSISTENCE_FAILURES[error.code];
      if (failure !== undefined) {
        return productionOperationError(failure);
      }
    }
    return error;
  }
}
