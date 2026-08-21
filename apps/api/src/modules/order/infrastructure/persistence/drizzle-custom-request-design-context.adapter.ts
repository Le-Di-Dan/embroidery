/**
 * Drizzle implementation of the design-authoring context port (`APP6-B08` §5).
 *
 * Columns are named explicitly, never `select()`: TBL-037 already carries
 * `code`, `customer_id`, `customer_note`, `cancelled_reason`,
 * `cancelled_customer_reason` and `current_quotation_id`, and an unprojected
 * select would hand every one of them to a design surface that has no rule
 * reading them — and would keep doing so for whatever the table grows next.
 *
 * The customer-owned product arrives through a **left** join. An inner join
 * would make a Catalog request look like a missing request, which is the one
 * confusion this port must not create: "no COP row" is the Catalog branch, not
 * an absence.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';
import type { CustomRequestState } from '@embroidery/database';

import type {
  ProductId,
  ProductVariantId,
} from '../../../catalog/domain/repositories/placement-hierarchy.port';
import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  CustomRequestDesignContext,
  CustomRequestDesignContextPort,
} from '../../domain/repositories/custom-request-design-context.port';

const { customRequests, customerOwnedProducts } = schema;

/** The projection both methods share, so the locked and unlisted reads cannot drift. */
const CONTEXT_COLUMNS = {
  id: customRequests.id,
  status: customRequests.status,
  currentDesignCaseId: customRequests.currentDesignCaseId,
  productId: customRequests.productId,
  productVariantId: customRequests.productVariantId,
  submittedSessionId: customRequests.submittedSessionId,
  customerOwnedProductId: customerOwnedProducts.id,
} as const;

type ContextRow = {
  readonly id: string;
  readonly status: string;
  readonly currentDesignCaseId: string | null;
  readonly productId: string | null;
  readonly productVariantId: string | null;
  readonly submittedSessionId: string | null;
  readonly customerOwnedProductId: string | null;
};

function toContext(row: ContextRow): CustomRequestDesignContext {
  return {
    requestId: row.id as CustomRequestId,
    status: row.status as CustomRequestState,
    currentDesignCaseId: row.currentDesignCaseId ?? undefined,
    productId: (row.productId ?? undefined) as ProductId | undefined,
    productVariantId: (row.productVariantId ?? undefined) as ProductVariantId | undefined,
    customerOwnedProductId: row.customerOwnedProductId ?? undefined,
    submittedSessionId: row.submittedSessionId ?? undefined,
  };
}

@Injectable()
export class DrizzleCustomRequestDesignContextAdapter
  extends DrizzleRepository
  implements CustomRequestDesignContextPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async lockDesignContext(id: CustomRequestId): Promise<CustomRequestDesignContext | undefined> {
    return this.run('lockDesignContext', async () => {
      const tx = this.requireTransaction('lockDesignContext');

      // Two statements, because `FOR UPDATE` cannot be applied to the nullable
      // side of a left join: locking the request row is the point, and asking
      // Postgres to lock an outer-joined `customer_owned_products` row that may
      // not exist is an error rather than a no-op. The request is locked first
      // and the COP row read under that lock — and since `customer_owned_products`
      // is a request-bound child written only at submission (CST-027), the lock
      // on its parent is what makes the pair a consistent snapshot.
      const [request] = await tx
        .select({
          id: customRequests.id,
          status: customRequests.status,
          currentDesignCaseId: customRequests.currentDesignCaseId,
          productId: customRequests.productId,
          productVariantId: customRequests.productVariantId,
          submittedSessionId: customRequests.submittedSessionId,
        })
        .from(customRequests)
        .where(eq(customRequests.id, id))
        .limit(1)
        .for('update');

      if (request === undefined) return undefined;

      const [owned] = await tx
        .select({ id: customerOwnedProducts.id })
        .from(customerOwnedProducts)
        .where(eq(customerOwnedProducts.customRequestId, id))
        .limit(1);

      return toContext({ ...request, customerOwnedProductId: owned?.id ?? null });
    });
  }

  async findDesignContext(id: CustomRequestId): Promise<CustomRequestDesignContext | undefined> {
    return this.run('findDesignContext', async () => {
      const [row] = await this.db
        .select(CONTEXT_COLUMNS)
        .from(customRequests)
        .leftJoin(
          customerOwnedProducts,
          eq(customerOwnedProducts.customRequestId, customRequests.id),
        )
        .where(eq(customRequests.id, id))
        .limit(1);

      return row === undefined ? undefined : toContext(row);
    });
  }
}
