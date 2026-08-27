import type { AdminShippingDetailResponse } from '@embroidery/api-client';

import { formatAmountWithCurrency } from '../../../shared/presentation/exact-amount';
import { formatInstant } from '../../../shared/presentation/instant';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { ORDER_FULFILLMENT_COPY as COPY } from '../model/fulfillment-copy';
import { readOptionalText } from '../model/shipping-detail-form';
import { DefinitionRow } from './definition-row';

interface FrozenShippingCardProps {
  readonly detail: AdminShippingDetailResponse;
  readonly currencyCode: string;
}

/**
 * The shipping detail after dispatch: a record, not a form (`815:158`).
 *
 * There is no input, no save control and no edit affordance anywhere in this
 * component — not a disabled one either. The detail is `FROZEN`, the Admin write
 * refuses it and a database trigger rejects any mutation, so a disabled field
 * would be a control describing a capability that does not exist. The address an
 * order was shipped to is evidence; corrections after this point are
 * compensating records, not edits.
 *
 * ## The carrier and tracking code are text, and stay text
 *
 * `carrierName` and `trackingCode` are internal notes an operator typed. There
 * is no carrier integration behind either: nothing is called, polled or
 * subscribed to, and no delivery state is derived from them. So no track-package
 * button, no courier link, no ETA, no shipment timeline, no map and no polling
 * appears here — the note under the record says as much, so a later reader can
 * tell a decision from an omission.
 *
 * ## `frozenAt` is the delivery instant
 *
 * Dispatch stamps the shipping snapshot and the order's delivered timestamp with
 * the same value, so this one column is what the screen has for "when did this
 * ship" — the order read publishes no delivery or completion timestamp of its
 * own.
 */
export function FrozenShippingCard({ detail, currencyCode }: FrozenShippingCardProps) {
  const fee = readOptionalText(detail.feeAmount);
  const frozenAt = readOptionalText(detail.frozenAt);
  const ward = readOptionalText(detail.ward);
  const district = readOptionalText(detail.district);
  const carrierName = readOptionalText(detail.carrierName);
  const trackingCode = readOptionalText(detail.trackingCode);

  const address = [detail.addressLine, ward, district, detail.province]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');

  return (
    <section
      className="order-card"
      aria-labelledby="frozen-shipping-heading"
      data-testid="frozen-shipping"
    >
      <div className="order-card__heading-row">
        <h2 className="order-card__title" id="frozen-shipping-heading">
          {COPY.shipping.title}
        </h2>
        <AdminStatusBadge
          token={detail.status}
          label={COPY.shipping.frozenBadge}
          tone="neutral"
          symbol={STATUS_SYMBOLS.ended}
          testId="shipping-status"
        />
      </div>
      <p className="order-card__help">{COPY.shipping.frozenHelp}</p>

      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.shippingFields.recipientName}>
          {detail.recipientName}
        </DefinitionRow>
        <DefinitionRow label={COPY.shippingFields.recipientPhone}>
          {detail.recipientPhone}
        </DefinitionRow>
        <DefinitionRow label={COPY.shippingFields.addressLine}>{address}</DefinitionRow>
        <DefinitionRow label={COPY.shippingFields.feeAmount}>
          {fee === null ? COPY.shippingFee.unsetValue : formatAmountWithCurrency(fee, currencyCode)}
        </DefinitionRow>
        {carrierName === null ? null : (
          <DefinitionRow label={COPY.shippingFields.carrierName}>{carrierName}</DefinitionRow>
        )}
        {trackingCode === null ? null : (
          <DefinitionRow label={COPY.shippingFields.trackingCode}>{trackingCode}</DefinitionRow>
        )}
        {frozenAt === null ? null : (
          <DefinitionRow label={COPY.shippingFields.frozenAt}>
            <time dateTime={frozenAt}>{formatInstant(frozenAt)}</time>
          </DefinitionRow>
        )}
      </dl>

      <p className="order-card__note">{COPY.shipping.noTracking}</p>
    </section>
  );
}
