'use client';

import { useState } from 'react';

import type { AdminOrderDetailResponse } from '@embroidery/api-client';

import { useShippingDetailQuery } from '../hooks/use-order-fulfillment';
import {
  editsShippingDetail,
  fulfillmentStageOf,
  readsShippingDetail,
  type FulfillmentStage,
} from '../model/fulfillment-capability';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { classifyFulfillmentFailure } from '../model/fulfillment-failure';
import { readOptionalText } from '../model/shipping-detail-form';
import { CompletionCard } from './completion-card';
import { DispatchCard } from './dispatch-card';
import { FrozenShippingCard } from './frozen-shipping-card';
import { OpenFinalPaymentCard } from './open-final-payment-card';
import { OrderCompletedCard } from './order-completed-card';
import { RemainingPaymentCard } from './remaining-payment-card';
import { refusalSentence } from './fulfillment-confirm-dialog';
import { SettledPaymentCard } from './settled-payment-card';
import { ShippingDetailEditor } from './shipping-detail-editor';

interface FulfillmentPanelProps {
  readonly order: AdminOrderDetailResponse;
}

/**
 * The APP9 rail on `/orders/{orderId}` — one composition, five states, no new
 * route (`NEW_ADMIN_ROUTES = 0`).
 *
 * ## It routes, it does not decide
 *
 * This component's whole job is to pick which approved section belongs in the
 * rail for the order's current state and to hand it the data it needs. Every
 * card below owns its own behaviour; every command re-proves its own
 * preconditions on the server. There is no lifecycle logic here beyond the
 * stage lookup, and deliberately no giant conditional holding all five states'
 * rules together — that is what `fulfillment-capability.ts` is for, and what
 * keeps each state's card reviewable on its own.
 *
 * ## The shipping read is issued only where it can be shown
 *
 * From `READY_FOR_DELIVERY` onward. Before that the design draws a locked
 * placeholder, and requesting a detail with no surface would spend a round trip
 * to produce a 404 the screen would then have to explain away.
 *
 * A shipping read that 404s in a stage that *should* have one is not an error
 * state for the page: it means the order has no detail saved yet, which is an
 * ordinary situation the editor handles by offering an empty form. Any other
 * failure is reported with its approved sentence and an explicit retry.
 *
 * ## Dispatch availability is lifted, and only for the one case that needs it
 *
 * A fee change that was refused for want of the customer's acknowledgement
 * leaves the form holding a fee the order does not have. Dispatching in that
 * moment would freeze the *stored* values, not the ones on screen — so the
 * dispatch control is held back until the operator resolves it, exactly as
 * `812:220` draws. The server still re-checks everything when the button is
 * finally pressed; this is a courtesy, not a guard.
 */
export function FulfillmentPanel({ order }: FulfillmentPanelProps) {
  const [feeBlocked, setFeeBlocked] = useState(false);
  const stage = fulfillmentStageOf(order.status);
  const shipping = useShippingDetailQuery(order.orderId, readsShippingDetail(stage));

  if (stage === 'none') {
    return null;
  }

  if (stage === 'open-final-payment') {
    return (
      <div className="order-fulfillment" data-testid="fulfillment-panel" data-stage={stage}>
        <OpenFinalPaymentCard orderId={order.orderId} />
      </div>
    );
  }

  if (stage === 'awaiting-final-payment') {
    return (
      <div className="order-fulfillment" data-testid="fulfillment-panel" data-stage={stage}>
        <RemainingPaymentCard />
      </div>
    );
  }

  return (
    <div className="order-fulfillment" data-testid="fulfillment-panel" data-stage={stage}>
      {renderShipping(stage, shipping, order, feeBlocked, setFeeBlocked)}
    </div>
  );
}

type ShippingQuery = ReturnType<typeof useShippingDetailQuery>;

function renderShipping(
  stage: FulfillmentStage,
  shipping: ShippingQuery,
  order: AdminOrderDetailResponse,
  feeBlocked: boolean,
  setFeeBlocked: (blocked: boolean) => void,
) {
  if (shipping.isPending) {
    return (
      <p className="order-panel__loading" role="status" data-testid="shipping-loading">
        {COPY.failure.loading}
      </p>
    );
  }

  if (shipping.isError) {
    const failure = classifyFulfillmentFailure(shipping.error);
    // A missing detail is not a failed screen — it is an order whose shipping
    // has not been entered yet, and the editor is exactly where it is entered.
    if (failure === 'shipping-missing' && stage === 'shipping') {
      return <ShippingSetup order={order} setFeeBlocked={setFeeBlocked} />;
    }
    return (
      <div className="order-panel__failure" role="alert" data-testid="shipping-error">
        <p className="order-panel__failure-body">{refusalSentence(failure)}</p>
        <button
          type="button"
          className="order-fulfillment__button order-fulfillment__button--secondary"
          data-testid="shipping-retry"
          onClick={() => {
            void shipping.refetch();
          }}
        >
          {COPY.failure.retry}
        </button>
      </div>
    );
  }

  const detail = shipping.data;
  const deliveredAt = readOptionalText(detail.frozenAt);

  if (stage === 'completed') {
    return (
      <>
        <FrozenShippingCard detail={detail} currencyCode={order.currencyCode} />
        <OrderCompletedCard deliveredAt={deliveredAt} />
      </>
    );
  }

  if (stage === 'delivered') {
    return (
      <>
        <SettledPaymentCard />
        <FrozenShippingCard detail={detail} currencyCode={order.currencyCode} />
        <CompletionCard orderId={order.orderId} deliveredAt={deliveredAt} />
      </>
    );
  }

  // `stage === 'shipping'`. The stored LC-19 state is authoritative: a detail
  // that already reports `FROZEN` is read-only even when this browser's cached
  // order status has not caught up.
  if (!editsShippingDetail(stage, detail.status)) {
    return <FrozenShippingCard detail={detail} currencyCode={order.currencyCode} />;
  }

  return (
    <>
      <ShippingDetailEditor
        orderId={order.orderId}
        detail={detail}
        currencyCode={order.currencyCode}
        onBlockedChange={setFeeBlocked}
      />
      <DispatchCard
        orderId={order.orderId}
        detail={detail}
        currencyCode={order.currencyCode}
        blocked={feeBlocked}
      />
    </>
  );
}

interface ShippingSetupProps {
  readonly order: AdminOrderDetailResponse;
  readonly setFeeBlocked: (blocked: boolean) => void;
}

/**
 * An order at `READY_FOR_DELIVERY` with no shipping detail yet.
 *
 * The editor is rendered with **no** detail behind it rather than against a
 * fabricated one — an invented `AdminShippingDetailResponse` would have to carry
 * a `countryCode` this screen chose, and a default country is a business value
 * the server owns. `adminOrderShipping_save` creates the record when the order
 * has none, so an empty form is the whole of what is needed.
 *
 * Dispatch is not offered beside it: `GRD-017` requires a detail that exists and
 * carries a fee, so a dispatch control here would be a button whose only
 * possible answer is a refusal.
 */
function ShippingSetup({ order, setFeeBlocked }: ShippingSetupProps) {
  return (
    <>
      <p className="order-card__note" data-testid="shipping-absent">
        {COPY.shipping.missing}
      </p>
      <ShippingDetailEditor
        orderId={order.orderId}
        detail={null}
        currencyCode={order.currencyCode}
        onBlockedChange={setFeeBlocked}
      />
    </>
  );
}
