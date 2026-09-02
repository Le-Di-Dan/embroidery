'use client';

/**
 * The confirmation (`APP12-S02` §24, §25, §26).
 *
 * ## Everything on it is a fact the create response returned
 *
 * `orderCode`, `merchandiseSubtotal`, `reservationExpiresAt` and `access` come
 * from `ReadyMadeOrderCreatedResponse` and are rendered as received. The
 * reservation deadline in particular is the server's own instant, **read and
 * never recomputed** — §26 forbids `now + 24h` in the browser, and a client
 * clock that disagreed with the sweep would tell a customer their stock was held
 * for longer than it was. The subtotal is the frozen figure the order line
 * carries, so if the catalog price moved between the last render and the commit,
 * what the customer sees here is what was actually written (§29).
 *
 * ## Three things it does not do
 *
 * **It does not navigate.** `/truy-cap/don-hang` is opened by an `ORDER_ACCESS`
 * token this route never holds and cannot recover — the create response
 * publishes `delivered`, `expiresAt` and `scopeKind`, and the link itself is
 * gone the moment it is handed to the notification path. So there is no
 * redirect, no button carrying an order id, and no "check your order" route
 * (§23, §25). The way in is the message.
 *
 * **It does not claim money.** No payment, no QR, no "đã thanh toán", no total.
 * The order is at the fee-pending state and the copy says exactly that (§31).
 *
 * **It does not print an internal id.** `orderCode` is the human, quotable
 * reference the contract publishes for support; the order's UUID is not in the
 * response and would not be rendered if it were (§24).
 *
 * ## Focus
 *
 * The panel takes focus on mount and carries the page's live heading, so a
 * keyboard or screen-reader customer lands on the outcome rather than at the top
 * of a page whose form has vanished (§35).
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { ReadyMadeOrderCreatedResponse } from '@embroidery/api-client';

import { formatExactMoney } from '../../ready-made-purchase/model/purchase-money';
import { buildStorefrontProductDetailPath } from '../../storefront-shell';
import { READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';

const { success } = READY_MADE_CHECKOUT_COPY;

/**
 * The reservation deadline, in the page's own locale.
 *
 * Formatting an instant the server sent is presentation, not arithmetic: the
 * value is not shifted, extended or rounded, and an instant this formatter
 * cannot parse is rendered verbatim rather than as an invented date.
 */
function formatDeadline(isoInstant: string): string {
  const parsed = Date.parse(isoInstant);
  if (Number.isNaN(parsed)) return isoInstant;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(parsed));
}

export interface CheckoutSuccessPanelProps {
  readonly slug: string;
  readonly order: ReadyMadeOrderCreatedResponse;
}

export function CheckoutSuccessPanel({ slug, order }: CheckoutSuccessPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="ready-made-checkout__success" aria-labelledby="checkout-success-heading">
      <h2
        className="ready-made-checkout__success-title"
        id="checkout-success-heading"
        ref={headingRef}
        tabIndex={-1}
      >
        <span aria-hidden="true">{success.mark}</span> {success.title}
      </h2>

      <div className="ready-made-checkout__card">
        <dl className="ready-made-checkout__rows">
          <div className="ready-made-checkout__row">
            <dt>{success.orderCodeLabel}</dt>
            <dd className="ready-made-checkout__order-code">{order.orderCode}</dd>
          </div>
          <div className="ready-made-checkout__row">
            <dt>{success.merchandiseLabel}</dt>
            <dd>
              {formatExactMoney(
                order.merchandiseSubtotal.amount,
                order.merchandiseSubtotal.currency,
              )}
            </dd>
          </div>
          <div className="ready-made-checkout__row">
            <dt>{success.reservationLabel}</dt>
            <dd>{formatDeadline(order.reservationExpiresAt)}</dd>
          </div>
        </dl>
        <p className="ready-made-checkout__caption">{success.orderCodeNote}</p>
      </div>

      {/*
        `access.delivered` is a fact, not a decoration: the contract says the
        link was handed to the notification path for the customer's own verified
        contact. When it is false the order still exists — it is created in the
        same transaction — but promising a message that was not queued would be
        a lie, so the notice is withheld and the fallback advice stands alone.
      */}
      <div className="ready-made-checkout__card">
        {order.access.delivered ? (
          <>
            <p className="ready-made-checkout__card-heading">{success.secureLinkTitle}</p>
            <p className="ready-made-checkout__body">{success.secureLinkBody}</p>
          </>
        ) : null}
        <p className="ready-made-checkout__notice">{success.shippingPendingNotice}</p>
        <p className="ready-made-checkout__caption">{success.secureLinkFallback}</p>
      </div>

      <Link className="ready-made-checkout__back" href={buildStorefrontProductDetailPath(slug)}>
        {success.continue}
      </Link>
    </section>
  );
}
