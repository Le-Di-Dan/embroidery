/**
 * Drizzle implementation of the order reservation summary (`APP8-B03` §8.4).
 *
 * One statement, two tables: `inventory_reservations` joined to `sku_stocks`
 * for the SKU id an operator recognises. No ledger, no soft hold, no
 * availability arithmetic and no `quantity_on_hand` — a production screen asks
 * what is committed to *this order*, not what the SKU's stock looks like, and a
 * statement that never selects those columns is redaction nothing downstream
 * can forget.
 *
 * **No lock, no transaction, no `FOR UPDATE`.** That is deliberate and is the
 * whole reason this sits behind its own port: `FU-APP8-B02-02` requires a
 * decision-grade reservation read to hold the `sku_stocks` anchor (GRD-014),
 * and this one is display-only. Taking the anchor lock here would make an Admin
 * screen refresh contend with the `payment.verified` reservation worker for the
 * same row.
 *
 * Ordering is `(sku_stock_id, id)`: `CST-016` allows at most one `RESERVED` row
 * per `(order, anchor)` but any number of terminal ones, so the anchor alone is
 * not a total order and the id completes it. Deterministic output is what makes
 * the detail response stable between two reads that changed nothing.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { InventoryReservationState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq } from 'drizzle-orm';

import type {
  OrderReservationRow,
  OrderReservationSummaryPort,
} from '../../domain/repositories/order-reservation-summary.port';

const { inventoryReservations, skuStocks } = schema;

@Injectable()
export class DrizzleOrderReservationSummaryAdapter
  extends DrizzleRepository
  implements OrderReservationSummaryPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async listForOrder(orderId: string): Promise<OrderReservationRow[]> {
    return this.run('listForOrder', async () => {
      const rows = await this.db
        .select({
          reservationId: inventoryReservations.id,
          skuStockId: inventoryReservations.skuStockId,
          skuId: skuStocks.skuId,
          quantity: inventoryReservations.quantity,
          status: inventoryReservations.status,
        })
        .from(inventoryReservations)
        // `fk_inventory_reservations__sku_stock_id` is `NOT NULL` (REL-031), so
        // this inner join can drop no reservation row.
        .innerJoin(skuStocks, eq(skuStocks.id, inventoryReservations.skuStockId))
        .where(eq(inventoryReservations.orderId, orderId))
        .orderBy(asc(inventoryReservations.skuStockId), asc(inventoryReservations.id));

      return rows.map((row) => ({
        reservationId: row.reservationId,
        skuStockId: row.skuStockId,
        skuId: row.skuId,
        quantity: row.quantity,
        status: row.status as InventoryReservationState,
      }));
    });
  }
}
