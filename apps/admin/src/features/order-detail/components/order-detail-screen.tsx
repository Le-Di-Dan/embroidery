'use client';

import Link from 'next/link';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { presentOrderStatus } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ADMIN_ORDERS_ROUTE } from '../../order-queue';
import { useOrderDetailQuery } from '../hooks/use-order-detail-queries';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { classifyOrderReadFailure } from '../model/order-detail-failure';
import { DepositPaymentPanel } from './deposit-payment-panel';
import { OrderFrozenFactsCard } from './order-frozen-facts-card';
import { OrderItemsTable } from './order-items-table';

interface OrderDetailScreenProps {
  readonly orderId: string;
}

/**
 * `/orders/{orderId}` — the Admin order and deposit-payment workspace
 * (`734:3`, `736:3`).
 *
 * ## Two reads, two columns, one screen
 *
 * The left column is the **frozen** order: what was agreed, as it was agreed,
 * from `adminOrder_detail`. The right column is the **live** deposit workbench
 * from `adminOrderPayment_read`. They are separate queries because they change
 * for different reasons — the frozen facts move only when the order's own status
 * does — and separate columns because an operator reconciling money needs the
 * agreed figures beside the observed ones.
 *
 * The payment surface lives here rather than at `/payments` or
 * `/orders/{id}/payment` for the same reason: a decision that can settle a
 * deposit belongs next to the order it settles, not on a page that would have to
 * re-state which order it was talking about.
 *
 * ## A failed read is a failure, never an empty order
 *
 * `missing` covers not-found, forbidden and malformed alike, so the screen never
 * tells an unauthorized caller that an order id is real. Only the transport band
 * gets a retry: a refusal will be refused again.
 *
 * ## The route key authorizes nothing
 *
 * `orderId` is passed down as a plain string. `APP7-B02`, `APP7-B04` and
 * `APP7-B06` all re-check the Admin session on every request, and an order id in
 * a URL grants nothing on its own.
 */
export function OrderDetailScreen({ orderId }: OrderDetailScreenProps) {
  const query = useOrderDetailQuery(orderId);

  if (query.isPending) {
    return (
      <p className="order-detail__loading" role="status" data-testid="order-detail-loading">
        {COPY.failure.loading}
      </p>
    );
  }

  if (query.isError) {
    const failure = classifyOrderReadFailure(query.error);
    return (
      <section className="order-detail__failure" role="alert" data-testid="order-detail-error">
        <p className="order-detail__failure-title">
          {failure === 'missing' ? COPY.failure.detailMissingTitle : COPY.failure.detailRetryTitle}
        </p>
        <p className="order-detail__failure-body">
          {failure === 'missing'
            ? COPY.failure.detailMissingBody
            : failure === 'unauthenticated'
              ? COPY.failure.unauthenticated
              : COPY.failure.detailRetryBody}
        </p>
        {failure === 'retryable' ? (
          <button
            type="button"
            className="order-detail__action"
            data-testid="order-detail-retry"
            onClick={() => {
              void query.refetch();
            }}
          >
            {COPY.failure.retry}
          </button>
        ) : null}
        <Link className="order-detail__back" href={ADMIN_ORDERS_ROUTE}>
          {COPY.page.backToQueue}
        </Link>
      </section>
    );
  }

  const order = query.data;
  const status = presentOrderStatus(order.status);

  return (
    <section className="order-detail">
      <header className="order-detail__header">
        <p className="order-detail__breadcrumb">
          <Link className="order-detail__back" href={ADMIN_ORDERS_ROUTE}>
            {COPY.page.breadcrumb}
          </Link>
        </p>
        <div className="order-detail__title-row">
          <h1 className="order-detail__title">{order.code}</h1>
          <AdminStatusBadge
            token={status.token}
            label={status.label}
            tone={status.tone}
            symbol={status.symbol}
            testId="order-detail-status"
          />
          <p className="order-detail__total">
            {`${COPY.page.orderTotal} ${formatAmountWithCurrency(order.totalAmount, order.currencyCode)}`}
          </p>
        </div>
      </header>

      <div className="order-detail__columns">
        <div className="order-detail__frozen">
          <OrderFrozenFactsCard order={order} />
          <OrderItemsTable items={order.items} />
        </div>
        <div className="order-detail__payments">
          <DepositPaymentPanel orderId={orderId} />
        </div>
      </div>
    </section>
  );
}
