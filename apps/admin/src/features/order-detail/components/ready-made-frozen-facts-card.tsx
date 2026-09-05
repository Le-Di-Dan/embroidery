import type { AdminOrderDetailResponse, AdminShippingDetailResponse } from '@embroidery/api-client';

import { formatInstant } from '../../../shared/presentation/instant';
import { presentOrderOrigin } from '../../../shared/presentation/order-origin';
import { AdminStatusBadge } from '../../../shared/status/admin-status-badge';
import { READY_MADE_DETAIL_COPY as COPY } from '../model/ready-made-detail-copy';
import { readOptionalText } from '../model/shipping-detail-form';
import { DefinitionRow } from './definition-row';

interface ReadyMadeFrozenFactsCardProps {
  readonly order: AdminOrderDetailResponse;
  /** The stored delivery detail, or `null` when the read has none yet. */
  readonly shipping: AdminShippingDetailResponse | null;
}

/**
 * A Ready-Made order's frozen facts (`913:337`).
 *
 * The custom card's sibling, not a variant of it. `913:337` draws a different
 * list — origin, customer, contact, delivery address, creation, and the stock
 * hold — because a Ready-Made order has different facts, not the custom ones
 * with holes punched in them.
 *
 * ## The custom-only sections are omitted, and said to be omitted
 *
 * `BR-031`. There is no quotation row rendering `—`, no empty approval card and
 * no disabled production link: a card that draws an empty slot for something
 * that will never arrive teaches an operator to expect it. The closing note
 * names the four sections that are absent and why, once, in one sentence.
 *
 * ## `Giữ hàng đến` is read, never computed
 *
 * `paymentDeadline` is the reservation's own committed `expires_at`, published
 * by the Admin detail read. Nothing here adds a window to a creation time, and
 * when the hold no longer stands — lapsed, released, or consumed at
 * verification — the row says so rather than showing a countdown to an instant
 * that has stopped meaning anything.
 *
 * ## The delivery facts come from the shipping read
 *
 * They are the order's stored delivery detail, not a customer profile: no live
 * customer record is read, and no name is resolved from an id. Before a
 * shipping detail exists the rows are simply absent — `APP12-B02` writes one at
 * creation, so in practice this is the transport gap rather than a state, and
 * the card renders without them rather than blocking on them.
 */
export function ReadyMadeFrozenFactsCard({ order, shipping }: ReadyMadeFrozenFactsCardProps) {
  const origin = presentOrderOrigin(order.origin);
  const address = shipping === null ? undefined : formatDeliveryAddress(shipping);

  return (
    <section className="order-card" aria-labelledby="order-facts-heading">
      <h2 className="order-card__title" id="order-facts-heading">
        {COPY.frozen.heading}
      </h2>
      <p className="order-card__help">{COPY.frozen.help}</p>

      <dl className="order-card__definitions">
        <DefinitionRow label={COPY.frozen.origin} testId="order-detail-origin">
          <AdminStatusBadge
            token={origin.token}
            label={origin.label}
            tone={origin.tone}
            symbol={origin.symbol}
            testId="order-detail-origin-badge"
          />
        </DefinitionRow>

        <DefinitionRow label={COPY.frozen.code} testId="order-detail-code">
          {order.code}
        </DefinitionRow>

        {shipping === null ? null : (
          <DefinitionRow label={COPY.frozen.customer} testId="order-detail-recipient">
            {shipping.recipientName}
          </DefinitionRow>
        )}

        {shipping === null ? null : (
          <DefinitionRow label={COPY.frozen.contact} testId="order-detail-contact">
            {shipping.recipientPhone}
          </DefinitionRow>
        )}

        {address === undefined ? null : (
          <DefinitionRow label={COPY.frozen.address} testId="order-detail-address">
            {address}
          </DefinitionRow>
        )}

        <DefinitionRow label={COPY.frozen.createdAt}>
          <time dateTime={order.createdAt}>{formatInstant(order.createdAt)}</time>
        </DefinitionRow>

        <DefinitionRow label={COPY.frozen.paymentDeadline} testId="order-detail-deadline">
          {order.paymentDeadline === undefined ? (
            COPY.frozen.paymentDeadlineAbsent
          ) : (
            <time className="order-card__deadline" dateTime={order.paymentDeadline}>
              {formatInstant(order.paymentDeadline)}
            </time>
          )}
        </DefinitionRow>
      </dl>
    </section>
  );
}

/**
 * The stored delivery address as one line, in Vietnamese reading order.
 *
 * The nullable members arrive loosely typed from the generated client, so each
 * is narrowed through the shared reader rather than cast; an absent ward or
 * district is dropped from the line rather than rendered as a gap between two
 * commas.
 */
function formatDeliveryAddress(shipping: AdminShippingDetailResponse): string {
  return [
    shipping.addressLine,
    readOptionalText(shipping.ward),
    readOptionalText(shipping.district),
    shipping.province,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');
}
