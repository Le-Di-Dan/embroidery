/**
 * The destructive steps of one merge, in order (`APP10-B03` §11–§16).
 *
 * Called only by {@link ExecuteCustomerMerge}, and only from **inside** its
 * transaction: every collaborator below joins the ambient boundary, so this
 * class opens none of its own. Splitting it out of the use case keeps two
 * different jobs apart — the use case decides *whether* a merge may run and
 * records that it did; this decides *what moving ownership means* — and keeps
 * either file readable on its own.
 *
 * ### The order is the product rule, not an implementation detail
 *
 * 1. **contacts** — demote the loser's primary if the survivor has one, then
 *    move every row;
 * 2. **grants** — revoke the loser's ACTIVE grants;
 * 3. **ownership** — custom requests, orders, uploaded assets, business profile;
 * 4. **tombstone** — last, and only after every transfer above succeeded.
 *
 * The tombstone is last because it is the claim that the loser has nothing live
 * left. Writing it first and then failing to move an order would leave a live
 * order owned by a record nothing resolves through — which is the exact
 * corruption `APP10-B03` exists to prevent. Everything here runs in one
 * transaction, so a failure at any step unwinds all of them; the ordering is
 * what makes the *intent* of each step honest, and the transaction is what makes
 * the outcome atomic.
 *
 * ### Every count comes from the statement that changed the rows
 *
 * Not one number here is taken from the `APP10-B02` consequence preview. A
 * preview is recomputed on every read and is advisory by construction; rows
 * arrive and leave between opening a case and executing it, and merge evidence
 * that recorded a stale figure would be a record of what somebody once expected
 * rather than of what happened.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';

import {
  ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT,
  type AssetCustomerOwnershipTransferPort,
} from '../../asset/domain/repositories/customer-ownership-transfer.port';
import {
  ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT,
  type OrderingCustomerOwnershipTransferPort,
} from '../../order/domain/repositories/customer-ownership-transfer.port';
import { CustomerMergeError } from '../domain/merge/customer-merge.errors';
import {
  MERGE_GRANT_REVOKE_REASON,
  planPrimaryContactDemotions,
} from '../domain/merge/customer-merge-execution.policy';
import type { AppendMergeEventInput } from '../domain/repositories/customer-merge-event.repository';
import type { CustomerMergeCaseId } from '../domain/repositories/customer-merge-case.repository';
import {
  CUSTOMER_MERGE_EXECUTION_PORT,
  type CustomerMergeExecutionPort,
} from '../domain/repositories/customer-merge-execution.port';
import {
  SECURE_ACCESS_GRANT_REPOSITORY,
  type SecureAccessGrantRepository,
} from '../domain/repositories/secure-access-grant.repository';
import type { CustomerId } from '../domain/repositories/customer.repository';

/**
 * The catalogued codes a merge may provoke, and what each one means here.
 *
 * `CONSTRAINT_MEANINGS` already maps the three uniqueness arbiters to these
 * codes, so no constraint name reaches application code — only its business
 * meaning. Reaching one of them is a **fail-closed** outcome: the transaction is
 * unwound and the operator is told which of the two identity facts could not be
 * reconciled, rather than the merge deleting a row to make the transfer fit.
 */
const PRIMARY_CONTACT_ALREADY_SET = 'PRIMARY_CONTACT_ALREADY_SET';
const CONTACT_ALREADY_VERIFIED = 'CONTACT_ALREADY_VERIFIED';
const BUSINESS_PROFILE_ALREADY_EXISTS = 'BUSINESS_PROFILE_ALREADY_EXISTS';

/** The one grant state a merge revokes (DB3 §4 step 4). */
const ACTIVE = 'ACTIVE';

export interface MergeTransferCommand {
  readonly mergeCaseId: CustomerMergeCaseId;
  readonly survivorCustomerId: CustomerId;
  readonly loserCustomerId: CustomerId;
}

@Injectable()
export class CustomerMergeTransfer {
  constructor(
    @Inject(CUSTOMER_MERGE_EXECUTION_PORT)
    private readonly customerOwned: CustomerMergeExecutionPort,
    @Inject(SECURE_ACCESS_GRANT_REPOSITORY)
    private readonly grants: SecureAccessGrantRepository,
    @Inject(ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT)
    private readonly ordering: OrderingCustomerOwnershipTransferPort,
    @Inject(ASSET_CUSTOMER_OWNERSHIP_TRANSFER_PORT)
    private readonly assets: AssetCustomerOwnershipTransferPort,
  ) {}

  /**
   * Performs the merge and returns the evidence it earned.
   *
   * The return value is the ordered `customer_merge_events` sequence, not a
   * report: the caller appends exactly these rows, so a step that moved nothing
   * still produces its row and the history can be reconciled category by
   * category.
   */
  async perform(command: MergeTransferCommand): Promise<readonly AppendMergeEventInput[]> {
    try {
      return await this.transfer(command);
    } catch (error: unknown) {
      throw translateCollision(error);
    }
  }

  private async transfer(command: MergeTransferCommand): Promise<readonly AppendMergeEventInput[]> {
    const { survivorCustomerId, loserCustomerId } = command;
    const step = eventFactory(command);

    const contacts = await this.moveContacts(survivorCustomerId, loserCustomerId);
    const revokedGrants = await this.revokeLoserGrants(loserCustomerId);
    const ordering = await this.ordering.repointCustomer(loserCustomerId, survivorCustomerId);
    const uploadedAssets = await this.assets.repointUploader(loserCustomerId, survivorCustomerId);
    const businessProfiles = await this.customerOwned.moveBusinessProfile(
      loserCustomerId,
      survivorCustomerId,
    );

    // Last, and only now: the loser has nothing live left to own.
    const tombstoned = await this.customerOwned.tombstone(loserCustomerId, survivorCustomerId);
    if (!tombstoned) {
      // The guarded UPDATE matched nothing, so another transaction tombstoned
      // this customer between the locked read and here. It cannot happen while
      // this transaction holds the row lock, which is exactly why it is a
      // refusal and not a silent success: reporting a merge whose tombstone was
      // written by somebody else would attribute it to the wrong case.
      throw new CustomerMergeError('LOSER_ALREADY_MERGED');
    }

    return [
      step('CONTACT_MOVE', 'customer_contact_points', contacts.moved, contacts.primaryDemoted),
      step('GRANT_REVOKE', 'secure_access_grants', revokedGrants),
      step('OWNERSHIP_TRANSFER', 'custom_requests', ordering.customRequests),
      step('OWNERSHIP_TRANSFER', 'orders', ordering.orders),
      step('OWNERSHIP_TRANSFER', 'assets', uploadedAssets),
      step('OWNERSHIP_TRANSFER', 'business_profiles', businessProfiles),
      step('TOMBSTONE', 'customers', 1),
    ];
  }

  /**
   * Moves every contact of the loser, resolving primary uniqueness first.
   *
   * The demotion is decided from both customers' locked rows by a pure policy
   * function, and it changes `is_primary` and nothing else — no verification
   * instant, no source, no value, no `deactivated_at`. A merge inherits
   * verification evidence; it never re-earns or forges it.
   */
  private async moveContacts(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<{ readonly moved: number; readonly primaryDemoted: boolean }> {
    const locked = await this.customerOwned.lockContactPoints(survivorCustomerId, loserCustomerId);
    const demotions = planPrimaryContactDemotions(locked, survivorCustomerId, loserCustomerId);
    await this.customerOwned.demotePrimaryContacts(demotions);

    const moved = await this.customerOwned.moveContactPoints(loserCustomerId, survivorCustomerId);
    return { moved, primaryDemoted: demotions.length > 0 };
  }

  /**
   * Revokes every ACTIVE grant of the loser, with the canonical merge reason.
   *
   * Revoked, never repointed (DB3 §4 step 4): a secure link was issued to a
   * person for one request, and handing it to another identity would let a link
   * somebody already holds start opening a different customer's data. Already
   * `EXPIRED` or `REVOKED` grants are left exactly as they are — they open
   * nothing, and rewriting them would edit history to describe a withdrawal that
   * happened earlier and for another reason.
   *
   * Written through the delivered `SecureAccessGrantRepository`, which joins this
   * transaction, rather than through `RevokeSecureGrantUseCase`: that use case
   * opens a transaction and appends an Admin audit row of its own, so calling it
   * here would file one revocation event per grant against a merge and — worse —
   * would put a second transaction boundary inside an atomic merge.
   */
  private async revokeLoserGrants(loserCustomerId: CustomerId): Promise<number> {
    const all = await this.grants.listForCustomer(loserCustomerId);
    const active = all.filter((grant) => grant.status === ACTIVE);
    for (const grant of active) {
      await this.grants.revoke(grant.id, MERGE_GRANT_REVOKE_REASON);
    }
    return active.length;
  }
}

/** Builds one evidence row, so the six call sites cannot disagree about shape. */
function eventFactory(command: MergeTransferCommand) {
  return (
    stepKind: AppendMergeEventInput['stepKind'],
    subjectTable: string,
    affectedCount: number,
    primaryDemoted?: boolean,
  ): AppendMergeEventInput => ({
    mergeCaseId: command.mergeCaseId,
    stepKind,
    subjectTable,
    // The customer reference that moved, not one arbitrary row out of many.
    subjectId: command.loserCustomerId,
    targetCustomerId: command.survivorCustomerId,
    affectedCount,
    ...(primaryDemoted === undefined ? {} : { primaryDemoted }),
  });
}

/**
 * Turns a uniqueness arbiter's verdict into a bounded merge refusal.
 *
 * Anything else propagates untouched, so a `PersistenceError` this file does not
 * understand is not reshaped into a merge conflict the operator would act on.
 */
function translateCollision(error: unknown): unknown {
  if (!isPersistenceError(error)) {
    return error;
  }
  if (error.code === PRIMARY_CONTACT_ALREADY_SET || error.code === CONTACT_ALREADY_VERIFIED) {
    return new CustomerMergeError('MERGE_CONTACT_COLLISION');
  }
  if (error.code === BUSINESS_PROFILE_ALREADY_EXISTS) {
    return new CustomerMergeError('MERGE_BUSINESS_PROFILE_CONFLICT');
  }
  return error;
}
