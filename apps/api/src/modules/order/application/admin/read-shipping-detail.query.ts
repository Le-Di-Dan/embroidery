/**
 * The Admin read of one order's shipping detail (`APP9-B04` §5).
 *
 * ### One source, and it is the order's own record
 *
 * `shipping_details` (TBL-047), read through the canonical AGG-15 repository.
 * Nothing here consults the customer profile, a contact point or an address
 * book — ADR-DB2-002 makes the detail order-owned precisely so the recipient can
 * differ from the customer and so a later profile edit cannot rewrite where an
 * order was sent, and there is no MVP address book to read from anyway.
 *
 * ### It stays available after the freeze
 *
 * `loadShippingDetail` has no state predicate, so a `FROZEN` detail reads back
 * exactly as stored, carrying its `frozenAt`. That is deliberate and is the
 * asymmetry `APP9-B04` §5 describes: the **write** is `EDITABLE`-only, the read
 * is not. An operator looking at a dispatched order must still be able to see
 * the address it went to.
 *
 * ### `carrierName` and `trackingCode` are internal facts, not tracking
 *
 * They are two stored strings an operator typed. Nothing here calls a carrier,
 * polls a carrier, subscribes to a webhook or derives a delivery state from
 * them — `APP9-G01` records live carrier tracking as out of scope, and the
 * absence is structural: this class holds one repository and it has no HTTP
 * client to reach one with.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ORDER_ORIGIN_PORT,
  ORDER_REPOSITORY,
  type OrderId,
  type OrderOriginPort,
  type OrderRepository,
  type ShippingDetail,
} from '@embroidery/persistence';

import { adminShippingError } from '../../domain/shipping/admin-shipping.errors';

@Injectable()
export class ReadShippingDetailQuery {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_ORIGIN_PORT) private readonly origins: OrderOriginPort,
  ) {}

  /**
   * The stored detail, or a refusal.
   *
   * The two absences are kept apart on purpose: the caller is an authenticated
   * operator, and "no such order" and "this order has no shipping details yet"
   * lead to different next actions — escalate, versus fill the form in. Neither
   * discloses anything to an anonymous caller, because there is no anonymous
   * caller on this route.
   */
  async read(orderId: string): Promise<ShippingDetail> {
    const id = orderId as OrderId;

    // Existence is proved through the origin fact rather than through
    // `findById` (`APP12-B03` §29). `findById` maps onto the **custom**
    // aggregate and `toOrder` refuses a Ready-Made row by design, so reading a
    // Ready-Made order's shipping detail through it turned an ordinary read
    // into `ORDER_ORIGIN_NOT_CUSTOM`. This read has no use for the custom chain
    // — it returns the shipping record and nothing else — so it asks the one
    // question it actually needs answered: is there an order with this id.
    const origin = await this.origins.originOf(id);
    if (origin === undefined) {
      throw adminShippingError('ORDER_NOT_FOUND');
    }

    const detail = await this.orders.loadShippingDetail(id);
    if (detail === undefined) {
      throw adminShippingError('SHIPPING_DETAIL_NOT_FOUND');
    }
    return detail;
  }
}
