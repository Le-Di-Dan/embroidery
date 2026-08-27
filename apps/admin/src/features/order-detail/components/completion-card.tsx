'use client';

import { useState } from 'react';

import { formatInstant } from '../../../shared/presentation/instant';
import { useCompleteOrder } from '../hooks/use-order-fulfillment';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { DefinitionRow } from './definition-row';
import { FulfillmentConfirmDialog } from './fulfillment-confirm-dialog';

interface CompletionCardProps {
  readonly orderId: string;
  /** The dispatch instant, from the frozen detail. Absent if it was not read. */
  readonly deliveredAt: string | null;
}

/**
 * "Hoàn tất đơn hàng" — `adminOrder_complete`, `DELIVERED → COMPLETED`
 * (`815:79`, `815:89`).
 *
 * ## A separate action, on a separate card, on purpose
 *
 * There is no "dispatch and complete" shortcut anywhere on this screen. The two
 * are different decisions — one records that the parcel left, the other that
 * there is nothing left to do about the order — and there is no operation that
 * performs both. One built out of two calls would leave an order delivered but
 * not completed every time the second failed, which is a state no operator asked
 * for and no screen would explain.
 *
 * ## `COMPLETED` is terminal, and the dialog says so before it commits
 *
 * The effect block states what stops being possible, because after this there is
 * no reopen, no re-dispatch, no second completion and no shipping edit — and an
 * operator should learn that before pressing the button rather than by finding
 * an empty rail afterwards.
 *
 * Both refusals this command has answer with the same sentence, as `820:100`
 * requires: completing before delivery and completing twice are both
 * `ORDER_INVALID_TRANSITION`, and the honest reply to either is that only a
 * delivered order can be completed.
 *
 * ## "Đã giao lúc" comes from the frozen detail
 *
 * The order read publishes no delivery timestamp and the completion response
 * carries none either, so the one instant available is the shipping detail's
 * `frozenAt` — which dispatch stamps with the same value it uses for delivery.
 * There is deliberately no "Hoàn tất lúc" row: no delivered contract returns
 * one, and inventing it from the browser's clock would put a time on the record
 * that the database never wrote.
 */
export function CompletionCard({ orderId, deliveredAt }: CompletionCardProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useCompleteOrder(orderId);

  return (
    <>
      <section className="order-card" aria-labelledby="completion-heading">
        <h2 className="order-card__title" id="completion-heading">
          {COPY.completion.title}
        </h2>
        <p className="order-card__help">{COPY.completion.help}</p>
        <div className="order-fulfillment__actions">
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--primary"
            data-testid="open-completion"
            onClick={() => {
              mutation.reset();
              setConfirming(true);
            }}
          >
            {COPY.completion.action}
          </button>
        </div>
        {deliveredAt === null ? null : (
          <dl className="order-card__definitions">
            <DefinitionRow label={COPY.completion.deliveredAtLabel} testId="delivered-at">
              <time dateTime={deliveredAt}>{formatInstant(deliveredAt)}</time>
            </DefinitionRow>
          </dl>
        )}
      </section>

      {confirming ? (
        <FulfillmentConfirmDialog
          title={COPY.completion.dialogTitle}
          body={COPY.completion.dialogBody}
          confirmLabel={COPY.completion.confirm}
          pendingLabel={COPY.completion.pending}
          testId="completion-dialog"
          pending={mutation.isPending}
          error={mutation.error}
          staleSentence={COPY.refusal.completionInvalid}
          onDismiss={() => setConfirming(false)}
          onConfirm={() => {
            mutation.mutate(undefined, { onSuccess: () => setConfirming(false) });
          }}
        >
          <dl className="order-fulfillment__effect">
            <DefinitionRow label={COPY.completion.effectLabel}>
              {COPY.completion.effectValue}
            </DefinitionRow>
          </dl>
          <p className="order-card__note">{COPY.completion.effectNote}</p>
        </FulfillmentConfirmDialog>
      ) : null}
    </>
  );
}
