/**
 * Drizzle implementation of the approval-facts port (`APP6-B11` §11).
 *
 * Two statements, both narrowly projected. The quantity is summed by PostgreSQL
 * — `coalesce(sum(quantity), 0)` so a request with no lines answers `0` rather
 * than `NULL`, which is the difference between "this request orders nothing"
 * (a refusal upstream) and "this column could not be read" (a crash here).
 *
 * The COP name arrives from its own `limit 1` read rather than a join onto the
 * aggregate: CST-027 already makes at most one row possible per request, and an
 * aggregate over a join would multiply the quantity lines by it the day that
 * stops being true.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq, sql } from 'drizzle-orm';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  CustomRequestApprovalFacts,
  CustomRequestApprovalFactsPort,
} from '../../domain/repositories/custom-request-approval-facts.port';

const { customRequests, customRequestQuantityBreakdowns, customerOwnedProducts } = schema;

@Injectable()
export class DrizzleCustomRequestApprovalFactsAdapter
  extends DrizzleRepository
  implements CustomRequestApprovalFactsPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findApprovalFacts(id: CustomRequestId): Promise<CustomRequestApprovalFacts | undefined> {
    return this.run('findApprovalFacts', async () => {
      // The request's own existence is established first and separately: a
      // missing request and a request with no quantity lines are different
      // facts, and a bare aggregate cannot tell them apart — `sum` over no rows
      // is `NULL` in both cases.
      const [request] = await this.db
        .select({ id: customRequests.id })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1);
      if (request === undefined) {
        return undefined;
      }

      const [totals] = await this.db
        .select({
          quantityTotal: sql<string>`coalesce(sum(${customRequestQuantityBreakdowns.quantity}), 0)`,
        })
        .from(customRequestQuantityBreakdowns)
        .where(eq(customRequestQuantityBreakdowns.customRequestId, id));

      const [owned] = await this.db
        .select({ name: customerOwnedProducts.name })
        .from(customerOwnedProducts)
        .where(eq(customerOwnedProducts.customRequestId, id))
        .limit(1);

      return {
        // `sum` over `integer` is `bigint` in PostgreSQL and arrives as a
        // string. Parsed here, at the one place that knows it is a count of
        // garments rather than money — `Number` on a monetary `numeric` is the
        // rounding defect `APP6-B01` records, and this is deliberately not that.
        quantityTotal: Number(totals?.quantityTotal ?? '0'),
        customerOwnedProductName: owned?.name ?? undefined,
      };
    });
  }
}
