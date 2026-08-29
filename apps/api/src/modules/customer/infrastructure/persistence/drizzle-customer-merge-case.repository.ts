/**
 * Drizzle implementation of the TBL-009 merge-case lifecycle (`APP10-B02`).
 *
 * One INSERT, three reads — one of them locking — and two guarded UPDATEs. There
 * is still no statement here that touches `customers`,
 * `customer_contact_points`, `secure_access_grants`, `business_profiles`,
 * `custom_requests`, `orders`, `assets` or `customer_merge_events`: the case
 * table is all this class can reach, and the merge itself is performed by
 * `APP10-B03`'s own ports.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, eq } from 'drizzle-orm';

import type {
  CustomerMergeCase,
  CustomerMergeCaseId,
  CustomerMergeCaseRepository,
  OpenCustomerMergeCaseInput,
} from '../../domain/repositories/customer-merge-case.repository';
import type { CustomerId } from '../../domain/repositories/customer.repository';
import { toMergeCase } from './customer-merge-case-row.mapper';

const { customerMergeCases } = schema;

/** The state a case is born in, and the only one either decision may leave. */
const REQUESTED = 'REQUESTED';
const REJECTED = 'REJECTED';
const EXECUTED = 'EXECUTED';

@Injectable()
export class DrizzleCustomerMergeCaseRepository
  extends DrizzleRepository
  implements CustomerMergeCaseRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async open(input: OpenCustomerMergeCaseInput): Promise<CustomerMergeCase> {
    return this.run('open', async () => {
      // Inside the caller's transaction, so the audit row and the case commit
      // together. The status is set here rather than accepted from the caller:
      // there is exactly one state a merge case may be created in.
      const tx = this.requireTransaction('open');
      const [row] = await tx
        .insert(customerMergeCases)
        .values({
          id: input.id,
          survivorCustomerId: input.survivorCustomerId,
          loserCustomerId: input.loserCustomerId,
          status: REQUESTED,
          reason: input.reason,
          requestedByAdminId: input.requestedByAdminId,
        })
        .returning();

      if (row === undefined) {
        // Unreachable in practice: a duplicate open pair is rejected by
        // `uq_customer_merge_cases__survivor_loser__requested` as a driver
        // error, not by an empty result. The branch exists so a silent
        // no-op could never be reported as a created case.
        throw new Error('Could not open the merge case.');
      }
      return toMergeCase(row);
    });
  }

  async findById(id: CustomerMergeCaseId): Promise<CustomerMergeCase | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db
        .select()
        .from(customerMergeCases)
        .where(eq(customerMergeCases.id, id))
        .limit(1);

      return row === undefined ? undefined : toMergeCase(row);
    });
  }

  /**
   * The case row under `FOR UPDATE` (`APP10-B03` §8).
   *
   * `.for('update')` rather than a plain read: this is the row two concurrent
   * executes contend on, and the lock is what makes the second one wait for the
   * first to commit instead of racing it into the same transfers.
   */
  async lockById(id: CustomerMergeCaseId): Promise<CustomerMergeCase | undefined> {
    return this.run('lockById', async () => {
      const tx = this.requireTransaction('lockById');
      const [row] = await tx
        .select()
        .from(customerMergeCases)
        .where(eq(customerMergeCases.id, id))
        .limit(1)
        .for('update');

      return row === undefined ? undefined : toMergeCase(row);
    });
  }

  async findOpenForPair(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<CustomerMergeCase | undefined> {
    return this.run('findOpenForPair', async () => {
      const [row] = await this.db
        .select()
        .from(customerMergeCases)
        .where(
          and(
            // The ordered pair, matching the CST-010 index exactly. `(A→B)` and
            // `(B→A)` are different cases, and this read must not conflate them.
            eq(customerMergeCases.survivorCustomerId, survivorCustomerId),
            eq(customerMergeCases.loserCustomerId, loserCustomerId),
            eq(customerMergeCases.status, REQUESTED),
          ),
        )
        .limit(1);

      return row === undefined ? undefined : toMergeCase(row);
    });
  }

  async reject(id: CustomerMergeCaseId, decidedAt: Date): Promise<CustomerMergeCase | undefined> {
    return this.run('reject', async () => {
      const tx = this.requireTransaction('reject');
      const [row] = await tx
        .update(customerMergeCases)
        .set({ status: REJECTED, decidedAt, updatedAt: new Date() })
        .where(
          and(
            eq(customerMergeCases.id, id),
            // The transition guard, in the statement. A case another request
            // rejected or executed in between matches nothing, so this returns
            // `undefined` instead of overwriting a decision already recorded.
            eq(customerMergeCases.status, REQUESTED),
          ),
        )
        .returning();

      return row === undefined ? undefined : toMergeCase(row);
    });
  }

  /**
   * The execution transition (`APP10-B03` §17).
   *
   * Identical in shape to {@link reject} and deliberately so: the same
   * `status = 'REQUESTED'` predicate in the statement, the same `undefined` for
   * a case decided in between. `reason` is absent from the `set` object, so the
   * open reason cannot be overwritten by an execution.
   */
  async execute(id: CustomerMergeCaseId, decidedAt: Date): Promise<CustomerMergeCase | undefined> {
    return this.run('execute', async () => {
      const tx = this.requireTransaction('execute');
      const [row] = await tx
        .update(customerMergeCases)
        .set({ status: EXECUTED, decidedAt, updatedAt: new Date() })
        .where(and(eq(customerMergeCases.id, id), eq(customerMergeCases.status, REQUESTED)))
        .returning();

      return row === undefined ? undefined : toMergeCase(row);
    });
  }
}
