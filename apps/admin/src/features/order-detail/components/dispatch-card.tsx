'use client';

import { useState } from 'react';

import type { AdminShippingDetailResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { useDispatchOrder } from '../hooks/use-order-fulfillment';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { readOptionalText } from '../model/shipping-detail-form';
import { DefinitionRow } from './definition-row';
import { FulfillmentConfirmDialog } from './fulfillment-confirm-dialog';

interface DispatchCardProps {
  readonly orderId: string;
  readonly detail: AdminShippingDetailResponse;
  readonly currencyCode: string;
  /** True while an unsaved fee change is standing between here and a dispatch. */
  readonly blocked: boolean;
}

/**
 * "Đánh dấu đã giao" — `adminOrder_dispatch`, `READY_FOR_DELIVERY → DELIVERED`
 * (`812:102`, `814:4`).
 *
 * ## The dialog names the freeze before it happens, not after
 *
 * Dispatch and freeze are one transaction, and the freeze is permanent: after it
 * commits, the recipient, phone, address, fee, carrier and tracking code cannot
 * be edited by anyone. So the confirmation lists the exact values about to be
 * recorded and says plainly that they become immutable. There is no separate
 * freeze control anywhere on this screen, because there is no such operation —
 * freezing is a consequence of dispatching.
 *
 * The copy says the values are recorded, never that they are written to a
 * snapshot table: an operator decides on the strength of what the values are,
 * and the storage behind them is not their business.
 *
 * ## Nothing is marked delivered before the server says so
 *
 * The order's status is re-read after the mutation resolves; it is never set
 * optimistically. The two refusals this command has are both real and both
 * reachable: the balance may still be unsatisfied — an `APP9-B04` fee increase
 * supersedes a satisfied obligation without moving the order, so
 * `READY_FOR_DELIVERY` is not proof of payment — and a replay finds the order
 * already dispatched. Each gets its own approved sentence, and neither offers a
 * bypass.
 *
 * ## It records the shop's own act, not a courier's
 *
 * No carrier is contacted, no courier polled, no tracking lifecycle opened and
 * no customer message sent. The dialog says so, so an operator does not read
 * "đã giao" as confirmation from a delivery company.
 */
export function DispatchCard({ orderId, detail, currencyCode, blocked }: DispatchCardProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useDispatchOrder(orderId);

  const fee = readOptionalText(detail.feeAmount);
  const carrierName = readOptionalText(detail.carrierName);
  const trackingCode = readOptionalText(detail.trackingCode);
  const address = [
    detail.addressLine,
    readOptionalText(detail.ward),
    readOptionalText(detail.district),
    detail.province,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');

  return (
    <>
      <section className="order-card" aria-labelledby="dispatch-heading">
        <h2 className="order-card__title" id="dispatch-heading">
          {COPY.dispatch.title}
        </h2>
        <p className="order-card__help">{COPY.dispatch.help}</p>
        <div className="order-fulfillment__actions">
          <button
            type="button"
            className="order-fulfillment__button order-fulfillment__button--primary"
            data-testid="open-dispatch"
            disabled={blocked}
            onClick={() => {
              mutation.reset();
              setConfirming(true);
            }}
          >
            {COPY.dispatch.action}
          </button>
        </div>
        {blocked ? <p className="order-card__note">{COPY.dispatch.blockedNote}</p> : null}
      </section>

      {confirming ? (
        <FulfillmentConfirmDialog
          title={COPY.dispatch.dialogTitle}
          body={COPY.dispatch.dialogBody}
          confirmLabel={COPY.dispatch.confirm}
          pendingLabel={COPY.dispatch.pending}
          testId="dispatch-dialog"
          pending={mutation.isPending}
          error={mutation.error}
          staleSentence={COPY.refusal.dispatchInvalid}
          onDismiss={() => setConfirming(false)}
          onConfirm={() => {
            mutation.mutate(undefined, { onSuccess: () => setConfirming(false) });
          }}
        >
          <div className="order-fulfillment__gap order-fulfillment__gap--warning">
            <p className="order-fulfillment__gap-title">{COPY.dispatch.freezeTitle}</p>
            <p className="order-fulfillment__gap-body">{COPY.dispatch.freezeBody}</p>
          </div>
          <p className="order-fulfillment__snapshot-title">{COPY.dispatch.snapshotTitle}</p>
          <dl className="order-fulfillment__effect">
            <DefinitionRow label={COPY.shippingFields.recipientName}>
              {detail.recipientName}
            </DefinitionRow>
            <DefinitionRow label={COPY.shippingFields.addressLine}>{address}</DefinitionRow>
            <DefinitionRow label={COPY.shippingFields.feeAmount}>
              {fee === null
                ? COPY.shippingFee.unsetValue
                : formatAmountWithCurrency(fee, currencyCode)}
            </DefinitionRow>
            {carrierName === null && trackingCode === null ? null : (
              <DefinitionRow label={COPY.shippingFields.carrierName}>
                {[carrierName, trackingCode].filter((part) => part !== null).join(' · ')}
              </DefinitionRow>
            )}
          </dl>
        </FulfillmentConfirmDialog>
      ) : null}
    </>
  );
}
