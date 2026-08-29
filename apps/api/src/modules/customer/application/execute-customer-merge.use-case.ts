/**
 * Executes one merge case — the single transaction of `APP10-B03`.
 *
 * Everything a merge changes commits together or nothing does: the contact
 * moves, the grant revocations, the ownership transfers across three contexts,
 * the loser's tombstone, the append-only `customer_merge_events` sequence, the
 * case transition and the Admin audit row. There is exactly one
 * `runInTransaction` on this path, and every collaborator joins it through the
 * ambient handle rather than opening a boundary of its own.
 *
 * ### The ordered protocol, and why each step is where it is
 *
 * 1. **lock the case** — `FOR UPDATE`. The serialization point: two concurrent
 *    executes of one case queue here, and the second reads `EXECUTED` and does
 *    nothing.
 * 2. **classify it** — `REQUESTED` executes, `EXECUTED` is an idempotent
 *    success, `REJECTED` is refused. Decided *before* the participants are read,
 *    so a replay cannot fail because the loser it merged is now a tombstone.
 * 3. **lock both customers** — in primary-key order (CC-27 / D8-18), so two
 *    merges naming the same pair from opposite directions serialize instead of
 *    deadlocking.
 * 4. **revalidate** — both rows still exist, neither has been merged away since
 *    the case was opened. The `APP10-B02` preview is advisory and may be days
 *    old; nothing it computed is trusted here.
 * 5. **check the business-profile collision** — under lock, and *before* any
 *    destructive write (§10).
 * 6. **transfer** — contacts, grants, ownership, profile, tombstone.
 * 7. **append the evidence**, **transition the case**, **audit the action**.
 *
 * ### No irreversible side effect is inside the boundary
 *
 * No notification, no provider call, no queued job, no outbox emission. A merge
 * that rolls back must leave nothing behind that says it happened, and anything
 * leaving the process cannot be rolled back.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { CustomerMergeAuditRecorder } from './customer-merge-audit.recorder';
import { CustomerMergeTransfer } from './customer-merge-transfer.service';
import { CustomerMergeError } from '../domain/merge/customer-merge.errors';
import {
  businessProfileReadiness,
  classifyExecutableCase,
  requireLiveParticipants,
  requireTransferableBusinessProfile,
  type MergeExecutionDisposition,
} from '../domain/merge/customer-merge-execution.policy';
import { requireMergeCase } from '../domain/merge/customer-merge.policy';
import {
  CUSTOMER_MERGE_CASE_REPOSITORY,
  type CustomerMergeCase,
  type CustomerMergeCaseId,
  type CustomerMergeCaseRepository,
} from '../domain/repositories/customer-merge-case.repository';
import {
  CUSTOMER_MERGE_EVENT_REPOSITORY,
  type CustomerMergeEventRepository,
} from '../domain/repositories/customer-merge-event.repository';
import {
  CUSTOMER_MERGE_EXECUTION_PORT,
  type CustomerMergeExecutionPort,
} from '../domain/repositories/customer-merge-execution.port';
import { AuditClock } from '../../../platform/audit-context/audit-clock';

/** What one execute request did. The case id is the caller's own. */
export interface CustomerMergeExecutionResult {
  readonly mergeCase: CustomerMergeCase;
  readonly disposition: MergeExecutionDisposition;
}

@Injectable()
export class ExecuteCustomerMerge {
  constructor(
    @Inject(CUSTOMER_MERGE_CASE_REPOSITORY)
    private readonly cases: CustomerMergeCaseRepository,
    @Inject(CUSTOMER_MERGE_EXECUTION_PORT)
    private readonly customerOwned: CustomerMergeExecutionPort,
    @Inject(CUSTOMER_MERGE_EVENT_REPOSITORY)
    private readonly events: CustomerMergeEventRepository,
    private readonly transfer: CustomerMergeTransfer,
    private readonly transactions: TransactionManager,
    private readonly clock: AuditClock,
    private readonly audit: CustomerMergeAuditRecorder,
  ) {}

  async execute(mergeCaseId: CustomerMergeCaseId): Promise<CustomerMergeExecutionResult> {
    return this.transactions.runInTransaction(async () => {
      const locked = requireMergeCase(await this.cases.lockById(mergeCaseId));
      const disposition = classifyExecutableCase(locked);

      if (disposition === 'ALREADY_EXECUTED') {
        // The whole replay contract, and it is an early return rather than a
        // guarded no-op further down: nothing below this line runs, so there is
        // no second transfer, no second revocation, no duplicate event and no
        // duplicate audit row. The transaction commits having written nothing.
        return { mergeCase: locked, disposition };
      }

      return { mergeCase: await this.merge(locked), disposition };
    });
  }

  /** Steps 3–7. Reached only for a `REQUESTED` case, under its row lock. */
  private async merge(mergeCase: CustomerMergeCase): Promise<CustomerMergeCase> {
    const { survivorCustomerId, loserCustomerId } = mergeCase;

    const locked = await this.customerOwned.lockParticipants(survivorCustomerId, loserCustomerId);
    requireLiveParticipants(locked.survivor, locked.loser);

    const profiles = await this.customerOwned.lockBusinessProfileOwnership(
      survivorCustomerId,
      loserCustomerId,
    );
    // Fail closed, and here — before the first destructive statement. Reaching
    // CST-051 mid-transfer would unwind the same work, but the operator would
    // learn about it from a rolled-back merge rather than from a refusal.
    requireTransferableBusinessProfile(
      businessProfileReadiness(profiles.loserHasProfile, profiles.survivorHasProfile),
    );

    const steps = await this.transfer.perform({
      mergeCaseId: mergeCase.id,
      survivorCustomerId,
      loserCustomerId,
    });
    await this.events.append(steps);

    // One instant for the transition and its audit row, so the case's
    // `decided_at` and the evidence beside it cannot differ by a query.
    const executed = await this.cases.execute(mergeCase.id, this.clock.now());
    if (executed === undefined) {
      // Unreachable while this transaction holds the case's row lock, and kept
      // for the same reason the reject path keeps its twin: a transition that
      // silently matched nothing must never be reported as a merge.
      throw new CustomerMergeError('MERGE_CASE_NOT_EXECUTABLE');
    }

    await this.audit.recordExecuted({
      mergeCaseId: executed.id,
      survivorCustomerId: executed.survivorCustomerId,
      loserCustomerId: executed.loserCustomerId,
    });
    return executed;
  }
}
