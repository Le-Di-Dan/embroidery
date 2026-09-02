'use client';

/**
 * The summary aside (`907:200` … `907:225`, pending variant `909:269`).
 *
 * Two drawn cards: the item snapshot, and the amounts with the primary action.
 *
 * ## `BR-027` is honoured literally, and this is where
 *
 * `Phí giao hàng` reads `Xưởng xác nhận sau` and `Tổng thanh toán` reads
 * `Có sau khi xác nhận phí` — both are *strings the design approved*, not
 * formatted zeroes and not placeholders (`APP12-S02` §13, §14). There is no
 * shipping estimate, no carrier, no fabricated payable total and no QR anywhere
 * on this route, because none of those facts exists until an operator sets the
 * fee.
 *
 * `Tiền hàng` is the one figure this screen computes: the current unit price
 * times the quantity, exactly, by `multiplyExactAmount`. It is labelled as
 * merchandise and never as a total, and it is presentation only — `APP12-B02`
 * re-resolves the price under the stock lock and freezes its own subtotal, and
 * nothing on this card is sent anywhere.
 *
 * ## The button stays pressable while the form is incomplete
 *
 * `909:258` requires it: *"Nút vẫn bấm được để lỗi được công bố."* A disabled
 * submit publishes nothing, so a keyboard-only customer with an empty required
 * field would get silence. It is disabled only while a submission is genuinely
 * in flight (`909:271`), which is a different statement — and even that is a
 * courtesy, not the correctness boundary (§21).
 */
import { formatExactMoney } from '../../ready-made-purchase/model/purchase-money';
import { multiplyExactAmount } from '../model/checkout-money';
import type { CheckoutSelection } from '../model/checkout-selection';
import { itemVariantLine, READY_MADE_CHECKOUT_COPY } from '../model/ready-made-checkout-copy';

export interface CheckoutSummaryCardProps {
  readonly productName: string;
  readonly thumbnailUrl?: string;
  readonly selection: CheckoutSelection;
  readonly submitting: boolean;
  /**
   * The delivery form this button submits.
   *
   * The button lives in the aside and the fields live in the main column, so
   * they cannot share an enclosing `<form>` without nesting one inside `APP4`'s
   * own — see the screen's module note. The `form` attribute is what HTML
   * provides for exactly this, and it makes the press and an `Enter` in any
   * field the same submit event rather than two handlers that must agree.
   */
  readonly formId: string;
}

const { item, summary } = READY_MADE_CHECKOUT_COPY;

export function CheckoutSummaryCard(props: CheckoutSummaryCardProps) {
  const { productName, thumbnailUrl, selection, submitting, formId } = props;
  const { sku, quantity, variantLabels } = selection;

  const subtotal = multiplyExactAmount(sku.unitPrice.amount, quantity);

  return (
    <>
      <section className="ready-made-checkout__card" aria-labelledby="checkout-item-heading">
        <h2 className="ready-made-checkout__card-heading" id="checkout-item-heading">
          {item.heading}
        </h2>
        <div className="ready-made-checkout__item">
          {/*
            Decorative: the Product name is the accessible identity on the very
            next line, so an alt text here would make a screen reader read the
            same product twice. A Product with no deliverable media renders the
            drawn slot empty rather than a stand-in image (`907:203`).
          */}
          {thumbnailUrl === undefined ? (
            <span className="ready-made-checkout__thumb" aria-hidden="true" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ready-made-checkout__thumb" src={thumbnailUrl} alt="" />
          )}
          <div className="ready-made-checkout__item-lines">
            <p className="ready-made-checkout__item-name">{productName}</p>
            <p className="ready-made-checkout__item-variant">
              {itemVariantLine(variantLabels, quantity)}
            </p>
            <p className="ready-made-checkout__item-price">
              {formatExactMoney(sku.unitPrice.amount, sku.unitPrice.currency)}
            </p>
          </div>
        </div>
      </section>

      <section className="ready-made-checkout__card" aria-labelledby="checkout-summary-heading">
        <h2 className="ready-made-checkout__card-heading" id="checkout-summary-heading">
          {summary.heading}
        </h2>

        <dl className="ready-made-checkout__rows">
          <div className="ready-made-checkout__row">
            <dt>{summary.merchandiseLabel}</dt>
            {/*
              An amount the money module did not recognise is left unstated
              rather than approximated — see `checkout-money.ts`.
            */}
            <dd>
              {subtotal === undefined ? '—' : formatExactMoney(subtotal, sku.unitPrice.currency)}
            </dd>
          </div>
          <div className="ready-made-checkout__row">
            <dt>{summary.shippingLabel}</dt>
            <dd>{summary.shippingPending}</dd>
          </div>
          <div className="ready-made-checkout__row ready-made-checkout__row--total">
            <dt>{summary.totalLabel}</dt>
            <dd>{summary.totalPending}</dd>
          </div>
        </dl>

        <p className="ready-made-checkout__notice">{summary.notice}</p>

        {/*
          `type="submit"` with **no** click handler: `form` attaches it to the
          delivery form in the other column, so the button and `Enter` in any
          field raise the same event and travel one guarded path. A second
          `onClick` would run the whole validation twice per press for nothing.
        */}
        <button
          type="submit"
          form={formId}
          className="ready-made-checkout__submit"
          disabled={submitting}
        >
          {submitting ? summary.submitPending : summary.submit}
        </button>
        {submitting ? (
          <p className="ready-made-checkout__caption" role="status">
            {summary.submitPendingNotice}
          </p>
        ) : null}
      </section>
    </>
  );
}
