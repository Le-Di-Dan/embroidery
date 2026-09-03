'use client';

import type { AdminOrderDetailResponse, AdminShippingDetailResponse } from '@embroidery/api-client';

import { fulfillmentStageOf, readsShippingDetail } from '../model/fulfillment-capability';
import { READY_MADE_DETAIL_COPY as COPY } from '../model/ready-made-detail-copy';
import { readOptionalText } from '../model/shipping-detail-form';
import { CompletionCard } from './completion-card';
import { DispatchCard } from './dispatch-card';
import { FrozenShippingCard } from './frozen-shipping-card';
import { OrderCompletedCard } from './order-completed-card';

interface ReadyMadeFulfillmentPanelProps {
  readonly order: AdminOrderDetailResponse;
  /** The stored detail, or `null` when the order's stage does not read one. */
  readonly detail: AdminShippingDetailResponse | null;
}

/**
 * The APP9 fulfilment rail, on a Ready-Made order (`913:337`, `914:361`).
 *
 * ## The same ladder, two rungs shorter
 *
 * ```text
 * AWAITING_SHIPPING_FEE ─┐  nothing: there is no parcel and nothing paid
 * AWAITING_PAYMENT      ─┘
 * READY_FOR_DELIVERY    →  dispatch
 * DELIVERED             →  complete
 * COMPLETED             →  read-only
 * ```
 *
 * Every card below is the **delivered APP9 component**, unchanged:
 * `adminOrder_dispatch` and `adminOrder_complete` are origin-neutral commands —
 * dispatching a parcel and closing an order are the same act however the order
 * was created — and `APP12-B05` made both reachable for a Ready-Made row. This
 * component only routes.
 *
 * ## What is absent, and why it is absent rather than disabled
 *
 * No production step (`BR-030`): a Ready-Made order manufactures nothing, so
 * there is no job to create and no job state to show. No remaining-payment
 * step: the order is paid once, in full (`BR-029`). Neither is rendered as a
 * greyed-out card, because a disabled control is still a claim that the action
 * exists here.
 *
 * ## Before payment the rail states the precondition
 *
 * `fulfillmentStageOf` maps both Ready-Made pre-payment states to `none`, and
 * rather than rendering nothing at all the panel says what has to happen first.
 * An empty column would leave the operator wondering whether the rail failed to
 * load.
 *
 * ## No shipping editor, and no tracking
 *
 * The fee is the `ReadyMadeShippingFeeCard`'s, in the other half of the column;
 * a second editor here would be a second authority over the same field. After
 * dispatch the detail is `FROZEN` and rendered as a record. Carrier and
 * tracking are the operator's own stored notes — there is no carrier
 * integration, no live lookup, no ETA and no polling anywhere on this screen.
 */
export function ReadyMadeFulfillmentPanel({ order, detail }: ReadyMadeFulfillmentPanelProps) {
  const stage = fulfillmentStageOf(order.status);

  if (!readsShippingDetail(stage)) {
    return (
      <section className="order-card" aria-labelledby="fulfillment-heading">
        <h2 className="order-card__title" id="fulfillment-heading">
          {COPY.fulfillment.heading}
        </h2>
        <p className="order-card__help" data-testid="ready-made-fulfillment-locked">
          {COPY.fulfillment.lockedHelp}
        </p>
      </section>
    );
  }

  if (detail === null) {
    return (
      <section className="order-card" aria-labelledby="fulfillment-heading">
        <h2 className="order-card__title" id="fulfillment-heading">
          {COPY.fulfillment.heading}
        </h2>
        <p className="order-card__help">{COPY.failure.loading}</p>
      </section>
    );
  }

  const deliveredAt = readOptionalText(detail.frozenAt);

  if (stage === 'completed') {
    return <OrderCompletedCard deliveredAt={deliveredAt} />;
  }

  if (stage === 'delivered') {
    return (
      <>
        <FrozenShippingCard detail={detail} currencyCode={order.currencyCode} />
        <CompletionCard orderId={order.orderId} deliveredAt={deliveredAt} />
      </>
    );
  }

  // `shipping` — the one stage that dispatches. `blocked` is false because this
  // rail has no editor of its own: there is no unsaved fee change here to stand
  // between the operator and a dispatch.
  return (
    <DispatchCard
      orderId={order.orderId}
      detail={detail}
      currencyCode={order.currencyCode}
      blocked={false}
    />
  );
}
