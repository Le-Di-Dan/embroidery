/**
 * The state guards each production transition must clear (`APP8-B04` §5, §12,
 * §13).
 *
 * Pure decisions over facts the caller has already read **under the locks that
 * arbitrate them** — the order row and the production job row. Nothing here
 * queries, and nothing here writes: separating the decision from the
 * orchestration is what makes `GRD-015` and `GRD-022` legible as a list of
 * clauses rather than as a sequence of early returns buried between two
 * repository calls.
 *
 * The one gate that is *not* here is the deposit. `GRD-013`'s authority is
 * `DepositEligibilityPort.isDepositSatisfied(orderId)` and it is asynchronous,
 * so it stays in the use case beside the port it calls — there is exactly one
 * deposit predicate in the repository (`APP8-G01` §7.1) and a copy of it here
 * would be the second.
 *
 * ### Why `PRODUCTION_ORDER_ON_HOLD` is checked before the state clause
 *
 * `ON_HOLD` and `CANCELLING` are states, so the state clause alone would refuse
 * them — with `PRODUCTION_BLOCKED`, which reads as "wrong step" rather than
 * "this order is held". `GRD-022` gives them their own meaning and the operator
 * a different next action: the hold is lifted by order authority, which
 * `APP8-B04` §5.2 forbids this checkpoint from doing. Naming it truthfully is
 * the difference between an operator lifting a hold and an operator wondering
 * why a deposit-paid order will not start.
 *
 * ### Why LC-14 legality is not the start guard
 *
 * `ON_HOLD → IN_PRODUCTION` is a **legal** LC-14 move — it is the resume path
 * (ADR-DB3-003 r5) — so an order transition's own legality check would let a
 * held order enter production. `GRD-015`'s `DEPOSIT_PAID` clause is what
 * excludes it, and it is asserted here, under the order row lock, before
 * anything is consumed.
 */
import type { OrderState } from '@embroidery/database';
import type { ProductionJobState } from '@embroidery/database';

import { productionOperationError } from '../../domain/production-operations.errors';

/** The order states `GRD-022` singles out as "not now, and not because of this job". */
const HELD_ORDER_STATES: readonly OrderState[] = ['ON_HOLD', 'CANCELLING'];

/** The facts a transition decides from, all read under their own row locks. */
export interface ProductionTransitionFacts {
  readonly jobStatus: ProductionJobState;
  readonly jobApprovalSnapshotId: string;
  readonly orderStatus: OrderState;
  readonly orderApprovalSnapshotId: string;
}

/**
 * `GRD-015` + `GRD-022`, minus the deposit clause — everything a start decides
 * synchronously.
 *
 * The clause order is the order an operator can act on: an illegal move is
 * about the job, a hold is about the order and someone else lifts it, a wrong
 * order state is about sequence, and a mismatched approval is about the job
 * being cut from something the order no longer names.
 */
export function assertStartable(facts: ProductionTransitionFacts): void {
  if (facts.jobStatus !== 'PLANNED') {
    throw productionOperationError('PRODUCTION_INVALID_TRANSITION');
  }
  assertOrderNotHeld(facts.orderStatus);
  if (facts.orderStatus !== 'DEPOSIT_PAID') {
    throw productionOperationError('PRODUCTION_BLOCKED');
  }
  // The job's frozen approval must still be the one the order is produced
  // against. `APP8-B03` resolved it from `orders.current_approval_snapshot_id`
  // at creation; ADR-DB3-003 r4 permits a later accepted revision flow to
  // repoint that column, and no delivered path does so yet. If one ever moves
  // it, this refuses rather than starting a job against an approval the order
  // no longer names — which is the conservative half of `FU-APP8-B03-03`, not
  // a decision about which approval a planned job should follow. That decision
  // belongs to the checkpoint that delivers pointer moves.
  if (facts.jobApprovalSnapshotId !== facts.orderApprovalSnapshotId) {
    throw productionOperationError('PRODUCTION_APPROVAL_MISMATCH');
  }
}

/**
 * `TR-LC18-03` + `TR-LC14-04` — completion needs both sides already in motion.
 *
 * No approval re-check: the specification was frozen at creation and start
 * already proved the linkage. No reservation clause either — the goods were
 * issued at start, and completion moves no inventory (`APP8-B04` §12).
 */
export function assertCompletable(facts: ProductionTransitionFacts): void {
  if (facts.jobStatus !== 'STARTED') {
    throw productionOperationError('PRODUCTION_INVALID_TRANSITION');
  }
  assertOrderNotHeld(facts.orderStatus);
  if (facts.orderStatus !== 'IN_PRODUCTION') {
    throw productionOperationError('PRODUCTION_BLOCKED');
  }
}

/**
 * `TR-LC18-04`/`TR-LC18-05` — cancellation is legal from either live state.
 *
 * The order's commercial state is deliberately **not** a clause. `APP8-G01` §5.2
 * gives APP8 the production-job cancellation and nothing more: an order on hold
 * or already being cancelled is precisely when an operator needs to stop the
 * machine work, so refusing here would make the cancellation unreachable in the
 * cases that need it most. The order is not moved either — see the use case.
 */
export function assertCancellable(facts: ProductionTransitionFacts, reason: string): void {
  if (reason.trim() === '') {
    throw productionOperationError('PRODUCTION_CANCELLATION_REASON_REQUIRED');
  }
  if (facts.jobStatus !== 'PLANNED' && facts.jobStatus !== 'STARTED') {
    throw productionOperationError('PRODUCTION_INVALID_TRANSITION');
  }
}

function assertOrderNotHeld(status: OrderState): void {
  if (HELD_ORDER_STATES.includes(status)) {
    throw productionOperationError('PRODUCTION_ORDER_ON_HOLD');
  }
}
