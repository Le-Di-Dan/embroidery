/**
 * Drizzle implementation of the deposit-context port (`APP7-B03` §8).
 *
 * Three columns, named explicitly. `select()` with no projection would return
 * whatever TBL-043 grows next — which today already means `customer_id`,
 * `total_amount`, `current_approval_snapshot_id`, `hold_reason` and
 * `cancelled_reason` — so listing the three is what makes "nothing else is
 * retrieved" a property of the statement rather than of a mapper someone could
 * later edit.
 *
 * `uq_orders__request` makes the lookup single-valued physically, so there is no
 * ordering rule here to get wrong and no "latest order" heuristic to invent.
 *
 * No write, no transaction, no lock: `DatabaseModule`'s executor runs the one
 * `select`. Reading an order changes nothing, and this class has no method that
 * could.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { eq } from 'drizzle-orm';

import type { CustomRequestId } from '../../domain/repositories/custom-request.repository';
import type {
  OrderDepositContext,
  OrderDepositContextPort,
} from '../../domain/repositories/order-deposit-context.port';

const { orders } = schema;

@Injectable()
export class DrizzleOrderDepositContextAdapter
  extends DrizzleRepository
  implements OrderDepositContextPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findOrderForRequest(requestId: CustomRequestId): Promise<OrderDepositContext | undefined> {
    return this.run('findOrderForRequest', async () => {
      const [row] = await this.db
        .select({ id: orders.id, code: orders.code, status: orders.status })
        .from(orders)
        .where(eq(orders.customRequestId, requestId))
        .limit(1);

      if (row === undefined) {
        return undefined;
      }
      return { id: row.id, code: row.code, status: row.status as OrderState };
    });
  }
}
