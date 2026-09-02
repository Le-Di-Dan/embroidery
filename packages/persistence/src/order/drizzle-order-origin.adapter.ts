/**
 * The order-origin read behind {@link OrderOriginPort} (`APP12-B02`).
 *
 * One column of one row. No lock: `tg_orders__origin_immutable` rejects every
 * `UPDATE` of `orders.origin`, so there is no writer to race — locking here
 * would only widen the window the reservation transaction holds the `orders`
 * row for, and would put a second `orders` lock in front of the `sku_stocks`
 * anchor for no gain (`DB8_LOCK_ORDER_MATRIX.md` §1).
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { OrderOrigin } from '@embroidery/database';
import { eq } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';
import type { OrderOriginPort } from './order-origin.port';

const { orders } = schema;

@Injectable()
export class DrizzleOrderOriginAdapter extends DrizzleRepository implements OrderOriginPort {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async originOf(orderId: string): Promise<OrderOrigin | undefined> {
    return this.run('originOf', async () => {
      const [row] = await this.db
        .select({ origin: orders.origin })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      return row === undefined ? undefined : (row.origin as OrderOrigin);
    });
  }
}
