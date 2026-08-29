/**
 * CTX-CUS's three counts for the merge consequence preview (`APP10-B02` §8).
 *
 * Three COUNTs and no row. `normalized_value`, `display_value`, `token_hash`,
 * `company_name`, `tax_code` and `billing_contact` are never selected, so the
 * projection cannot carry a contact, a credential digest or a billing address —
 * the same construction `drizzle-admin-customer-summary.adapter.ts` uses, taken
 * one step further because a number needs no masking at all.
 *
 * No transaction, no write, no lock. Counting is not an action, and the numbers
 * are advisory: `APP10-B03` re-reads these tables inside the transaction that
 * moves them.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, count, eq } from 'drizzle-orm';

import type {
  CustomerMergePreviewPort,
  CustomerOwnedReferenceCounts,
} from '../../domain/repositories/customer-merge-preview.port';

const { businessProfiles, customerContactPoints, secureAccessGrants } = schema;

/** The one grant state a merge revokes (DB3 §4 step 4). */
const ACTIVE_GRANT = 'ACTIVE';

@Injectable()
export class DrizzleCustomerMergePreviewAdapter
  extends DrizzleRepository
  implements CustomerMergePreviewPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async countOwnedReferences(customerId: string): Promise<CustomerOwnedReferenceCounts> {
    return this.run('countOwnedReferences', async () => {
      // Three statements rather than one join: the tables are related only
      // through the customer, so joining them would multiply rows and the
      // counts would be products rather than totals.
      const [contacts] = await this.db
        .select({ total: count() })
        .from(customerContactPoints)
        // Every row, deactivated included — see the port's note. A retired
        // contact still points at this customer and still has to move.
        .where(eq(customerContactPoints.customerId, customerId));

      const [grants] = await this.db
        .select({ total: count() })
        .from(secureAccessGrants)
        .where(
          and(
            eq(secureAccessGrants.customerId, customerId),
            eq(secureAccessGrants.status, ACTIVE_GRANT),
          ),
        );

      const [profiles] = await this.db
        .select({ total: count() })
        .from(businessProfiles)
        .where(eq(businessProfiles.customerId, customerId));

      return {
        contactPoints: contacts?.total ?? 0,
        activeSecureAccessGrants: grants?.total ?? 0,
        // CST-051 caps this at one, so the count is a presence test.
        businessProfile: (profiles?.total ?? 0) > 0,
      };
    });
  }

  /**
   * One presence test, for the survivor side of the collision check.
   *
   * `customer_id` is the only column selected — `company_name`, `tax_code` and
   * `billing_contact` are PII, and a readiness flag needs none of them.
   */
  async hasBusinessProfile(customerId: string): Promise<boolean> {
    return this.run('hasBusinessProfile', async () => {
      const [row] = await this.db
        .select({ customerId: businessProfiles.customerId })
        .from(businessProfiles)
        .where(eq(businessProfiles.customerId, customerId))
        .limit(1);

      return row !== undefined;
    });
  }
}
