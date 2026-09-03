'use client';

import Link from 'next/link';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { presentOrderOrigin } from '../../../shared/presentation/order-origin';
import { presentOrderStatus } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ADMIN_ORDERS_ROUTE } from '../../order-queue';
import { useOrderDetailQuery } from '../hooks/use-order-detail-queries';
import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';
import { classifyOrderReadFailure } from '../model/order-detail-failure';
import { CustomOrderColumns } from './custom-order-columns';
import { ReadyMadeOrderColumns } from './ready-made-order-columns';

interface OrderDetailScreenProps {
  readonly orderId: string;
}

/**
 * The one discriminator the columns branch on (`COL-TBL043-12`).
 *
 * Compared against `order.origin` and nothing else. `APP12-A02-C1` §9 forbids
 * every substitute — the status, a missing `customRequestId`, which payment
 * obligation the order carries — because each of those is a *consequence* of
 * the origin and each is wrong in at least one legitimate state.
 */
const READY_MADE = 'READY_MADE';

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
 * ## `APP9-A01` extends this screen rather than adding one
 *
 * The fulfillment rail sits at the top of the same right column, above the
 * deposit workbench, and renders whichever APP9 section the order's state calls
 * for — opening the balance, the balance itself, shipping, dispatch, completion
 * or nothing at all. `NEW_ADMIN_ROUTES = 0`: there is no `/fulfillment`, no
 * `/shipping`, no `/final-payments` and no second order queue, because a
 * decision that freezes an address or closes an order belongs beside the order
 * it acts on, not on a page that would have to re-state which order it meant.
 *
 * The rail is passed the order it was given rather than re-reading it. One
 * `adminOrder_detail` per screen, and the status the header renders is the same
 * status the rail routes on — two reads could disagree, and then the header and
 * the actions beneath it would be describing different orders.
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
  const origin = presentOrderOrigin(order.origin);

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
          {/* `913:337` — one origin badge beside the status, on the existing
              badge component. It names the fact the columns below branch on, so
              an operator can see which screen they are looking at. */}
          <AdminStatusBadge
            token={origin.token}
            label={origin.label}
            tone={origin.tone}
            symbol={origin.symbol}
            testId="order-detail-origin-pill"
          />
          <p className="order-detail__total">
            {`${COPY.page.orderTotal} ${formatAmountWithCurrency(order.totalAmount, order.currencyCode)}`}
          </p>
        </div>
      </header>

      {order.origin === READY_MADE ? (
        <ReadyMadeOrderColumns orderId={orderId} order={order} />
      ) : (
        <CustomOrderColumns orderId={orderId} order={order} />
      )}
    </section>
  );
}
