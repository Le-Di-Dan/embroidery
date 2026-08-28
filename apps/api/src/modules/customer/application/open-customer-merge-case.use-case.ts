/**
 * Opens one `REQUESTED` customer merge case (`APP10-B02` §6).
 *
 * The whole of what this checkpoint's first operation does: prove the pair is
 * eligible, insert one row, and audit that an operator proposed the merge.
 * Nothing is transferred, nothing is revoked and nothing is tombstoned —
 * `APP10-B03` owns the transaction that performs a merge, and this class holds
 * no collaborator it could reach one with.
 *
 * ### Survivor and loser stay exactly as the operator stated them
 *
 * They are read separately, refused separately, and written in the order they
 * arrived. There is no branch here that swaps them, that picks the older
 * customer, that follows `merged_into_customer_id` to a live identity, or that
 * prefers the one with more orders. A merge is the deliberate join of two
 * identities an operator has already decided belong together (ADR-DB2-001 r5,
 * CC-27); a system that quietly corrected the choice would be taking the
 * decision away from them while appearing to record theirs.
 *
 * ### The pre-check is a courtesy; CST-010 is the arbiter
 *
 * {@link OpenCustomerMergeCase.open} reads for an existing open case first, so
 * the ordinary duplicate is a clean refusal rather than a caught driver error.
 * That read cannot be the guarantee: two requests can both pass it before either
 * inserts. `uq_customer_merge_cases__survivor_loser__requested` rejects the
 * second INSERT outright, and the catch below turns that rejection into exactly
 * the refusal the pre-check gives — so a caller cannot tell whether it lost a
 * race, and does not need to.
 *
 * The transaction exists for the same reason B01's does: the audit row must land
 * with the case or not at all.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { CustomerMergeAuditRecorder } from './customer-merge-audit.recorder';
import { CustomerMergeError } from '../domain/merge/customer-merge.errors';
import {
  requireEligibleLoser,
  requireEligibleSurvivor,
  requireNoOpenCase,
} from '../domain/merge/customer-merge.policy';
import {
  CUSTOMER_MERGE_CASE_REPOSITORY,
  type CustomerMergeCase,
  type CustomerMergeCaseId,
  type CustomerMergeCaseRepository,
} from '../domain/repositories/customer-merge-case.repository';
import {
  CUSTOMER_REPOSITORY,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';
import { RequestContextService } from '../../../platform/request-context/request-context.service';

/**
 * The catalogued meaning of the CST-010 partial unique.
 *
 * `CONSTRAINT_MEANINGS` in `@embroidery/database` already maps
 * `uq_customer_merge_cases__survivor_loser__requested` to this code, so the
 * constraint name never reaches application code — only its business meaning
 * does.
 */
const MERGE_CASE_ALREADY_OPEN = 'MERGE_CASE_ALREADY_OPEN';

export interface OpenCustomerMergeCaseCommand {
  readonly survivorCustomerId: CustomerId;
  readonly loserCustomerId: CustomerId;
  /** Trimmed and length-bounded by the request schema before it arrives. */
  readonly reason: string;
}

@Injectable()
export class OpenCustomerMergeCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(CUSTOMER_MERGE_CASE_REPOSITORY)
    private readonly cases: CustomerMergeCaseRepository,
    private readonly transactions: TransactionManager,
    private readonly requestContext: RequestContextService,
    private readonly audit: CustomerMergeAuditRecorder,
  ) {}

  async open(command: OpenCustomerMergeCaseCommand): Promise<CustomerMergeCase> {
    const requestedByAdminId = this.currentAdminId();

    return this.transactions.runInTransaction(async () => {
      // Read separately so the two refusals stay separate. Neither result is
      // used to choose a survivor — only to prove the operator's choice is a
      // live identity.
      requireEligibleSurvivor(await this.customers.findById(command.survivorCustomerId));
      requireEligibleLoser(await this.customers.findById(command.loserCustomerId));
      requireNoOpenCase(
        await this.cases.findOpenForPair(command.survivorCustomerId, command.loserCustomerId),
      );

      const opened = await this.insert(command, requestedByAdminId);
      await this.audit.recordOpened({
        mergeCaseId: opened.id,
        survivorCustomerId: opened.survivorCustomerId,
        loserCustomerId: opened.loserCustomerId,
      });
      return opened;
    });
  }

  private async insert(
    command: OpenCustomerMergeCaseCommand,
    requestedByAdminId: string,
  ): Promise<CustomerMergeCase> {
    try {
      return await this.cases.open({
        id: newId() as CustomerMergeCaseId,
        survivorCustomerId: command.survivorCustomerId,
        loserCustomerId: command.loserCustomerId,
        reason: command.reason,
        requestedByAdminId,
      });
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.code === MERGE_CASE_ALREADY_OPEN) {
        // The race the pre-check cannot win. Same failure, so the loser of a
        // concurrent open reads exactly like a caller who asked twice.
        throw new CustomerMergeError('MERGE_CASE_ALREADY_OPEN');
      }
      throw error;
    }
  }

  /**
   * The acting Admin, from the bound session actor.
   *
   * Never from the body: `requested_by_admin_id` is the attribution of an
   * exceptional, admin-only decision, and a caller-supplied one would let an
   * operator file a merge against a colleague. Resolved before the transaction
   * opens so an unattributable request costs no database work.
   */
  private currentAdminId(): string {
    const actor = this.requestContext.requireActor();
    if (actor.kind !== 'ADMIN') {
      throw new Error('Opening a customer merge case requires an authenticated Admin actor.');
    }
    return actor.adminId;
  }
}
