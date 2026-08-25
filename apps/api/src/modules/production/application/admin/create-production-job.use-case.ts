/**
 * Production job creation (`APP8-B03` §5, `PO-APP8-003`, `TR-LC18-01`).
 *
 * Admin-initiated, synchronous, post-deposit, against the exact Approval
 * Snapshot, one job per `(order, approval snapshot)`. No worker creates a job
 * (`WORKER_AUTO_CREATION = FORBIDDEN`) and no `payment.verified` handler was
 * touched to make this reachable.
 *
 * ### One transaction, and the order of what happens inside it
 *
 * ```text
 * order      -> resolved, and with it the approval this order is produced against
 * approval   -> the client's id, if any, must equal that one
 * deposit    -> DepositEligibilityPort.isDepositSatisfied(orderId)   (GRD-013)
 * job + spec -> createJob, both rows in this same transaction        (INV-03)
 * ```
 *
 * Every check precedes the write, and all of it shares one transaction — so a
 * refusal at any point leaves no job, no specification and no partial row. The
 * §12 rule "do not create the job first and validate after commit" is a property
 * of this ordering, not of a compensating delete.
 *
 * ### The exact order ↔ approval linkage (§5.3)
 *
 * The approval id is **read off the order row** — `orders.current_approval_snapshot_id`,
 * `NOT NULL` by REL-074 — never taken from the request. When the client does
 * name one, it is compared against that value and a mismatch is refused.
 *
 * That is deliberately stronger than proving the two rows independently exist,
 * which is all the FK layer can do and all the delivered repository did: its
 * `createJob` reads `approval_snapshots` by id and copies the row, so an
 * approval belonging to a *different* order satisfies both
 * `fk_production_jobs__order_id` and `fk_production_jobs__approval_snapshot_id`
 * and would have frozen another customer's artwork onto this order's job. The
 * delivered integration suite says so in as many words: *"The approval belongs
 * to another request, so its FK to this order's chain is satisfied but the job
 * is orphaned commercially."* Resolving the id from the order is what closes
 * that, and it closes it for the unnamed case too — a request that supplies no
 * approval at all cannot pick the wrong one.
 *
 * ### The deposit gate is the one that already exists (§5.2)
 *
 * `DEPOSIT_ELIGIBILITY_PORT` — the same Symbol
 * `ReservationEligibilityGuard` resolves for GRD-013, bound to
 * `DrizzleDepositEligibilityAdapter` by `PaymentPersistenceModule`
 * (`APP8-G01` §7.1). No SQL is duplicated, no second predicate is written, and
 * no `payment_obligations` table is read here.
 *
 * ### What creation deliberately does NOT check
 *
 * - **Not the order state.** `GRD-015`'s `DEPOSIT_PAID` clause is a
 *   production-**start** gate and belongs to `APP8-B04` (§5.6).
 * - **Not hold/cancelling.** `GRD-022` is likewise a start gate (§5.6).
 * - **Not an inventory reservation.** §5.5 is explicit that a `PLANNED` job
 *   needs none, and `PO-APP8-001` §1.3 makes a COP-only order — which can never
 *   have one — a valid production subject. Nothing here reads, creates,
 *   consumes or releases a reservation.
 *
 * B03 creates `PLANNED`. B04 decides whether `PLANNED -> STARTED` is legal.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { DEPOSIT_ELIGIBILITY_PORT, TransactionManager } from '@embroidery/persistence';
import type { DepositEligibilityPort } from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  ORDER_PRODUCTION_CONTEXT_PORT,
  type OrderProductionContextPort,
} from '../../../order/domain/repositories/order-production-context.port';
import { productionOperationError } from '../../domain/production-operations.errors';
import {
  PRODUCTION_JOB_REPOSITORY,
  type ProductionJob,
  type ProductionJobId,
  type ProductionJobRepository,
} from '../../domain/repositories/production-job.repository';
import { assertProductionAdminActor } from './production-admin-actor';

/** The code `uq_production_jobs__order_approval_snapshot` produces (DB7 catalog). */
const JOB_ALREADY_EXISTS = 'PRODUCTION_JOB_ALREADY_EXISTS';

/**
 * Everything the operator owns.
 *
 * No `adminId`, no `status`, no timestamp, no job id and no frozen
 * specification field: the identity is bound by the guard, `PLANNED` is fixed by
 * `TR-LC18-01`, the id is minted here, and every specification value is copied
 * from the approval by the repository. `approvalSnapshotId` is optional and is
 * only ever used to *confirm* what the order already says.
 */
export interface CreateProductionJobCommand {
  readonly orderId: string;
  /** Optional confirmation of the order's own approval. Never an alternate. */
  readonly approvalSnapshotId?: string | undefined;
  /** Optional free-text machine parameters, frozen with the specification. */
  readonly productionParameters?: string | undefined;
}

@Injectable()
export class CreateProductionJobUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ORDER_PRODUCTION_CONTEXT_PORT) private readonly orders: OrderProductionContextPort,
    @Inject(DEPOSIT_ELIGIBILITY_PORT) private readonly deposits: DepositEligibilityPort,
    @Inject(PRODUCTION_JOB_REPOSITORY) private readonly jobs: ProductionJobRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async create(command: CreateProductionJobCommand): Promise<ProductionJob> {
    // Before the transaction opens: an actor fault must not hold a connection.
    assertProductionAdminActor(this.requestContext);

    return this.transactions.runInTransaction(async () => {
      const order = await this.orders.findByOrderId(command.orderId);
      if (order === undefined) {
        throw productionOperationError('PRODUCTION_ORDER_NOT_FOUND');
      }

      // The authoritative id is the order's. A client-supplied one is a
      // confirmation, never a selection: a snapshot approved for another order
      // cannot become this order's production basis by being named.
      const approvalSnapshotId = order.currentApprovalSnapshotId;
      if (
        command.approvalSnapshotId !== undefined &&
        command.approvalSnapshotId !== approvalSnapshotId
      ) {
        throw productionOperationError('PRODUCTION_APPROVAL_MISMATCH');
      }

      if (!(await this.deposits.isDepositSatisfied(command.orderId))) {
        throw productionOperationError('PRODUCTION_DEPOSIT_NOT_SATISFIED');
      }

      try {
        return await this.jobs.createJob({
          id: newId() as ProductionJobId,
          orderId: order.orderId,
          approvalSnapshotId,
          productionParameters: command.productionParameters,
        });
      } catch (error: unknown) {
        // The unique index is the arbiter, not a pre-read: two concurrent
        // creations for the same pair both reach the insert and exactly one
        // commits. A `findByOrderAndApproval` check before the insert would
        // leave a window between the read and the write that this cannot have.
        if (isPersistenceError(error) && error.code === JOB_ALREADY_EXISTS) {
          throw productionOperationError('PRODUCTION_JOB_ALREADY_EXISTS');
        }
        throw error;
      }
    });
  }
}
