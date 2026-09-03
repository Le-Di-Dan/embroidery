import type { QuotationAcceptedResponse } from '@embroidery/api-client';

import { formatExactMoney } from '../../../shared/money/exact-money';
import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';

/**
 * The committed-acceptance block (`701:206`).
 *
 * ### What this block exists to *not* say
 *
 * Acceptance commits a price. It does not take a payment, create an order,
 * reserve stock or start production — all of that is APP7/APP8, behind guards
 * this checkpoint is nowhere near. So the copy states what the workshop will
 * actually do next (digitise the design) and then says plainly that no money
 * was collected and no order exists (`701:207`, `701:208`).
 *
 * The only figure shown is the one `APP6-B05` reported back: the exact accepted
 * total, copied off the frozen version row inside the accepting transaction and
 * never recomputed here.
 *
 * ### Replay is an honest success
 *
 * `replayed: true` means this acceptance was already recorded and nothing new
 * was written. That is a success and is rendered as one — with a line saying it
 * was recorded earlier, so a customer who pressed twice, or retried after a
 * dropped response, is never told they accepted twice (§19).
 */
export function AcceptedOutcome({ outcome }: { outcome: QuotationAcceptedResponse }) {
  return (
    <div className="secure-quotation__outcome secure-quotation__outcome--accepted" role="status">
      <p className="secure-quotation__outcome-title">{COPY.accepted.title}</p>
      <p className="secure-quotation__outcome-body">{COPY.accepted.body}</p>
      <dl className="secure-quotation__outcome-figure">
        <dt>{COPY.accepted.acceptedTotal}</dt>
        <dd>{formatExactMoney(outcome.acceptedTotalAmount, outcome.currencyCode)}</dd>
      </dl>
      {outcome.replayed ? (
        <p className="secure-quotation__outcome-note">{COPY.accepted.replayed}</p>
      ) : null}
    </div>
  );
}
