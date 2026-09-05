'use client';

import type { AdminOrderDetailResponse } from '@embroidery/api-client';

import { DepositPaymentPanel } from './deposit-payment-panel';
import { FulfillmentPanel } from './fulfillment-panel';
import { OrderFrozenFactsCard } from './order-frozen-facts-card';
import { OrderItemsTable } from './order-items-table';

interface CustomOrderColumnsProps {
  readonly orderId: string;
  readonly order: AdminOrderDetailResponse;
}

/**
 * The custom branch of `/orders/{orderId}` — the delivered APP7/APP9
 * composition, extracted verbatim (`734:3`, `736:3`).
 *
 * Lifting it out of the screen is what lets the origin branch be **one
 * conditional over two named compositions** instead of a switch threaded
 * through every card. Nothing about this column changed in `APP12-A02-C1`: the
 * same frozen-facts card, the same line table, the same APP9 rail and the same
 * deposit workbench, in the same order, reading the same queries.
 */
export function CustomOrderColumns({ orderId, order }: CustomOrderColumnsProps) {
  return (
    <div className="order-detail__columns">
      <div className="order-detail__frozen">
        <OrderFrozenFactsCard order={order} />
        <OrderItemsTable items={order.items} />
      </div>
      <div className="order-detail__payments">
        <FulfillmentPanel order={order} />
        <DepositPaymentPanel orderId={orderId} origin={order.origin} />
      </div>
    </div>
  );
}
