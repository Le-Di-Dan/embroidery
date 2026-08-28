/**
 * Drizzle implementation of the TBL-009 merge-case lifecycle (`APP10-B02`).
 *
 * Three statements: one INSERT, two guarded reads and one guarded UPDATE. There
 * is no statement here that touches `customers`, `customer_contact_points`,
 * `secure_access_grants` or `customer_merge_events` — the destructive half of
 * merge is `APP10-B03`'s, and this class has nothing it could reach it with.
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

/** The state a case is born in, and the only one a rejection may leave. */
const REQUESTED = 'REQUESTED';
const REJECTED = 'REJECTED';

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
}
