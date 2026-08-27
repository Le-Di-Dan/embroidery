'use client';

import { useState } from 'react';

import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { useOpenFinalPayment } from '../hooks/use-order-fulfillment';
import { DefinitionRow } from './definition-row';
import { FulfillmentConfirmDialog } from './fulfillment-confirm-dialog';
import { LockedCapabilityList } from './locked-capability-list';

interface OpenFinalPaymentCardProps {
  readonly orderId: string;
}

/**
 * `PRODUCTION_COMPLETED` — the one APP9 action this state has (`809:73`).
 *
 * "Yêu cầu thanh toán phần còn lại" is `adminOrder_transition` with the
 * contract's single destination, `AWAITING_FINAL_PAYMENT`. The copy is careful
 * about what that does and does not do: the REMAINING obligation was created
 * beside the deposit when the order was converted, and opening the window
 * neither creates it, recalculates it nor satisfies it. A card that said "tạo
 * nghĩa vụ" would be describing a write the server does not perform.
 *
 * ## The balance is not shown, and that is deliberate
 *
 * The approved frame draws a figure here derived as "tổng đơn trừ tiền cọc đã
 * thu". This screen does not render it. No Admin read projects the REMAINING
 * obligation (`FU-APP9-B03-02`), so that number could only come from
 * subtraction — and `APP9-A01` §9 forbids exactly that subtraction, because an
 * `APP9-B04` fee increase supersedes the obligation and makes it wrong. The
 * approved API-gap treatment from `811:74` stands in its place rather than a
 * figure the screen cannot vouch for. Recorded as a deviation in the A01
 * completion report; the underlying gap remains `FU-APP9-B03-02`.
 */
export function OpenFinalPaymentCard({ orderId }: OpenFinalPaymentCardProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useOpenFinalPayment(orderId);

  return (
    <>
      <section className="order-card" aria-labelledby="fulfillment-open-heading">
        <h2 className="order-card__title" id="fulfillment-open-heading">
          {COPY.finalPayment.title}
        </h2>
        <p className="order-card__help">{COPY.finalPayment.readyHelp}</p>

        <div className="order-fulfillment__gap" data-testid="remaining-amount-gap">
          <p className="order-fulfillment__gap-title">{COPY.apiGap.title}</p>
          <p className="order-fulfillment__gap-body">{COPY.apiGap.body}</p>
        </div>

        <div className="order-fulfillment__actions">
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--primary"
            data-testid="open-final-payment"
            onClick={() => {
              mutation.reset();
              setConfirming(true);
            }}
          >
            {COPY.finalPayment.openAction}
          </button>
        </div>
        <p className="order-card__note">{COPY.finalPayment.openNote}</p>
      </section>

      <LockedCapabilityList
        entries={[
          { label: COPY.locked.shipping, reason: COPY.locked.shippingWhy },
          { label: COPY.locked.dispatch, reason: COPY.locked.dispatchWhy },
          { label: COPY.locked.completion, reason: COPY.locked.completionWhy },
        ]}
      />

      {confirming ? (
        <FulfillmentConfirmDialog
          title={COPY.openDialog.title}
          body={COPY.openDialog.body}
          confirmLabel={COPY.openDialog.confirm}
          pendingLabel={COPY.openDialog.pending}
          testId="open-final-payment-dialog"
          pending={mutation.isPending}
          error={mutation.error}
          staleSentence={COPY.refusal.transitionStale}
          onDismiss={() => setConfirming(false)}
          onConfirm={() => {
            mutation.mutate(undefined, { onSuccess: () => setConfirming(false) });
          }}
        >
          <dl className="order-fulfillment__effect">
            <DefinitionRow label={COPY.openDialog.effectLabel}>
              {COPY.openDialog.effectValue}
            </DefinitionRow>
          </dl>
          <p className="order-card__note">{COPY.openDialog.effectNote}</p>
        </FulfillmentConfirmDialog>
      ) : null}
    </>
  );
}
