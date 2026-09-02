/**
 * Drizzle implementation of the customer Ready-Made order projection
 * (`APP12-B04` §11, §12).
 *
 * Three reads, all with **explicit column lists**, on the rule
 * `DrizzleOrderDepositContextAdapter` records: `select()` with no projection
 * returns whatever the table grows next, which for `orders` today already means
 * `customer_id`, `custom_request_id`, `accepted_quotation_version_id`,
 * `current_approval_snapshot_id`, `hold_reason` and `cancelled_reason`. Naming
 * the columns is what makes "nothing else is retrieved" a property of the
 * statement rather than of a mapper someone could later edit.
 *
 * ## Why three statements and not one join
 *
 * `orders`, `order_items` and `shipping_details` are one-to-one, one-to-many and
 * zero-or-one respectively. A single join would multiply the order row by the
 * line count and make the shipping detail's absence indistinguishable from a
 * NULL column, so the composition would have to be un-done in JavaScript
 * anyway. Three small indexed lookups on primary and foreign keys are cheaper to
 * read and impossible to get subtly wrong.
 *
 * No write, no transaction, no lock: `DatabaseModule`'s executor runs plain
 * selects. Reading an order changes nothing, and this class has no method that
 * could.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import type { OrderState } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { asc, eq } from 'drizzle-orm';

import type {
  ReadyMadeOrderAccessRepository,
  ReadyMadeOrderAccessView,
  ReadyMadeOrderDeliveryView,
  ReadyMadeOrderLineView,
} from '../../domain/repositories/ready-made-order-access.repository';

const { orders, orderItems, shippingDetails } = schema;

/** `orders.origin` — this projection serves the Ready-Made branch only. */
const READY_MADE = 'READY_MADE';

@Injectable()
export class DrizzleReadyMadeOrderAccessRepository
  extends DrizzleRepository
  implements ReadyMadeOrderAccessRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findForCustomer(orderId: string): Promise<ReadyMadeOrderAccessView | undefined> {
    return this.run('findForCustomer', async () => {
      const [order] = await this.db
        .select({
          id: orders.id,
          code: orders.code,
          origin: orders.origin,
          status: orders.status,
          currencyCode: orders.currencyCode,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      // A custom order and an absent one are one non-answer, exactly as
      // `loadReadyMadeForUpdate` treats them: this projection describes a
      // lifecycle a custom order does not have.
      if (order === undefined || order.origin !== READY_MADE) {
        return undefined;
      }

      const line = await this.readLine(orderId);
      if (line === undefined) {
        // A Ready-Made order has exactly one line, written in the same
        // transaction as the order (`APP12-B02`). None means the row and its
        // child disagree, and rendering an order with no item would be
        // presenting a purchase with nothing bought.
        return undefined;
      }

      const delivery = await this.readDelivery(orderId);

      return {
        id: order.id,
        code: order.code,
        status: order.status as OrderState,
        currencyCode: order.currencyCode,
        // The single line's own frozen total. `APP12-P01` locks Ready-Made
        // checkout to one SKU and `readLine` refuses an order carrying more, so
        // this is the subtotal rather than a term of it — no addition happens
        // anywhere on this path, which is what keeps a shipping fee from being
        // folded into it (`BR-027`).
        //
        // `orders.total_amount` is deliberately not the source: it holds the
        // merchandise subtotal only until the first fee is confirmed and the
        // payable total afterwards (`APP12-B03` §14), so reading it would
        // relabel the subtotal the moment an operator priced delivery.
        merchandiseSubtotal: line.lineTotalAmount,
        line,
        delivery,
        createdAt: order.createdAt,
      };
    });
  }

  /**
   * The order's single frozen line.
   *
   * `APP12-P01` locks Ready-Made checkout to one SKU, and this reads **two** to
   * prove it rather than assume it. A second line would mean the caller's
   * `merchandiseSubtotal` — this line's own total — under-reports what the
   * customer bought, so the projection refuses instead of publishing a subtotal
   * that is missing an item. `limit(1)` would have hidden exactly that.
   *
   * Ordered by `position` so the answer cannot depend on physical row layout.
   * `sku_id`, `approval_snapshot_id`, `customer_owned_product_id` and the row's
   * own id are not selected — none is a customer fact, and a column that never
   * arrives cannot leak.
   */
  private async readLine(orderId: string): Promise<ReadyMadeOrderLineView | undefined> {
    const rows = await this.db
      .select({
        productName: orderItems.productName,
        variantLabel: orderItems.variantLabel,
        sizeLabel: orderItems.sizeLabel,
        quantity: orderItems.quantity,
        unitPriceAmount: orderItems.unitPriceAmount,
        lineTotalAmount: orderItems.lineTotalAmount,
        currencyCode: orderItems.currencyCode,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.position))
      .limit(2);

    const row = rows[0];
    if (row === undefined || rows.length !== 1) {
      return undefined;
    }
    return {
      productName: row.productName,
      // An absent attribute stays absent. `variant_label` and `size_label` are
      // genuinely nullable, and mapping a NULL to `'N/A'` or an empty string
      // would be inventing a fact about the order rather than reporting one.
      variantLabel: row.variantLabel ?? undefined,
      sizeLabel: row.sizeLabel ?? undefined,
      quantity: row.quantity,
      // Copied, never parsed. There is no `Number()` anywhere in this file: a
      // `numeric(14,2)` that became a float here would be rounded on the
      // customer's payment screen.
      unitPriceAmount: row.unitPriceAmount,
      lineTotalAmount: row.lineTotalAmount,
      currencyCode: row.currencyCode,
    };
  }

  /**
   * Where the order is going, and what delivery costs so far.
   *
   * `undefined` when no detail row exists, which `APP12-B02` makes impossible
   * for a committed order — it writes one in the creation transaction — and
   * which is therefore reported as an absence rather than substituted. The fee
   * is `undefined` while unpriced and is never defaulted to `'0.00'`: `BR-027`
   * makes "not priced yet" and "free" different answers.
   *
   * `carrier_name`, `tracking_code`, `fulfillment_note`, `status`, `frozen_at`
   * and `country_code` are not selected.
   */
  private async readDelivery(orderId: string): Promise<ReadyMadeOrderDeliveryView | undefined> {
    const [row] = await this.db
      .select({
        recipientName: shippingDetails.recipientName,
        recipientPhone: shippingDetails.recipientPhone,
        addressLine: shippingDetails.addressLine,
        ward: shippingDetails.ward,
        district: shippingDetails.district,
        province: shippingDetails.province,
        feeAmount: shippingDetails.feeAmount,
      })
      .from(shippingDetails)
      .where(eq(shippingDetails.orderId, orderId))
      .limit(1);

    if (row === undefined) {
      return undefined;
    }
    return {
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      addressLine: row.addressLine,
      ward: row.ward ?? undefined,
      district: row.district ?? undefined,
      province: row.province,
      feeAmount: row.feeAmount ?? undefined,
    };
  }
}
